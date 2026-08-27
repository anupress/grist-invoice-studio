// The composer: the writeable pane above the document.
//
// The interaction it is built around is "type on the left, watch the document build itself below".
// So editing a value never rebuilds the form — it updates the draft, recomputes the totals and
// redraws the preview, leaving the cursor where it was. Only structural changes (adding a line,
// starting a new document, converting one) rebuild, and by then the focus is on a button anyway.
//
// Nothing here writes to Grist. It builds a draft; model/write.js turns that into a plan and
// grist/writer.js carries it out, so the part that can damage somebody's document stays testable
// and stays somewhere a person can be shown it before it happens.

import { el } from '../core/util.js';
import { formatMoney } from '../money/currency.js';
import { documentKind, DOCUMENT_KINDS, conversionsFor } from '../doc/kinds.js';
import { fieldsFor } from '../doc/fields.js';
import { renderLinesGrid, blankLine } from './lines-grid.js';
import { field, textInput, numberInput, textArea, selectInput, button, section } from './ui.js';

const STATUSES = ['Draft', 'Sent', 'Part paid', 'Paid', 'Overdue', 'Cancelled'];

/**
 * Build the composer.
 *
 * `ctx` carries everything it reads and every action it can ask for:
 *   draft      the document being edited, mutated in place
 *   schema     how this document holds invoices
 *   clients    [{ id, name, party }] for the picker
 *   products   catalogue options, or []
 *   settings   sender, money, layout
 *   onEdit     a value changed — recompute and redraw the preview, do NOT rebuild
 *   onRebuild  structure changed — rebuild the composer
 *   actions    { save, newDoc, duplicate, convert }
 */
export function renderComposer(ctx) {
  const { draft, clients, products, settings, onEdit, onRebuild, actions, live, canWrite, planSummary } = ctx;
  const kind = documentKind(draft.kind);
  const fields = fieldsFor(draft, settings);
  const fmt = draft.format || { currency: draft.currency };

  // The totals summary is the one part of the form that changes as you type, so it is held by
  // reference and repainted rather than rebuilt with everything around it.
  const totalsBox = el('div', { class: 'cmp-totals' });
  const paintTotals = () => {
    const t = draft.totals || {};
    totalsBox.replaceChildren(...[
      row('Subtotal', formatMoney(t.subtotal, fmt)),
      t.discountTotal ? row('Discount', '−' + formatMoney(t.discountTotal, fmt)) : null,
      t.shipping?.amount ? row('Shipping', formatMoney(t.shipping.amount, fmt)) : null,
      ...(t.taxLines || []).map((l) => row(l.rate != null ? `${l.name} ${Number(l.rate)}%` : l.name, formatMoney(l.amount, fmt))),
      t.exempt ? el('div', { class: 'cmp-totals__note', text: t.exempt.reason }) : null,
      row('Total', formatMoney(t.total, fmt), 'is-grand'),
      t.amountPaid ? row('Balance', formatMoney(t.balance, fmt), 'is-grand') : null,
    ].filter(Boolean));
  };
  const edited = () => { onEdit(); paintTotals(); };

  // ---- toolbar --------------------------------------------------------------------------------
  const conversions = conversionsFor(draft.kind);
  const toolbar = el('div', { class: 'cmp-bar' }, [
    el('div', { class: 'cmp-bar__title' }, [
      el('strong', { text: draft.rowId == null ? `New ${kind.label.toLowerCase()}` : `Editing ${kind.word.toLowerCase()} ${draft.number || ''}`.trim() }),
      planSummary ? el('span', { class: 'cmp-bar__plan', text: planSummary }) : null,
    ]),
    el('div', { class: 'cmp-bar__spacer' }),
    button('New', () => actions.newDoc(), { icon: '+' }),
    draft.rowId != null ? button('Duplicate', () => actions.duplicate()) : null,
    ...conversions.map((k) => button(`Make ${k.label.toLowerCase()}`, () => actions.convert(k.id))),
    button('Save', () => actions.save(), { variant: 'primary', disabled: !canWrite }),
  ]);

  // ---- who and when ---------------------------------------------------------------------------
  const clientControl = clients && clients.length
    ? selectInput(
        [{ value: '', label: '— choose a client —' }, ...clients.map((c) => ({ value: String(c.id), label: c.name }))],
        draft.clientRef != null ? String(draft.clientRef) : '',
        (v) => {
          const chosen = clients.find((c) => String(c.id) === v);
          // Choosing a client fills in the address, the email and the tax number in one go — the
          // whole reason a client table exists is not to type them again on every invoice.
          draft.clientRef = chosen ? chosen.id : null;
          draft.client = chosen ? { ...chosen.party } : { name: '' };
          if (chosen?.party?.terms && !draft.terms) draft.terms = chosen.party.terms;
          onRebuild();
        },
        { ariaLabel: 'Client' })
    : textInput(draft.client?.name, (v) => { draft.client = { ...draft.client, name: v }; edited(); }, { placeholder: 'Client name' });

  const details = section('Document', [
    field('Number', textInput(draft.number, (v) => { draft.number = v; onEdit(); }, {
      placeholder: draft.rowId == null ? 'Assigned when you save' : '',
    }), draft.rowId == null ? 'Left blank, the next number in your sequence is used.' : null),
    field('Kind', selectInput(DOCUMENT_KINDS.map((k) => ({ value: k.id, label: k.label })), draft.kind,
      (v) => { draft.kind = v; onRebuild(); })),
    field('Client', clientControl),
    field(kind.dateLabels.issued, textInput(draft.issued, (v) => { draft.issued = v; onEdit(); }, { type: 'date' })),
    fields.showSecondDate
      ? field(kind.dateLabels.second, textInput(draft.due, (v) => { draft.due = v; onEdit(); }, { type: 'date' }))
      : null,
    field('Status', selectInput(STATUSES.map((s) => ({ value: s, label: s })), draft.status || 'Draft',
      (v) => { draft.status = v; onEdit(); })),
    field('Their reference', textInput(draft.reference, (v) => { draft.reference = v; onEdit(); }, { placeholder: 'PO number' })),
  ], { grid: true });

  // ---- lines -----------------------------------------------------------------------------------
  const gridHost = el('div');
  const buildGrid = () => gridHost.replaceChildren(renderLinesGrid(draft, {
    products, fields, onEdit: edited, onStructure: onRebuild,
  }));
  buildGrid();

  // ---- money -----------------------------------------------------------------------------------
  const moneyBits = kind.showsMoney ? section('Money', [
    field('Discount', numberInput(draft.discountAmount, (v) => { draft.discountAmount = v; edited(); }, { ariaLabel: 'Order discount' })),
    field('Shipping', numberInput(draft.shippingAmount, (v) => { draft.shippingAmount = v; edited(); }, { ariaLabel: 'Shipping charge' })),
    field('Already paid', numberInput(draft.amountPaid, (v) => { draft.amountPaid = v; edited(); }, { ariaLabel: 'Amount already paid' })),
    field('Currency', textInput(draft.currency, (v) => {
      draft.currency = v.toUpperCase();
      draft.format = { ...draft.format, currency: draft.currency };
      edited();
    }, { placeholder: 'GBP', class: 'cmp-input--code' })),
    // The escape hatch. Most documents want the rate table; occasionally the answer is simply a
    // figure — an accountant has given one, or an old invoice is being reproduced — and fighting
    // the arithmetic to make a rate produce it is worse than accepting the figure.
    field('Tax on this one', textInput(draft.taxAmount == null ? '' : String(draft.taxAmount), (v) => {
      draft.taxAmount = v.trim() === '' ? null : Number(v);
      edited();
    }, { placeholder: 'worked out for you' }),
      draft.taxAmount == null ? 'Leave blank and the tax is calculated.' : 'Overrides the calculation for this document only.'),
  ], { grid: true }) : null;

  const words = section('Wording', [
    field('Payment terms', textInput(draft.terms, (v) => { draft.terms = v; onEdit(); }, { placeholder: 'Net 30' })),
    field('Note on the document', textArea(draft.note, (v) => { draft.note = v; onEdit(); }, { rows: 2 })),
  ], { grid: true });

  paintTotals();

  return el('div', { class: 'cmp' }, [
    toolbar,
    !canWrite ? accessNotice(live) : null,
    skippedNotice(ctx.skipped),
    details,
    section(kind.showsMoney ? 'Lines' : 'Items', [gridHost]),
    kind.showsMoney ? el('div', { class: 'cmp-moneyrow' }, [moneyBits, totalsBox]) : null,
    words,
  ]);

  function row(label, value, cls) {
    return el('div', { class: 'cmp-totals__row' + (cls ? ' ' + cls : '') }, [
      el('span', { text: label }), el('span', { class: 'is-num', text: value }),
    ]);
  }
}

