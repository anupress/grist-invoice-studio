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
import { LANGUAGES, normaliseLanguage } from '../doc/lang.js';
import { renderRecordForm } from './record-form.js';


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
  const locked = !!ctx.locked;
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
    button('Save', () => actions.save(), { variant: 'primary', disabled: !canWrite || locked }),
  ]);

  // ---- who and when ---------------------------------------------------------------------------
  // A client can be added without leaving the invoice: the last entry of the picker opens the
  // same form the Clients list uses, and saving selects the new client here.
  const newClientHost = el('div', { class: 'cmp-inline' });
  const canAddClient = !!(ctx.clientForm && actions.addClient);
  const openNewClient = () => {
    newClientHost.replaceChildren(renderRecordForm({
      kind: 'client', compact: true, canWrite,
      roles: ctx.clientForm.roles, columns: ctx.clientForm.columns,
      values: { name: '', email: '', phone: '', street1: '', street2: '', city: '', state: '', postcode: '', country: ctx.clientForm.defaultCountry || '', taxNumber: '', language: '' },
      onSave: async (values) => {
        const res = await actions.addClient(values);
        if (res.ok) {
          draft.clientRef = res.client.id;
          draft.client = { ...res.client.party };
          onRebuild();
        }
        return res;
      },
      onCancel: () => { newClientHost.replaceChildren(); if (clientControl.tagName === 'SELECT') clientControl.value = draft.clientRef != null ? String(draft.clientRef) : ''; },
    }));
  };
  const clientControl = (clients && clients.length) || canAddClient
    ? selectInput(
        [
          { value: '', label: '— choose a client —' },
          ...(clients || []).map((c) => ({ value: String(c.id), label: c.name })),
          ...(canAddClient ? [{ value: '__new__', label: '+ New client…' }] : []),
        ],
        draft.clientRef != null ? String(draft.clientRef) : '',
        (v) => {
          if (v === '__new__') { openNewClient(); return; }
          const chosen = (clients || []).find((c) => String(c.id) === v);
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
    // A text input with the document's own statuses as suggestions, not a fixed list: a business
    // that works in "Awaiting approval" gets to say so, and saving registers the new status on the
    // column's choices so Grist stops treating it as a stranger.
    field('Status', (() => {
      const input = textInput(draft.status || 'Draft', (v) => { draft.status = v; onEdit(); }, { ariaLabel: 'Status' });
      const options = ctx.statuses && ctx.statuses.length ? ctx.statuses : ['Draft', 'Sent', 'Part paid', 'Paid', 'Overdue', 'Cancelled'];
      const dlId = 'cmp-status-' + Math.random().toString(36).slice(2, 8);
      input.setAttribute('list', dlId);
      return el('div', { class: 'cmp-grid__desc' }, [input, el('datalist', { id: dlId }, options.map((s) => el('option', { value: s })))]);
    })(), 'Pick one or type your own — a new status joins the document\u2019s choices when you save.'),
    field('Their reference', textInput(draft.reference, (v) => { draft.reference = v; onEdit(); }, { placeholder: 'PO number' })),
    // The words on the document — Invoice or Rechnung, Due or Fällig am. Empty follows the client
    // record's language, then the business default in Settings → Document.
    field('Language', selectInput(
      [{ value: '', label: followLabel(draft, settings) }, ...LANGUAGES.map((l) => ({ value: l.id, label: l.label }))],
      normaliseLanguage(draft.language),
      (v) => { draft.language = v; onEdit(); }, { ariaLabel: 'Document language' }),
      'Only the document’s own words change; what you type stays as you typed it.'),
    // The document this one corrects or follows. Filled in automatically when a credit note is
    // raised from an invoice; editable because a correction can also refer to something older.
    (draft.kind === 'credit_note' || draft.relatedTo)
      ? field('Refers to', textInput(draft.relatedTo, (v) => { draft.relatedTo = v; onEdit(); }, { placeholder: 'Invoice INV-2026-0007' }),
        draft.kind === 'credit_note' ? 'The invoice this credit note reverses. Named on the document, so both sides can match them.' : null)
      : null,
  ], { grid: true });

  // ---- lines -----------------------------------------------------------------------------------
  const gridHost = el('div');
  const buildGrid = () => gridHost.replaceChildren(renderLinesGrid(draft, {
    products, fields, onEdit: edited, onStructure: onRebuild,
    onAddProduct: actions.addProduct || null,
  }));
  buildGrid();

  // ---- money -----------------------------------------------------------------------------------
  const moneyBits = kind.showsMoney ? section('Money', [
    field('Discount', numberInput(draft.discountAmount, (v) => { draft.discountAmount = v; edited(); }, { ariaLabel: 'Order discount' })),
    field('Shipping', numberInput(draft.shippingAmount, (v) => { draft.shippingAmount = v; edited(); }, { ariaLabel: 'Shipping charge' })),
    field('Already paid', numberInput(draft.amountPaid, (v) => { draft.amountPaid = v; edited(); }, { ariaLabel: 'Amount already paid' })),
    field('Currency', textInput(draft.currency, (v) => {
      draft.currency = v.toUpperCase();
      // Empty falls back to the business currency, so clearing this field is how a document
      // stops overriding it.
      draft.format = { ...draft.format, currency: draft.currency || settings.money?.currency || 'USD' };
      edited();
    }, { placeholder: settings.money?.currency || 'USD', class: 'cmp-input--code' }),
      'Empty follows your business currency. Type one only when this document is billed in another.'),
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

  // Everything a person types into, in one box, so the lock can hold all of it at once.
  const form = el('div', { class: 'cmp-form' + (locked ? ' is-locked' : '') }, [
    details,
    newClientHost,
    section(kind.showsMoney ? 'Lines' : 'Items', [gridHost]),
    kind.showsMoney ? el('div', { class: 'cmp-moneyrow' }, [moneyBits, totalsBox]) : null,
    words,
  ]);
  if (locked) for (const n of form.querySelectorAll('input, select, textarea, button')) n.disabled = true;

  return el('div', { class: 'cmp' }, [
    toolbar,
    !canWrite ? accessNotice(live) : null,
    locked ? lockNotice(draft, kind, conversions, actions) : null,
    skippedNotice(ctx.skipped),
    form,
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
/** What "follow" means for this document, said in the dropdown rather than left to be guessed. */
function followLabel(draft, settings) {
  const client = normaliseLanguage(draft.client?.language);
  const name = (id) => (LANGUAGES.find((l) => l.id === id) || {}).label || id;
  if (client) return `Client’s language (${name(client)})`;
  const def = normaliseLanguage(settings.language) || 'en';
  return `Your default (${name(def)})`;
}

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
 * An issued document, and what to do instead of editing it.
 *
 * The buttons ARE the advice: a credit note is the correction the law expects, a duplicate is how
 * a similar document starts, and editing anyway is a choice a person makes knowingly rather than
 * a default they fall into.
 */
function lockNotice(draft, kind, conversions, actions) {
  const canCredit = conversions.some((k) => k.id === 'credit_note');
  return el('div', { class: 'cmp-notice cmp-notice--lock' }, [
    el('strong', { text: `This ${kind.label.toLowerCase()} has been issued, so it opens read-only.` }),
    el('p', { text: 'Once a document has gone out, most jurisdictions require that it not be altered: a change is made with a credit note that refers to it, or a fresh document. Settings → Document can turn this off.' }),
    el('div', { class: 'cmp-notice__row' }, [
      canCredit ? button('Make a credit note', () => actions.convert('credit_note'), { variant: 'primary' }) : null,
      draft.rowId != null ? button('Duplicate as new', () => actions.duplicate()) : null,
      button('Edit anyway', () => actions.unlock(), { variant: 'ghost' }),
    ]),
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
