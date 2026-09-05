// The draft: one shape for a document, whether or not it exists yet.
//
// A document being composed and a document read back out of a table are the same thing as far as
// everything downstream is concerned. Giving them one shape is what lets the composer in phase 3
// preview through the identical renderer rather than a second, nearly-identical one that slowly
// disagrees about what a total is.
//
// Everything here is plain data. No provider, no schema, no Grist — resolve.js is what knows how to
// get from a row to one of these, and the composer will build one directly.

import { documentKind } from '../doc/kinds.js';
import { isLayout } from '../doc/layouts.js';
import { computeTotals } from '../money/totals.js';
import { reverseChargeApplies } from '../money/tax/rates.js';
import { labels, languageOf } from '../doc/lang.js';

const text = (v) => String(v == null ? '' : v).trim();
const num = (v, fallback = 0) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isFinite(n) ? n : fallback;
};

/** A party — sender, client or delivery address — with every field present and a string. */
export function normaliseParty(p = {}) {
  return {
    name: text(p.name),
    street1: text(p.street1),
    street2: text(p.street2),
    city: text(p.city),
    state: text(p.state),
    postcode: text(p.postcode),
    country: text(p.country),
    email: text(p.email),
    phone: text(p.phone),
    taxNumber: text(p.taxNumber),
    website: text(p.website),
    // The language this party reads. On a client it decides the document's words; see doc/lang.js.
    language: text(p.language),
    logoData: p.logoData || null,
    logoJpeg: p.logoJpeg || null,   // the flattened copy the PDF embeds; see settings/defaults.js
    // The sender's ways of being paid and its legal footer, carried on the party so a document
    // resolved from a row and one composed from scratch print the same foot.
    iban: text(p.iban),
    bic: text(p.bic),
    accountHolder: text(p.accountHolder),
    upiId: text(p.upiId),
    paymentLink: text(p.paymentLink),
    legalText: text(p.legalText),
    // Kept so a resolver can report that it could not find the client at all, which is different
    // from finding one with an empty name.
    found: p.found !== false,
  };
}

/** One billable line. */
export function normaliseLine(l = {}, index = 0) {
  const quantity = num(l.quantity, 1);
  const unitPrice = num(l.unitPrice, 0);
  return {
    id: l.id != null ? l.id : index + 1,
    // The table row this line came from, so saving updates it rather than deleting every line and
    // adding them all back — which works, but churns the document's history and changes row ids
    // that other things may point at.
    rowId: l.rowId != null ? l.rowId : undefined,
    description: text(l.description),
    quantity,
    unitPrice,
    // A stored amount wins over the multiplication — see resolve.js for why.
    amount: l.amount != null && l.amount !== '' ? num(l.amount) : quantity * unitPrice,
    taxClass: text(l.taxClass),
    hsn: text(l.hsn),
    unit: text(l.unit),
    discountAmount: num(l.discountAmount, 0),
    // Raw on purpose — an Attachments cell is a list-tuple whose id the renderer resolves.
    image: l.image ?? null,
    itemised: l.itemised !== false,
    // Statement rows carry documents rather than items; harmless on an ordinary line.
    date: text(l.date),
    reference: text(l.reference),
    charge: l.charge == null ? null : num(l.charge),
    paid: l.paid == null ? null : num(l.paid),
    balance: l.balance == null ? null : num(l.balance),
  };
}

/**
 * Fill in whatever a partial draft is missing.
 *
 * Defensive on purpose: this is the boundary between "some object somebody built" and every
 * renderer, exporter and email template downstream, and a missing field here becomes `undefined`
 * printed on a document.
 */