/**
 * What this document cannot keep, listed rather than counted.
 *
 * Every one of these is a field a person can see on screen and fill in, which will not survive
 * being saved — because the column is a formula, because there is no column for it, or because the
 * value does not fit the column's type. A count in a toast is not enough: "8 fields had nowhere to
 * go" tells somebody they have a problem without telling them which of their work is about to be
 * lost. Shown before saving, not after.
 */
function skippedNotice(skipped) {
  const items = (skipped || []).filter((s) => s.where === 'invoice');
  if (!items.length) return null;
  return el('details', { class: 'cmp-skipped' }, [
    el('summary', { text: `${items.length} field${items.length === 1 ? '' : 's'} on this form cannot be saved into this document` }),
    el('ul', {}, items.map((s) => el('li', {}, [
      el('strong', { text: s.role }),
      el('span', { text: ` — ${s.reason}` }),
    ]))),
    el('p', { text: 'Upgrade this document, above, adds columns for most of these.' }),
  ]);
}

/**
 * Why Save is unavailable, said plainly.
 *
 * A disabled button with no explanation is the worst version of this: a viewer without write access
 * would fill in a whole invoice and only then find out it could not be kept.
 */
function accessNotice(live) {
  return el('div', { class: 'cmp-notice' }, [
    el('strong', { text: live ? 'Editing is not enabled yet.' : 'This is the demo document.' }),
    el('p', {
      text: live
        ? 'Saving writes into your Grist tables, which needs full access. Use Enable editing above, and Grist will ask you to allow it.'
        : 'Everything works here, including saving — but it only changes the sample document in this browser tab, and nothing is stored.',
    }),
  ]);
}

export { blankLine };
