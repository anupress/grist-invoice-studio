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
  /**
   * How the business gets paid, for the code on the document. An IBAN puts a SEPA transfer code
   * (EPC "GiroCode") on euro invoices; a UPI id does the same for rupee ones; a payment link — a
   * Stripe or PayPal page the business already has — serves everything else. All optional.
   */
  iban: '', bic: '', accountHolder: '', upiId: '', paymentLink: '',
  /**
   * The legal line at the foot of every document: registration number and court, managing
   * director, share capital, whatever the jurisdiction requires. Germany and France both do.
   */
  legalText: '',
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

  /**
   * A VAT exemption the business trades under — the small-business scheme, chiefly. When set, no
   * tax is charged and the document carries the sentence the law expects for the home country
   * (money/tax/exemptions.js), or the business's own wording.
   */
  exemption: '',          // '' | 'small_business'
  exemptionText: '',
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
  /**
   * The language the document is written in, unless the client record says otherwise. Only the
   * document's own words — Invoice, Due, Subtotal — change; the business's text is its own.
   */
  language: 'en',
  /**
   * Which fonts the PDF uses. 'auto' embeds a font only when the standard ones would lose a
   * character (a Polish name, a rupee sign); 'embed' always does, which an archival PDF requires
   * and which makes every document look the same whatever it says.
   */
  pdfFont: 'auto',
  /**
   * Whether an issued document opens read-only. In most of Europe an invoice that has been sent
   * may not be altered — corrections are a credit note — and the composer says so rather than
   * silently allowing it. It can always be unlocked for the one edit that is genuinely needed.
   */
  lockIssued: true,
  /** Whether the payment code is drawn when a way to pay has been set up. */
  showPayQr: true,
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
  /**
   * What travels with the covering message, and what the email itself shows.
   *
   * Two independent answers, because they solve different problems. An attached PDF is the thing a
   * client files and a bookkeeper wants; the invoice laid out in the body is what a client who
   * will not open attachments actually reads, and what survives a spam filter that strips files.
   * Most businesses want both, which is why both default to on.
   *
   *   attachFormat  'pdf' | 'html' | 'none' | 'facturx' | 'ubl' | 'cii'
   *   includeInBody  the invoice, as tables, inside the email
   */
  attachFormat: 'pdf',
  includeInBody: true,
};

/** Table overrides, for when detection guesses wrong. Empty means work it out. */
export const DEFAULT_TABLES = { invoice: '', line: '', client: '', product: '' };

/**
 * The electronic invoice.
 *
 * `profile` is which rulebook the XML announces itself under — EN 16931 as such, XRechnung for
 * Germany, Peppol BIS for the Peppol network — and empty means the business does not send
 * e-invoices, so nothing about them is offered or checked. Choosing one puts the Factur-X and
 * XML formats in the Send panel and runs the pre-send check.
 */
export const DEFAULT_EINVOICE = { profile: '' };

export const DEFAULT_SETTINGS = {
  business: { ...DEFAULT_BUSINESS },
  tables: { ...DEFAULT_TABLES },
  money: { ...DEFAULT_MONEY },
  numbering: { ...DEFAULT_NUMBERING },
  document: { ...DEFAULT_DOCUMENT },
  delivery: { ...DEFAULT_DELIVERY },
  einvoice: { ...DEFAULT_EINVOICE },
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