export function normaliseDraft(d = {}) {
  const kind = documentKind(d.kind);
  const lines = (Array.isArray(d.lines) ? d.lines : []).map(normaliseLine);
  return {
    kind: kind.id,
    layout: isLayout(d.layout) ? d.layout : 'classic',
    rowId: d.rowId != null ? d.rowId : null,
    number: text(d.number),
    numberIsDerived: !!d.numberIsDerived,
    issued: text(d.issued),
    due: text(d.due),
    // When the work was done or the goods delivered. German law asks for it on every invoice
    // (§ 14 UStG), and an XRechnung is rejected without a delivery date or a period; the
    // e-invoice falls back to the issue date when it is empty, the printed document says nothing.
    serviceDate: text(d.serviceDate),
    status: text(d.status),
    reference: text(d.reference),
    terms: text(d.terms),
    note: text(d.note),
    // The document's own language, when one was chosen for it; empty follows the client, then
    // the business default.
    language: text(d.language),
    // The document this one corrects or follows — "Invoice INV-2026-0007" on a credit note.
    relatedTo: text(d.relatedTo),
    // Money the document carries in its own right, rather than on a line: an order-level discount,
    // a delivery charge, and whatever has already been paid against it.
    discountAmount: num(d.discountAmount, 0),
    discountLabel: text(d.discountLabel),
    shippingAmount: num(d.shippingAmount, 0),
    amountPaid: num(d.amountPaid, 0),
    clientRef: d.clientRef == null ? null : d.clientRef,
    // Sending is something that happened to this document, and it has to be remembered.
    // A flat tax figure typed on this one document, when the answer is not a rate at all.
    taxAmount: d.taxAmount == null || d.taxAmount === '' ? null : num(d.taxAmount),
    taxName: text(d.taxName),
    sentAt: text(d.sentAt),
    sentTo: text(d.sentTo),
    // Empty is a real state, not a gap to fill: it means "the business currency, whatever that
    // is set to". Forcing 'USD' here was how every draft became permanently dollar-fixed the
    // moment it existed, and why changing the currency setting visibly did nothing.
    currency: text(d.currency),
    format: d.format || { currency: text(d.currency) || 'USD' },
    sender: normaliseParty(d.sender),
    client: normaliseParty(d.client),
    shipTo: d.shipTo ? normaliseParty(d.shipTo) : null,
    lines,
    itemised: lines.some((l) => l.itemised),
    totals: d.totals || emptyTotals(text(d.currency) || 'USD'),
  };
}

function emptyTotals(currency) {
  return {
    currency, decimals: 2, lines: [], subtotal: 0, discountTotal: 0, discounts: [],
    shipping: { amount: 0, label: 'Shipping', tax: 0 }, taxLines: [], taxDetail: [], taxTotal: 0,
    exempt: null, total: 0, amountPaid: 0, balance: 0, notes: [],
  };
}

/**
 * A blank document of a given kind, ready to be filled in.
 *
 * Dated today and issued by whoever the settings say we are, because a composer that opens with an
 * empty date and an empty sender is asking the user to retype two things it already knows.
 */
export function emptyDraft(kindId = 'invoice', settings = {}) {
  const today = new Date().toISOString().slice(0, 10);
  return normaliseDraft({
    kind: kindId,
    layout: settings.layout || 'classic',
    issued: today,
    status: 'Draft',
    // No stamped currency: a new document follows the business setting until somebody types a
    // currency on it deliberately. Stamping the current setting turns a default into an override
    // that outlives every later change of mind.
    currency: '',
    format: { ...(settings.money?.format || {}), currency: settings.money?.currency || 'USD' },
    sender: settings.sender || {},
    lines: [{}],
  });
}

/** An address in the shape the tax engine matches on, with a settings fallback for the country. */
function addressOf(party = {}, fallbackCountry) {
  return {
    country: party.country || fallbackCountry || '',
    state: party.state || '',
    postcode: party.postcode || '',
    city: party.city || '',
  };
}

/**
 * Work out this draft's figures.
 *
 * The single place totals are computed, used by the resolver reading a stored row AND by the
 * composer recomputing on every keystroke. Two implementations would drift, and the one that
 * drifted would be the one showing a person a number while they typed.
 *
 * Place of supply overrides the customer's own address for tax. Not a convenience — it is how GST
 * and VAT work: where a supply is deemed to happen can differ from where the customer's post goes,
 * and it is what decides whether Indian GST splits into CGST plus SGST or stays a single IGST.
 */
