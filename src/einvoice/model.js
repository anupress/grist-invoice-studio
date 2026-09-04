// The document as EN 16931 sees it.
//
// EN 16931 is the European semantic model for an electronic invoice: a fixed vocabulary of
// business terms — BT-1 the number, BT-10 the buyer reference, BG-23 the VAT breakdown — that
// both XML syntaxes, UBL and CII, are mappings of. Rather than map our draft to each syntax
// separately, it is mapped once, here, to a plain object in that vocabulary, and ./ubl.js and
// ./cii.js each write it out. The compliance check reads the same object, so what it checks is
// exactly what gets written.
//
// The numbers are the totals engine's numbers. EN 16931 states the arithmetic it expects —
// line net amounts sum to the line total, tax per category is basis times rate, inclusive is
// exclusive plus tax — and every identity below is arranged so that a validator finds it true.

import { documentKind } from '../doc/kinds.js';
import { languageOf } from '../doc/lang.js';
import { lineUnitCode } from '../doc/units.js';

const text = (v) => String(v == null ? '' : v).trim();
const R = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** The e-invoice profiles a business can choose, and how each is announced inside the file. */
export const PROFILES = {
  en16931: {
    id: 'en16931', label: 'EN 16931 — the European standard',
    customization: 'urn:cen.eu:en16931:2017',
    profileId: '',
    facturx: 'EN 16931',
  },
  xrechnung: {
    id: 'xrechnung', label: 'XRechnung 3.0 — Germany',
    customization: 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0',
    profileId: 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
    facturx: 'EN 16931',
  },
  peppol: {
    id: 'peppol', label: 'Peppol BIS Billing 3.0 — Belgium, Nordics, and the Peppol network',
    customization: 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0',
    profileId: 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
    facturx: 'EN 16931',
  },
};

export const profileOf = (id) => PROFILES[id] || PROFILES.en16931;

/** UNTDID 1001 document type codes an e-invoice may carry. Anything else is not an e-invoice. */
const TYPE_CODES = { invoice: '380', credit_note: '381' };

/** A VAT identifier as the schema wants it: no spaces, upper case. */
export const vatId = (s) => text(s).replace(/[\s.-]/g, '').toUpperCase();

/** Two upper-case letters, or nothing — the only country a validator accepts. */
export const iso2 = (s) => (/^[A-Za-z]{2}$/.test(text(s)) ? text(s).toUpperCase() : '');

