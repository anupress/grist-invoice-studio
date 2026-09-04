// The line-item editor.
//
// The part of the composer people spend their time in, so it is built to be typed through: every
// cell is an input, tab moves along the row, and nothing rebuilds while you are in it. The amount
// column is the exception — it is computed, read-only, and updates as you type, because a person
// filling in a quantity and a price wants to see the line total agree before they move on.
//
// A product picker sits on the description when the document has a catalogue. Choosing from it
// fills the description, the unit price and the tax class in one action; the fields stay editable
// afterwards, because the price on a particular job is not always the price in the catalogue.

import { el, toast } from '../core/util.js';
import { formatMoney } from '../money/currency.js';
import { textInput, numberInput, button } from './ui.js';

/**
 * Build the grid.
 *
 * `onEdit` fires for a value change and must NOT rebuild the grid — the cursor is in it.
 * `onStructure` fires when a row is added, removed or moved, and must.
 */
export function renderLinesGrid(draft, { products, fields, onEdit, onStructure, onAddProduct }) {
  const fmt = draft.format || { currency: draft.currency };
  const showHsn = !!fields.showHsn;
  // One datalist for the whole grid: the browser shows catalogue names as the description is
  // typed, and landing exactly on one fills the rest of the line. The id is per-render because
  // two grids on one page (a rebuild mid-flight) must not share stale options.
  const dlId = products && products.length ? 'cmp-cat-' + Math.random().toString(36).slice(2, 8) : null;

  const head = el('div', { class: 'cmp-grid__head' + (showHsn ? ' has-hsn' : '') }, [
    el('span', { text: 'Description' }),
    showHsn ? el('span', { text: 'HSN/SAC' }) : null,
    el('span', { class: 'is-num', text: 'Qty' }),
    el('span', { class: 'is-num', text: 'Unit price' }),
    el('span', { class: 'is-num', text: 'Amount' }),
    el('span', { class: 'cmp-grid__gutter' }),
  ]);

  const rows = (draft.lines || []).map((line, index) => {
    const amountCell = el('span', { class: 'cmp-grid__amount', text: formatMoney(line.amount, fmt) });

    // Recompute the line as it is typed. A stored amount is only honoured until somebody edits the
    // quantity or the price — at that point they plainly mean the multiplication.
    const recalcLine = () => {
      line.amount = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
      amountCell.textContent = formatMoney(line.amount, fmt);
      onEdit();
    };

    // The other cells are filled in place when a catalogue item lands, so nothing rebuilds while
    // the cursor is in the row.
    const hsnInput = showHsn ? textInput(line.hsn, (v) => { line.hsn = v; onEdit(); }, { class: 'cmp-input--code', ariaLabel: 'HSN or SAC code' }) : null;
    const qtyInput = numberInput(line.quantity, (v) => { line.quantity = v; recalcLine(); }, { ariaLabel: 'Quantity' });
    const priceInput = numberInput(line.unitPrice, (v) => { line.unitPrice = v; recalcLine(); }, { ariaLabel: 'Unit price' });

    const fill = (p) => {
      if (p.unitPrice != null) { line.unitPrice = p.unitPrice; priceInput.value = String(p.unitPrice); }
      if (p.taxClass) line.taxClass = p.taxClass;
      if (p.hsn) { line.hsn = p.hsn; if (hsnInput) hsnInput.value = p.hsn; }
      if (p.image != null) line.image = p.image;
      recalcLine();
    };

    const description = textInput(line.description, (v) => {
      line.description = v;
      // Three or more typed characters that land exactly on a catalogue name fill the rest of the
      // line — with the datalist offering the names, typing "con" and clicking the suggestion is
      // the whole gesture. Only an exact match fills anything: a prefix guess that overwrote a
      // price mid-type would be worse than no help.
      if (dlId && v.trim().length >= 3) {
        const hit = products.find((p) => (p.name || p.description || '').toLowerCase() === v.trim().toLowerCase());
        if (hit) fill(hit);
      }
      onEdit();
    }, {
      placeholder: 'What are you billing for?', ariaLabel: `Line ${index + 1} description`,
    });
    if (dlId) description.setAttribute('list', dlId);

    // Typed rather than picked. The merge waits for the field to be left — rebuilding the grid
    // under a cursor that is still in it would be worse than the duplicate.
    description.addEventListener('change', () => {
      const typed = description.value.trim();
      if (!typed) return;
      const res = mergeIntoExisting(draft, index, typed, line.unitPrice);
      if (res && res.merged) {
        toast(`${typed} was already on this document \u2014 now ${res.quantity}.`, 'ok');
        onStructure();
      } else if (res && res.blocked) {
        toast(`${typed} is already on this document at ${formatMoney(res.price, fmt)}. This line keeps its own price.`, 'warn');
      }
    });

    return el('div', { class: 'cmp-grid__row' + (showHsn ? ' has-hsn' : '') }, [
      products && products.length
        ? el('div', { class: 'cmp-grid__desc' }, [description, productPicker(products, (p) => {
            const name = p.description || p.name || line.description;
            // Already on the document? Then this is one more of it, not another line.
            const res = mergeIntoExisting(draft, index, name, p.unitPrice != null ? p.unitPrice : line.unitPrice);
            if (res && res.merged) {
              toast(`${name} was already on this document \u2014 now ${res.quantity}.`, 'ok');
              onStructure();
              return;
            }
            if (res && res.blocked) {
              toast(`${name} is already on this document at ${formatMoney(res.price, fmt)}. This line keeps its own price.`, 'warn');
            }
            line.description = name;
            description.value = name;
            fill(p);
          })])
        : description,
      hsnInput,
      qtyInput,
      priceInput,
      amountCell,
      el('div', { class: 'cmp-grid__gutter' }, [
        // A line typed by hand becomes a catalogue item in one press, priced as it was typed. That
        // is how most catalogues are built: one invoice at a time, not planned in advance.
        onAddProduct ? button('', () => {
          const name = String(line.description || '').trim();
          if (!name) { onAddProduct(null, 'Type a description first.'); return; }
          const known = (products || []).some((p) => (p.name || p.description || '').toLowerCase() === name.toLowerCase());
          if (known) { onAddProduct(null, `${name} is already in the catalogue.`); return; }
          onAddProduct({ name, unitPrice: Number(line.unitPrice) || 0, unit: line.unit || '', taxClass: line.taxClass || '', hsn: line.hsn || '' });
        }, { icon: '☆', title: 'Add this line to the catalogue', variant: 'ghost' }) : null,
        button('', () => { move(draft.lines, index, -1); onStructure(); }, { icon: '↑', title: 'Move up', variant: 'ghost', disabled: index === 0 }),
        button('', () => { move(draft.lines, index, 1); onStructure(); }, { icon: '↓', title: 'Move down', variant: 'ghost', disabled: index === draft.lines.length - 1 }),
        button('', () => { draft.lines.splice(index, 1); if (!draft.lines.length) draft.lines.push(blankLine()); onStructure(); },
          { icon: '×', title: 'Remove this line', variant: 'ghost' }),
      ]),
    ]);
  });

  return el('div', { class: 'cmp-grid' }, [
    dlId ? el('datalist', { id: dlId }, products.map((p) => el('option', { value: p.name || p.description || '' }))) : null,
    head,
    ...rows,
    el('div', { class: 'cmp-grid__foot' }, [
      button('Add a line', () => { draft.lines.push(blankLine()); onStructure(); }, { icon: '+', variant: 'ghost' }),
    ]),
  ]);
}

