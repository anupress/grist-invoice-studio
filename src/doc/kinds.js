// The kinds of document this produces, and how each one differs.
//
// They are not skins. A quote is not an invoice with a different heading — it does not demand
// payment, its second date is an expiry rather than a due date, and saying "Amount due" on one is
// a small lie that a client is entitled to be annoyed by. A delivery note must show no prices at
// all, because it travels in the box and the person unpacking it is not the person paying.
//
// So each kind carries its vocabulary AND its behaviour, and the renderer reads both rather than
// branching on an id. Adding a kind is adding an entry here.
//
// `lineMode` is the one that changes the shape of the page:
//   items       description, quantity, unit price, amount   — the billing documents
//   quantities  description and quantity only, no money     — delivery note, packing slip
//   documents   a list of other documents with a running balance — a statement of account

export const DOCUMENT_KINDS = [
  {
    id: 'quote',
    word: 'Quote',
    label: 'Quote / estimate',
    lineMode: 'items',
    showsMoney: true,
    demandsPayment: false,
    numberPrefix: 'QUO-',
    dateLabels: { issued: 'Issued', second: 'Valid until' },
    totalLabel: 'Total',
    // Said plainly on the document, because a quote that reads like an invoice gets paid by
    // accident and then argued about.
    legend: 'This is a quotation, not a request for payment. Prices are valid until the date shown.',
    becomes: ['invoice', 'proforma'],
  },
  {
    id: 'proforma',
    word: 'Proforma invoice',
    label: 'Proforma invoice',
    lineMode: 'items',
    showsMoney: true,
    demandsPayment: true,
    numberPrefix: 'PRO-',
    dateLabels: { issued: 'Issued', second: 'Payable by' },
    totalLabel: 'Amount payable',
    // A proforma is not a tax invoice and cannot be used to reclaim tax. Customs and finance
    // departments both care about the distinction.
    legend: 'This is a proforma invoice and not a tax invoice. A tax invoice will follow on payment.',
    becomes: ['invoice'],
  },
  {
    id: 'invoice',
    word: 'Invoice',
    label: 'Invoice',
    lineMode: 'items',
    showsMoney: true,
    demandsPayment: true,
    numberPrefix: 'INV-',
    dateLabels: { issued: 'Issued', second: 'Due' },
    totalLabel: 'Amount due',
    legend: null,
    becomes: ['receipt', 'credit_note'],
  },
  {
    id: 'receipt',
    word: 'Receipt',
    label: 'Receipt',
    lineMode: 'items',
    showsMoney: true,
    demandsPayment: false,
    numberPrefix: 'REC-',
    // A receipt's important date is when it was paid, and it has no due date at all — printing
    // one on a document confirming payment is simply confusing.
    dateLabels: { issued: 'Issued', second: 'Paid' },
    totalLabel: 'Amount paid',
    legend: null,
    becomes: [],
  },
  {
    id: 'credit_note',
    word: 'Credit note',
    label: 'Credit note',
    lineMode: 'items',
    showsMoney: true,
    demandsPayment: false,
    numberPrefix: 'CRN-',
    dateLabels: { issued: 'Issued', second: null },
    totalLabel: 'Credit',
    // Amounts stay positive and the wording carries the direction. Printing negative numbers is
    // the other convention and reads as an error to about half the people who receive one.
    legend: 'This credit note reverses the charges shown. It is not a request for payment.',
    becomes: [],
  },
  {
    id: 'statement',
    word: 'Statement of account',
    label: 'Statement of account',
    lineMode: 'documents',
    showsMoney: true,
    demandsPayment: true,
    numberPrefix: 'STM-',
    dateLabels: { issued: 'As at', second: null },
    totalLabel: 'Balance outstanding',
    legend: null,
    becomes: [],
  },
  {
    id: 'delivery_note',
    word: 'Delivery note',
    label: 'Delivery note',
    lineMode: 'quantities',
    // No prices. It travels with the goods, and the person unpacking the box is not the person
    // who agreed the price.
    showsMoney: false,
    demandsPayment: false,
    numberPrefix: 'DEL-',
    dateLabels: { issued: 'Dispatched', second: null },
    totalLabel: null,
    legend: null,
    becomes: ['invoice'],
  },
  {
    id: 'packing_slip',
    word: 'Packing slip',
    label: 'Packing slip',
    lineMode: 'quantities',
    showsMoney: false,
    demandsPayment: false,
    numberPrefix: 'PCK-',
    dateLabels: { issued: 'Packed', second: null },
    totalLabel: null,
    legend: null,
    becomes: [],
  },
];

const DEFAULT_KIND = DOCUMENT_KINDS.find((k) => k.id === 'invoice');

/** A kind by id, falling back to the invoice rather than to nothing. */
export function documentKind(id) {
  return DOCUMENT_KINDS.find((k) => k.id === id) || DEFAULT_KIND;
}

/** What this document can be turned into, as kinds rather than ids. */
export function conversionsFor(id) {
  return documentKind(id).becomes.map(documentKind);
}