/** "YYYY-MM-DD" from whatever the draft holds, or ''. */
export function isoDate(v) {
  const s = text(v);
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (m) return m[1];
  if (/^\d{9,13}$/.test(s) || typeof v === 'number') {
    const n = Number(v);
    const d = new Date(Math.abs(n) > 1e11 ? n : n * 1000);
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
  return '';
}

/** A party — seller or buyer — in the standard's terms. */
function party(p = {}) {
  const tax = text(p.taxNumber);
  // A number beginning with two letters is a VAT identifier (DE123456789, FR12345678901); anything
  // else is a national tax registration and goes in the other slot.
  const looksVat = /^[A-Za-z]{2}[\s.-]*[A-Za-z0-9]/.test(tax) && vatId(tax).length >= 4;
  return {
    name: text(p.name),
    street: text(p.street1),
    street2: text(p.street2),
    city: text(p.city),
    postcode: text(p.postcode),
    region: text(p.state),
    country: iso2(p.country),
    vatId: looksVat ? vatId(tax) : '',
    taxId: looksVat ? '' : tax,
    email: text(p.email),
    phone: text(p.phone),
    legalText: text(p.legalText),
    // The electronic address (BT-34 / BT-49): an email under the EM scheme, which is what a
    // business without a Peppol participant id can honestly claim.
    endpoint: text(p.email) ? { scheme: 'EM', value: text(p.email) } : null,
  };
}

/**
 * The VAT category of a line, from what the engine did to it.
 *
 *   S   standard rated — a rate was applied
 *   Z   zero rated — the rate table said 0
 *   AE  reverse charge — the buyer accounts for the VAT
 *   E   exempt — the seller is not charging, and says why
 */
function categoryFor(engineLine, exempt, exemptKind) {
  if (exempt) {
    if (exemptKind === 'reverse') return { id: 'AE', rate: 0, reason: exempt.reason, reasonCode: 'VATEX-EU-AE' };
    return { id: 'E', rate: 0, reason: exempt.reason, reasonCode: '' };
  }
  const taxLines = engineLine?.taxLines || [];
  const rate = R(taxLines.reduce((a, t) => a + (Number(t.rate) || 0), 0));
  if (!taxLines.length || rate === 0) return { id: 'Z', rate: 0, reason: '', reasonCode: '' };
  return { id: 'S', rate, reason: '', reasonCode: '' };
}

const catKey = (c) => `${c.id}|${c.rate}`;

/**
 * Build the model.
 *
 * `settings.einvoice` carries the profile. The kind decides whether there is an e-invoice at all:
 * quotes, receipts and delivery notes have no type code in the standard and are reported as such
 * by the check rather than written as something they are not.
 */
export function einvoiceModel(draft, settings = {}) {
  const kind = documentKind(draft.kind);
  const t = draft.totals || {};
  const profile = profileOf(settings.einvoice?.profile);
  const exempt = t.exempt || null;
  // The reverse charge is the only exemption whose reason cites Article 196; it is what the
  // engine writes when it applies the rule. Anything else exempt is the seller's own status.
  const exemptKind = exempt && /196|reverse|autoliquidation|verlegd|steuerschuldnerschaft|inversione|inversión|odwrotne|autoliquidação/i.test(exempt.reason) ? 'reverse' : 'other';

  const seller = party(draft.sender);
  const buyer = party(draft.client);
  const currency = text(draft.currency || t.currency || settings.money?.currency).toUpperCase() || 'EUR';

  // Lines: the draft's words with the engine's figures, paired by position, which is how the
  // engine received them.
  const engineLines = t.lines || [];
  const lines = (draft.lines || []).filter((l) => l.itemised !== false || engineLines.length).map((l, i) => {
    const e = engineLines[i] || {};
    const quantity = Number(l.quantity) || 0;
    const unitPrice = R(l.unitPrice);
    const base = e.base != null ? R(e.base) : R(quantity * unitPrice);
    const net = e.net != null ? R(e.net) : base;
    const cat = categoryFor(e, exempt, exemptKind);
    return {
      id: String(i + 1),
      name: text(l.description) || 'Item',
      quantity,
      unitCode: lineUnitCode(l.unit),
      unitPrice,
      base,
      net,
      // Whatever separates quantity × price from the net — a line discount, an apportioned order
      // discount, a stored amount — is declared as a line allowance so the arithmetic closes.
      allowance: base > net ? R(base - net) : 0,
      charge: net > base ? R(net - base) : 0,
      tax: R(e.tax),
      category: cat,
    };
  });

  // Shipping is a document-level charge with the tax category its tax lines imply.
  const shipping = t.shipping && Number(t.shipping.amount) > 0 ? {
    amount: R(t.shipping.amount),
    reason: t.shipping.label || 'Shipping',
    tax: R(t.shipping.tax),
    category: exempt ? categoryFor(null, exempt, exemptKind)
      : (Number(t.shipping.tax) > 0 && lines.length ? { ...lines[0].category } : { id: 'Z', rate: 0, reason: '', reasonCode: '' }),
  } : null;

  // The VAT breakdown: one entry per category and rate, basis and tax summed from what carries it.
  const groups = new Map();
  const add = (cat, basis, tax) => {
    const k = catKey(cat);
    const g = groups.get(k) || { ...cat, basis: 0, tax: 0 };
    g.basis = R(g.basis + basis);
    g.tax = R(g.tax + tax);
    groups.set(k, g);
  };
  for (const l of lines) add(l.category, l.net, l.tax);
  if (shipping) add(shipping.category, shipping.amount, shipping.tax);
  const breakdown = [...groups.values()];

  // Totals, arranged so the standard's identities hold to the cent against the engine's figures.
  const taxTotal = R(t.taxTotal);
  const taxInclusive = R(t.total);
  const taxExclusive = R(taxInclusive - taxTotal);
  const chargeTotal = shipping ? shipping.amount : 0;
  const lineExtension = R(taxExclusive - chargeTotal);
  const prepaid = R(t.amountPaid);
  const payable = R(t.balance != null ? t.balance : taxInclusive - prepaid);
  const sumLines = R(lines.reduce((a, l) => a + l.net, 0));

  // A credit note names the invoice it corrects. The draft holds "Rechnung RE-2026-0007"; the
  // standard wants "RE-2026-0007", so the last token is taken — a number never contains a space.
  const related = text(draft.relatedTo);
  const preceding = kind.id === 'credit_note' && related ? related.split(/\s+/).pop() : '';

  return {
    profile,
    kind: kind.id,
    typeCode: TYPE_CODES[kind.id] || '',
    number: text(draft.number),
    issueDate: isoDate(draft.issued),
    dueDate: kind.id === 'invoice' ? isoDate(draft.due) : '',
    currency,
    language: languageOf(draft, settings),
    buyerReference: text(draft.reference),
    note: text(draft.note),
    paymentTerms: text(draft.terms),
    seller,
    buyer,
    payment: {
      // UNTDID 4461: 58 SEPA credit transfer, 30 credit transfer, 68 online payment service.
      code: seller.iban || text(draft.sender?.iban) ? (currency === 'EUR' ? '58' : '30') : (text(draft.sender?.paymentLink) ? '68' : '30'),
      iban: text(draft.sender?.iban).replace(/\s+/g, '').toUpperCase(),
      bic: text(draft.sender?.bic).replace(/\s+/g, '').toUpperCase(),
      accountHolder: text(draft.sender?.accountHolder) || seller.name,
      reference: text(draft.number),
      link: text(draft.sender?.paymentLink),
    },
    lines,
    shipping,
    breakdown,
    totals: { lineExtension, sumLines, allowanceTotal: 0, chargeTotal, taxExclusive, taxTotal, taxInclusive, prepaid, payable },
    precedingInvoice: preceding,
    exempt: exempt ? { kind: exemptKind, reason: exempt.reason } : null,
    flatTax: draft.taxAmount != null && draft.taxAmount !== '',
  };
}
