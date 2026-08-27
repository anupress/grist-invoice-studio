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

import { el } from '../core/util.js';
import { formatMoney } from '../money/currency.js';
import { textInput, numberInput, button } from './ui.js';

/**
 * Build the grid.
 *
 * `onEdit` fires for a value change and must NOT rebuild the grid — the cursor is in it.
 * `onStructure` fires when a row is added, removed or moved, and must.
 */
export function renderLinesGrid(draft, { products, fields, onEdit, onStructure }) {
  const fmt = draft.format || { currency: draft.currency };
  const showHsn = !!fields.showHsn;

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

    const description = textInput(line.description, (v) => { line.description = v; onEdit(); }, {
      placeholder: 'What are you billing for?', ariaLabel: `Line ${index + 1} description`,
    });

    return el('div', { class: 'cmp-grid__row' + (showHsn ? ' has-hsn' : '') }, [
      products && products.length
        ? el('div', { class: 'cmp-grid__desc' }, [description, productPicker(products, (p) => {
            line.description = p.description || p.name || line.description;
            if (p.unitPrice != null) line.unitPrice = p.unitPrice;
            if (p.taxClass) line.taxClass = p.taxClass;
            if (p.hsn) line.hsn = p.hsn;
            onStructure();   // several fields at once — a rebuild is the honest way to show them
          })])
        : description,
      showHsn ? textInput(line.hsn, (v) => { line.hsn = v; onEdit(); }, { class: 'cmp-input--code', ariaLabel: 'HSN or SAC code' }) : null,
      numberInput(line.quantity, (v) => { line.quantity = v; recalcLine(); }, { ariaLabel: 'Quantity' }),
      numberInput(line.unitPrice, (v) => { line.unitPrice = v; recalcLine(); }, { ariaLabel: 'Unit price' }),
      amountCell,
      el('div', { class: 'cmp-grid__gutter' }, [
        button('', () => { move(draft.lines, index, -1); onStructure(); }, { icon: '↑', title: 'Move up', variant: 'ghost', disabled: index === 0 }),
        button('', () => { move(draft.lines, index, 1); onStructure(); }, { icon: '↓', title: 'Move down', variant: 'ghost', disabled: index === draft.lines.length - 1 }),
        button('', () => { draft.lines.splice(index, 1); if (!draft.lines.length) draft.lines.push(blankLine()); onStructure(); },
          { icon: '×', title: 'Remove this line', variant: 'ghost' }),
      ]),
    ]);
  });

  return el('div', { class: 'cmp-grid' }, [
    head,
    ...rows,
    el('div', { class: 'cmp-grid__foot' }, [
      button('Add a line', () => { draft.lines.push(blankLine()); onStructure(); }, { icon: '+', variant: 'ghost' }),
    ]),
  ]);
}

export const blankLine = () => ({ description: '', quantity: 1, unitPrice: 0, amount: 0, taxClass: '', hsn: '', unit: '' });

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
