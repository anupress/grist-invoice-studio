// The document the demo runs against.
//
// It is deliberately an exact copy of the SHAPE of Grist's own Invoicing template — the same three
// tables, the same column names, the same types, including the empty Text `Total` that template
// carries. That is not laziness. It means the demo is also the compatibility proof: if the demo
// renders, a real document built on Grist's template renders, because they are the same thing.
//
// Everything in it is invented. No real business, person or address appears here, and none ever
// should — this data ends up in screenshots and documentation.

const iso = (d) => d.toISOString().slice(0, 10);
const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return iso(d); };

// isFormula matters: Grist's template computes Number, Due, Items and References, and a formula
// column cannot be written to. The demo mirrors that so the write path is exercised honestly here
// rather than only against a real document.
const T = (id, label = id, type = 'Text', isFormula = false) => ({ id, label, type, isFormula });

// ---- Businesses -------------------------------------------------------------------------------
// Name and postal address only, exactly as the official template has it. No email column, which is
// precisely why the widget reports that nothing can be sent until the document is upgraded.
const BUSINESSES_COLUMNS = [
  T('Name'), T('Street1', 'Street1'), T('Street2', 'Street2'),
  T('City'), T('State'), T('Zip'),
];

const businesses = [
  { id: 1, Name: 'Harbour Lane Bakery', Street1: '12 Harbour Lane', Street2: '', City: 'Bristol', State: 'Somerset', Zip: 'BS1 4QA' },
  { id: 2, Name: 'Alder Court Dental', Street1: '3 Alder Court', Street2: 'Suite 2', City: 'Bath', State: 'Somerset', Zip: 'BA1 2LP' },
  { id: 3, Name: 'Kingfisher Print Works', Street1: '88 Mill Road', Street2: '', City: 'Bristol', State: 'Somerset', Zip: 'BS5 9RG' },
  { id: 4, Name: 'Rowan Hill Veterinary', Street1: '5 Rowan Hill', Street2: 'Unit C', City: 'Wells', State: 'Somerset', Zip: 'BA5 2PU' },
];

// ---- Prepare_Invoices -------------------------------------------------------------------------
// `Number` mirrors the template's `$id + 51371` formula, and `Total` mirrors its empty Text column,
// so both defects are visible in the demo rather than described in a document nobody reads.
const INVOICE_COLUMNS = [
  T('Number', 'Number', 'Numeric', true), T('Client', 'Client', 'Ref:Businesses'),
  T('Items', 'Items', 'Any', true), T('Invoicer', 'Invoicer', 'Any', true),
  T('Issued', 'Issued', 'Date'), T('Due', 'Due', 'Any', true),
  T('Note'), T('References', 'References', 'Any', true), T('Total', 'Total', 'Text'),
];

const invoices = [
  { id: 1, Number: 51372, Client: 1, Issued: day(-38), Due: day(-8), Total: '',
    Note: 'Thanks for a straightforward job — the new oven install went in ahead of schedule.' },
  { id: 2, Number: 51373, Client: 2, Issued: day(-21), Due: day(9), Total: '', Note: '' },
  { id: 3, Number: 51374, Client: 3, Issued: day(-12), Due: day(18), Total: '',
    Note: 'Second of three phases. Phase three will be raised on completion.' },
  { id: 4, Number: 51375, Client: 4, Issued: day(-3), Due: day(27), Total: '', Note: '' },
];

// ---- Items --------------------------------------------------------------------------------------
const ITEM_COLUMNS = [
  T('Description'), T('Price', 'Price', 'Numeric'), T('Quantity', 'Quantity', 'Numeric'),
  T('Total', 'Total', 'Numeric', true), T('Invoice', 'Invoice', 'Ref:Prepare_Invoices'),
];

const rawItems = [
  [1, 'Site survey and measurement', 320, 1],
  [1, 'Extraction ductwork, supply and fit', 145, 6],
  [1, 'Electrical certification', 210, 1],
  [2, 'Reception refit — design and drawings', 480, 1],
  [2, 'Cabinetry, per linear metre', 265, 7],
  [3, 'Press setup and calibration', 390, 2],
  [3, 'Operator training, per day', 550, 3],
  [3, 'Consumables pack', 96, 4],
  [4, 'Kennel flooring, per square metre', 62, 24],
  [4, 'Drainage alterations', 780, 1],
];

const items = rawItems.map(([Invoice, Description, Price, Quantity], i) => ({
  id: i + 1, Invoice, Description, Price, Quantity, Total: Price * Quantity,
}));

/**
 * Who is sending these.
 *
 * In Grist's template this lives inside a Python formula on the invoice table, so changing your own
 * address means editing code. Here it is ordinary settings data, which is the whole argument for
 * keeping the sender out of the table in the first place: it is branding, it is identical on every
 * invoice, and it belongs with the logo rather than beside the line items.
 */
export const SAMPLE_SENDER = {
  name: 'Thornbury Works',
  street1: '4 Quarry Street',
  street2: '',
  city: 'Bristol',
  state: 'Somerset',
  postcode: 'BS1 5TF',
  country: 'GB',
  email: 'accounts@thornburyworks.example',
  phone: '+44 117 496 0139',
  website: 'thornburyworks.example',
  taxNumber: 'GB 481 2739 55',
};

/**
 * The money settings the demo runs under.
 *
 * Note what is NOT here: any tax column on any table. Grist's template has none, and neither does
 * this copy of it — the rates come from a preset the business chose, matched against a country the
 * business stated, because that is where tax rules actually live. A column holding "Taxes: 240" is
 * a number somebody typed, not a rule.
 *
 * `defaultCustomerCountry` is doing real work: the template's client table has no country column,
 * so without it every client would match no rate row at all and the demo would quietly produce
 * VAT-free invoices. A business whose clients are all domestic says so once, here.
 */
export const SAMPLE_MONEY = {
  currency: 'GBP',
  // The demo drives the region switcher, so it uses a country table rather than the one-typed-rate
  // mode a real small business would start on.
  taxMode: 'preset',
  taxPreset: 'gb-vat',
  homeCountry: 'GB',
  defaultCustomerCountry: 'GB',
  // No currency here: it lives one level up. A duplicate would be a second copy of the same fact,
  // and the two would disagree the moment somebody changed one of them.
  format: { position: 'left', thousandSeparator: ',', decimalSeparator: '.' },
};

export const SAMPLE_DATA = {
  defaultTable: 'Prepare_Invoices',
  tables: {
    Prepare_Invoices: { id: 'Prepare_Invoices', label: 'Prepare Invoices', columns: INVOICE_COLUMNS, records: invoices },
    Businesses: { id: 'Businesses', label: 'Businesses', columns: BUSINESSES_COLUMNS, records: businesses },
    Items: { id: 'Items', label: 'Items', columns: ITEM_COLUMNS, records: items },
  },
};