export const blankLine = () => ({ description: '', quantity: 1, unitPrice: 0, amount: 0, taxClass: '', hsn: '', unit: '' });

const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const pence = (l) => Math.round((Number(l.unitPrice) || 0) * 100);

/**
 * The same thing, twice, on one document.
 *
 * A grid with a quantity column should never produce "Wool throw, sage x2" above "Wool throw,
 * sage x1": it reads as a mistake, whoever receives it queries it, and the second line exists
 * only because the first was not noticed. So choosing something already on the document adds to
 * its line instead of starting another.
 *
 * The price has to agree. The same product at two prices is a real document — a second unit at a
 * discount, an hour billed at a different rate — and folding those together would quietly change
 * what is being charged. When they differ the line stays, and the reason is said out loud.
 *
 * Returns null when there is nothing to merge with, `{ blocked, price }` when the prices disagree,
 * or `{ merged, line, quantity }` when the two lines became one.
 */
export function mergeIntoExisting(draft, index, name, unitPrice) {
  const lines = draft.lines || [];
  const at = lines.findIndex((l, i) => i !== index && same(l.description, name));
  if (at === -1) return null;

  const target = lines[at];
  const price = Math.round((Number(unitPrice) || 0) * 100);
  if (pence(target) !== price) return { blocked: true, price: Number(target.unitPrice) || 0 };

  target.quantity = (Number(target.quantity) || 0) + (Number(lines[index].quantity) || 1);
  target.amount = target.quantity * (Number(target.unitPrice) || 0);
  lines.splice(index, 1);
  if (!lines.length) lines.push(blankLine());
  return { merged: true, line: target, quantity: target.quantity };
}

/** Which lines bill something an earlier line already bills, at the same price. */
export function duplicateLines(draft) {
  const seen = new Set();
  const out = [];
  (draft.lines || []).forEach((l, i) => {
    const name = String(l.description || '').trim().toLowerCase();
    if (!name) return;
    const key = name + '|' + pence(l);
    if (seen.has(key)) out.push(i); else seen.add(key);
  });
  return out;
}

/**
 * Fold every duplicate into the first line that bills it, adding the quantities.
 *
 * For a document that already has them — one saved before this rule existed, or one built in the
 * table next door. The FIRST line is the one kept, so saving updates that row and removes the
 * other rather than rewriting both.
 */
export function combineDuplicates(draft) {
  const first = new Map();
  const kept = [];
  let merged = 0;
  for (const line of draft.lines || []) {
    const name = String(line.description || '').trim().toLowerCase();
    if (!name) { kept.push(line); continue; }
    const key = name + '|' + pence(line);
    const target = first.get(key);
    if (target) {
      target.quantity = (Number(target.quantity) || 0) + (Number(line.quantity) || 0);
      target.amount = target.quantity * (Number(target.unitPrice) || 0);
      merged++;
      continue;
    }
    first.set(key, line);
    kept.push(line);
  }
  draft.lines = kept.length ? kept : [blankLine()];
  return merged;
}

function move(list, from, delta) {
  const to = from + delta;
  if (to < 0 || to >= list.length) return;
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);
}

/**
 * The catalogue chooser.
 *
 * A `select` rather than a search box: a product list in a small business is tens of items, not
 * thousands, and a native select is searchable by typing, keyboard-operable and needs no code. It
 * resets to its placeholder after each choice so it reads as an action rather than a state.
 */
function productPicker(products, onPick) {
  const sel = el('select', { class: 'cmp-input cmp-input--picker', 'aria-label': 'Choose from your products' }, [
    el('option', { value: '', text: 'From catalogue…' }),
    ...products.map((p, i) => el('option', { value: String(i), text: p.label })),
  ]);
  sel.addEventListener('change', () => {
    const p = products[Number(sel.value)];
    sel.value = '';
    if (p) onPick(p);
  });
  return sel;
}
