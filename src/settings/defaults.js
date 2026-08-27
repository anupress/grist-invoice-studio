// Everything the business decides once, rather than on every invoice.
//
// The shape below is the contract between the settings panel, the money engine, the renderer and
// the send routes. It is deliberately flat-ish and boring: it gets serialised into the user's own
// Grist document, so it has to survive being read back by a later version of this widget, and
// clever structure is what makes that hard.
//
// Where a setting exists in WooCommerce it is named the same way and behaves the same way. A person
// who has configured a shop once should not have to learn a second vocabulary for the same idea.

/** The sender. In Grist's own template this lives in a Python formula; here it is just data. */
export const DEFAULT_BUSINESS = {
  name: '', street1: '', street2: '', city: '', state: '', postcode: '', country: '',
  email: '', phone: '', website: '', taxNumber: '',
  // The logo, twice. logoData is what the page and the email show — PNG when it stays small, so
  // transparency survives. logoJpeg is the flattened copy the PDF embeds, because DCTDecode is the
  // one image filter a PDF accepts without a compression library. Both are data URIs stored in the
  // settings JSON, so the logo travels with the document and needs no host.
  logoData: null, logoJpeg: null,
};

export const DEFAULT_MONEY = {
  currency: 'USD',
  format: { position: 'left', thousandSeparator: ',', decimalSeparator: '.', decimals: null },

  taxEnabled: true,

  /**
   * How tax is worked out at all. Three answers, and most businesses want the middle one.
   *
   *   simple  one rate, typed in, applied to everything. A sole trader registered in one country
   *           does not need a table of twenty-seven, and making them pick a preset and then check
   *           it is asking for work that has no bearing on their invoices.
   *   preset  a country table, from ./money/tax/rates.js — for anyone selling across borders.
   *   none    no tax at all, which is a real answer and not the same as a rate of zero.
   */
  taxMode: 'simple',
  simpleRate: 20,
  simpleName: 'VAT',

  // A preset id, or null when the rate table has been edited by hand. Storing the id rather than
  // the rows means a preset stays current; storing rows means a snapshot that quietly goes stale.
  taxPreset: null,
  taxRates: [],            // only used when taxPreset is null
  homeCountry: '',
  homeState: '',
  defaultCustomerCountry: '',
  placeOfSupply: { country: '', state: '' },

  pricesIncludeTax: false,
  taxBasedOn: 'billing',        // billing | shipping | base
  roundAtSubtotal: false,
  roundingMode: 'halfUp',
  displayTaxTotals: 'itemized', // itemized | single
  shippingTaxClass: '',

  discountsEnabled: true,
  sequentialDiscounts: false,
};

/**
 * Numbering, per kind of document.
 *
 * Separate sequences because they are separate documents: a quote and an invoice raised on the same
 * day are not the same thing and must not share a number. Padding and the reset period are shared,
 * because a business that pads to four digits pads everything to four digits.
 */
export const DEFAULT_NUMBERING = {
  padding: 4,
  start: 1,
  resetPeriod: 'yearly',
  prefixes: {
    invoice: 'INV-{YYYY}-',
    quote: 'QUO-{YYYY}-',
    proforma: 'PRO-{YYYY}-',
    receipt: 'REC-{YYYY}-',
    credit_note: 'CRN-{YYYY}-',
    statement: 'STM-{YYYY}-',
    delivery_note: 'DEL-{YYYY}-',
    packing_slip: 'PCK-{YYYY}-',
  },
  suffix: '',
};

/** How the document looks and what standing wording it carries. */
export const DEFAULT_DOCUMENT = {
  layout: 'classic',
  accent: '',
  /**
   * The paper it is meant for.
   *
   * A4 nearly everywhere, US Letter in North America — and a till roll for anyone handing a receipt
   * across a counter, which is a genuinely different shape rather than a smaller sheet: one narrow
   * column, no side-by-side addresses, and a height that just keeps going.
   */
  paperSize: 'a4',
  /** How tightly it is set. A long invoice on one page, or a short one that is easy to read. */
  density: 'normal',      // compact | normal | roomy
  taxNumberLabel: 'Tax ID',
  referenceLabel: 'Your reference',
  paymentDetailsLabel: 'How to pay',
  paymentDetails: '',
  closingText: '',
  showSignature: false,
};

/**
 * Delivery.
 *
 * Note what is NOT here and never will be: an SMTP password, or a mail-provider API key. Everything
 * in this object is written into the user's own Grist document, where every editor of that document
 * can read it — so a credential stored here would be a credential shared with everyone. The recipes
 * folder keeps those where they belong, in the environment of something the user runs.
 */
export const DEFAULT_DELIVERY = {
  endpoint: '',
  replyTo: '',
  cc: '',
  bcc: '',
  emailAccent: '#14509b',
};

export const DEFAULT_SETTINGS = {
  business: { ...DEFAULT_BUSINESS },
  money: { ...DEFAULT_MONEY },
  numbering: { ...DEFAULT_NUMBERING },
  document: { ...DEFAULT_DOCUMENT },
  delivery: { ...DEFAULT_DELIVERY },
  // Per-message overrides, keyed by template id. Absent means "use the built-in wording".
  messages: {},
};

/**
 * The numbering format for one kind of document.
 *
 * Falls back to the invoice prefix rather than to nothing, so a document kind added in a later
 * version still numbers sensibly against settings written by an earlier one.
 */
export function numberFormatFor(settings, kindId) {
  const n = settings.numbering || DEFAULT_NUMBERING;
  const prefixes = n.prefixes || DEFAULT_NUMBERING.prefixes;
  return {
    prefix: prefixes[kindId] || prefixes.invoice || DEFAULT_NUMBERING.prefixes.invoice,
    suffix: n.suffix || '',
    padding: n.padding != null ? n.padding : DEFAULT_NUMBERING.padding,
    start: n.start != null ? n.start : DEFAULT_NUMBERING.start,
    resetPeriod: n.resetPeriod || DEFAULT_NUMBERING.resetPeriod,
  };
}
