// Which parts of the document actually appear.
//
// An invoice is mostly optional. Almost every field on it is required by somebody and meaningless
// to somebody else — an HSN code is mandatory on an Indian tax invoice and noise on a UK one, a
// reverse-charge legend is required exactly when no tax is being charged for that specific reason,
// and a delivery note must show no prices at all.
//
// Rather than a screen of checkboxes, most of this is DERIVED: a field appears when the data or the
// tax regime calls for it. What is left is genuinely a preference and can be overridden per block.
// The rule of thumb is that anything a jurisdiction requires is derived, and anything that is
// taste is a setting.

import { documentKind } from './kinds.js';
import { languageOf, labels, localiseKind, fillLabel } from './lang.js';

/**
 * Work out what to show, from the draft and the settings together.
 *
 * `overrides` wins over everything, so the block editor can always force a field on or off, but
 * nothing is hidden by default that a document is legally required to carry.
 */
export function fieldsFor(draft, settings = {}, overrides = {}) {
  // The document's language decides every word below, and the kind is localised HERE so that the
  // screen, the PDF, the email and the plain text all read the same vocabulary from one place.
  const lang = languageOf(draft, settings);
  const L = labels(lang);
  const kind = localiseKind(documentKind(draft?.kind), lang);
  const totals = draft?.totals || {};
  const lines = draft?.lines || [];
  const money = settings.money || {};

  const money_ = kind.showsMoney;
  const itemised = kind.lineMode === 'items';

  // HSN / SAC codes: mandatory on an Indian tax invoice above a turnover threshold, absent
  // everywhere else. Shown when the data has them or the regime expects them, because a column of
  // blanks is worse than no column.
  const anyHsn = lines.some((l) => String(l.hsn || '').trim());
  const regimeWantsHsn = /^in-/.test(String(money.taxPreset || ''));
  // The column appears when the data carries codes, and ALSO when the regime requires them but the
  // data does not — because on an Indian tax invoice the missing code is the problem, and a column
  // of dashes is what makes that visible. `hsnMissing` lets the UI say so out loud.
  const showHsn = money_ && itemised && (anyHsn || regimeWantsHsn);
  const hsnMissing = showHsn && !anyHsn;

  // A per-line discount column only earns its width when something is actually discounted.
  const anyLineDiscount = lines.some((l) => Number(l.discountAmount) > 0);

  // Tax registration numbers. The sender's belongs on any document that charges tax. The client's
  // is required whenever the reason no tax is charged is that THEY are accounting for it.
  const charging = money_ && Number(totals.taxTotal) > 0;
  const exempt = !!totals.exempt;
  const showSenderTaxNumber = money_ && !!(draft?.sender?.taxNumber) && (charging || exempt);
  const showClientTaxNumber = money_ && !!(draft?.client?.taxNumber) && (charging || exempt);

  const out = {
    showMoney: money_,
    showQuantity: kind.lineMode !== 'documents',
    showUnitPrice: money_ && itemised,
    showAmount: money_,
    showTotals: money_ && kind.totalLabel != null,
    showTax: money_ && (charging || exempt),
    showHsn,
    hsnMissing,
    showUnit: lines.some((l) => String(l.unit || '').trim()),
    // The thumbnail column exists only when there is at least one thumbnail to put in it, so a
    // document without pictures is EXACTLY the document it was before pictures existed.
    showImages: itemised && lines.some((l) => l.image != null && l.image !== ''),
    showLineDiscount: money_ && itemised && anyLineDiscount,
    showSecondDate: !!kind.dateLabels.second,
    // A "Paid −" line and a balance are the arithmetic of a document that is still owed. On one
    // that is not — a receipt, a quote, a credit note — they turned a paid receipt into "Amount
    // paid £0.00", which is the one number a receipt must never show.
    showPaid: money_ && kind.demandsPayment && Number(totals.amountPaid) > 0,
    showSenderTaxNumber,
    showClientTaxNumber,
    showReference: !!String(draft?.reference || '').trim(),
    showTerms: !!String(draft?.terms || '').trim(),
    showNote: !!String(draft?.note || '').trim(),
    // Payment details belong on anything that asks for money, and nowhere else — printing bank
    // details on a receipt invites a second payment.
    showPaymentDetails: kind.demandsPayment && !!String(settings.paymentDetails || '').trim(),
    showSignature: !!overrides.showSignature,
    // The document this one refers to — the invoice a credit note corrects, the quote an invoice
    // was raised from. Shown whenever it is known, because that is the link an accounts department
    // matches on.
    showRelated: !!String(draft?.relatedTo || '').trim(),
    // A credit note that names the invoice it reverses says so in its legend; one that does not
    // keeps the general wording.
    legend: kind.id === 'credit_note' && String(draft?.relatedTo || '').trim()
      ? fillLabel(L.creditAgainst, { ref: String(draft.relatedTo).trim() })
      : kind.legend,
    kind,
    lang,
    L,
  };

  // Overrides last, so a deliberate choice always wins.
  return { ...out, ...stripUndefined(overrides) };
}

function stripUndefined(o) {
  const out = {};
  for (const [k, v] of Object.entries(o || {})) if (v !== undefined) out[k] = v;
  return out;
}

/**
 * The column layout of the lines table, as a list rather than a set of booleans.
 *
 * Returned in print order so the renderer builds its header and its rows from one source and they
 * cannot fall out of step — a table whose header says five columns and whose rows produce four is
 * the classic way this breaks.
 */
export function lineColumns(fields) {
  const kind = fields.kind;
  const C = (fields.L || labels('en')).columns;
  const cols = [{ id: 'description', label: C.description, numeric: false }];

  if (fields.showHsn) cols.push({ id: 'hsn', label: C.hsn, numeric: false });
  if (kind.lineMode === 'documents') {
    cols.push({ id: 'date', label: C.date, numeric: false });
    cols.push({ id: 'reference', label: C.reference, numeric: false });
    cols.push({ id: 'charge', label: C.charge, numeric: true });
    cols.push({ id: 'paid', label: C.paid, numeric: true });
    cols.push({ id: 'balance', label: C.balance, numeric: true });
    return cols;
  }

  if (fields.showQuantity) cols.push({ id: 'quantity', label: C.quantity, numeric: true });
  if (fields.showUnit) cols.push({ id: 'unit', label: C.unit, numeric: false });
  if (fields.showUnitPrice) cols.push({ id: 'unitPrice', label: C.unitPrice, numeric: true });
  if (fields.showLineDiscount) cols.push({ id: 'discount', label: C.discount, numeric: true });
  if (fields.showAmount) cols.push({ id: 'amount', label: C.amount, numeric: true });
  return cols;
}

/** The label for a total's row: the stored one if it was changed, else the language's word. */
export function totalLabels(fields, totals = {}) {
  const L = fields.L || labels('en');
  const stock = (v, english, word) => (v && v !== english ? v : word);
  return {
    subtotal: L.subtotal,
    discount: stock(totals.discounts?.[0]?.label, 'Discount', L.discount),
    shipping: stock(totals.shipping?.label, 'Shipping', L.shipping),
    total: fields.kind.id === 'credit_note' ? L.totalCredit : L.total,
    paid: L.paid,
  };
}