export function computeDraftTotals(draft, settings = {}) {
  const money = settings.money || {};
  const supply = money.placeOfSupply || {};

  // A statement's rows are documents with a running balance, not items with amounts, so its
  // figures come from those columns: charges billed, payments received, and a closing balance
  // taken from the LAST stated balance rather than summed — a running balance is already
  // cumulative, and adding one up double-counts everything before it. Without this, a statement
  // showed "Balance outstanding £0.00" beneath rows plainly stating otherwise.
  if (documentKind(draft.kind).lineMode === 'documents') {
    const rows = (draft.lines || []).filter((l) => l.charge != null || l.paid != null || l.balance != null);
    if (rows.length) {
      const charges = rows.reduce((a, l) => a + (l.charge || 0), 0);
      const paid = rows.reduce((a, l) => a + (l.paid || 0), 0);
      const last = [...rows].reverse().find((l) => l.balance != null);
      return {
        ...emptyTotals(draft.currency || money.currency || 'USD'),
        subtotal: charges,
        total: charges,
        amountPaid: paid,
        balance: last ? last.balance : charges - paid,
      };
    }
  }

  // The EU reverse charge, worked out rather than ticked: a cross-border sale inside the EU to a
  // client who has produced a VAT number is one where the CLIENT accounts for the tax, and the
  // document must say so in as many words. The rates module knows the rule; the sentence comes
  // in the document's language. A business that charges no tax at all, or has an exemption of
  // its own, is left alone — nothing is being reverse-charged there.
  let exempt = settings.exempt || null;
  if (!exempt && money.taxEnabled !== false && money.taxMode !== 'none' && draft.taxAmount == null) {
    const rc = reverseChargeApplies({
      homeCountry: money.homeCountry || draft.sender?.country,
      customerCountry: draft.client?.country,
      customerTaxNumber: draft.client?.taxNumber,
    });
    if (rc) exempt = { reason: labels(languageOf(draft, settings)).reverseCharge };
  }

  return computeTotals({
    lines: (draft.lines || []).map((l, i) => ({
      id: l.id != null ? l.id : i + 1,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      amount: l.amount,
      taxClass: l.taxClass || '',
    })),
    addresses: {
      billing: {
        ...addressOf(draft.client, money.defaultCustomerCountry),
        ...Object.fromEntries(Object.entries(supply).filter(([, v]) => v)),
      },
      base: addressOf(draft.sender, money.homeCountry),
    },
    discounts: draft.discountAmount
      ? [{ type: 'fixed_total', amount: draft.discountAmount, label: draft.discountLabel || 'Discount' }]
      : [],
    shipping: draft.shippingAmount || 0,
    amountPaid: draft.amountPaid || 0,
    taxAmount: draft.taxAmount,
    taxName: draft.taxName || money.simpleName,
    exempt,
  }, { ...money, currency: draft.currency || money.currency || 'USD' });
}

/**
 * Bring a draft's figures up to date, IN PLACE.
 *
 * In place matters. The composer holds a reference to the draft and mutates it as you type, so
 * returning a fresh object here would leave the form editing one draft while the preview rendered
 * another — every keystroke landing on an object nothing was looking at any more. Cheap enough to
 * call on every keystroke, which is what it is for.
 */
export function recalc(draft, settings) {
  // The format is re-derived on every pass rather than kept from when the draft was made, so a
  // currency or separator changed in Settings lands on a draft mid-composition instead of doing
  // nothing visible. The draft's own currency, when it has one, still wins — that is the
  // per-document override, and it is the only part of the format a document carries itself.
  draft.format = { ...(settings.money?.format || {}), currency: draft.currency || settings.money?.currency || 'USD' };
  draft.totals = computeDraftTotals(draft, settings);
  return draft;
}

/**
 * Turn one kind of document into another, keeping everything that still applies.
 *
 * `relatedTo` names the document this one comes from — "Invoice INV-2026-0007" on the credit note
 * that reverses it — and is worked out by the caller, which knows the document's language.
 */
export function convertDraft(draft, toKindId, { relatedTo = '' } = {}) {
  const to = documentKind(toKindId);
  return normaliseDraft({
    ...draft,
    kind: to.id,
    relatedTo: relatedTo || '',
    // The number belongs to the document it was issued against. A quote becoming an invoice needs
    // its own number from the invoice sequence, so it is cleared here and assigned on save — see
    // money/numbering.js for why one is never reused.
    number: '',
    numberIsDerived: false,
    rowId: null,
    status: 'Draft',
    issued: new Date().toISOString().slice(0, 10),
  });
}
