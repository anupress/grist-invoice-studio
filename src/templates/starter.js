// Setting up a document that has nothing in it yet.
//
// Pointing this widget at a fresh Grist document used to produce "No invoices found in this
// document" and no way forward, which is a dead end at exactly the moment somebody is deciding
// whether the thing is worth using. This builds the four tables it needs and fills them with a few
// invoices to look at, so the first screen after connecting is a working document rather than an
// explanation of why there isn't one.
//
// The line items come from whichever trade was chosen, so a builder gets labour and materials and a
// bakery gets loaves and coffee. The clients and the structure are the same either way — what
// differs between trades is what is being sold, not who it is sold to.
//
// Everything here is invented. No real business, person or address appears, and none should: this
// data ends up in screenshots and in other people's documents.

import { findTemplate } from './index.js';

const iso = (d) => d.toISOString().slice(0, 10);
const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return iso(d); };

/** Three clients, reused across every trade. Row ids come out as 1, 2, 3 in this order. */
const CLIENTS = [
  { Name: 'Harbour Lane Bakery', Email: 'accounts@harbourlane.example', Phone: '+44 117 496 0114',
    Street1: '12 Harbour Lane', City: 'Bristol', State: 'Somerset', Zip: 'BS1 4QA', Country: 'GB' },
  { Name: 'Alder Court Dental', Email: 'billing@aldercourt.example', Phone: '+44 1225 496 220',
    Street1: '3 Alder Court', Street2: 'Suite 2', City: 'Bath', State: 'Somerset', Zip: 'BA1 2LP', Country: 'GB' },
  { Name: 'Kingfisher Print Works', Email: 'pay@kingfisherprint.example', Phone: '+44 117 496 0388',
    Street1: '88 Mill Road', City: 'Bristol', State: 'Somerset', Zip: 'BS5 9RG', Country: 'GB' },
];

const CLIENT_COLUMNS = [
  { id: 'Name', label: 'Name', type: 'Text' },
  { id: 'Email', label: 'Email', type: 'Text' },
  { id: 'Phone', label: 'Phone', type: 'Text' },
  { id: 'Street1', label: 'Address line 1', type: 'Text' },
  { id: 'Street2', label: 'Address line 2', type: 'Text' },
  { id: 'City', label: 'City', type: 'Text' },
  { id: 'State', label: 'State / county', type: 'Text' },
  { id: 'Zip', label: 'Postcode', type: 'Text' },
  { id: 'Country', label: 'Country', type: 'Text' },
  { id: 'TaxNumber', label: 'Tax number', type: 'Text' },
];

const PRODUCT_COLUMNS = [
  { id: 'SKU', label: 'SKU', type: 'Text' },
  // Attachments, added after the atomic create like every Attachments column here. Left empty:
  // the document looks exactly as it always has until somebody drops a photo in, and then the
  // invoices for that product carry it.
  { id: 'Image', label: 'Image', type: 'Attachments' },
  { id: 'Name', label: 'Name', type: 'Text' },
  { id: 'Price', label: 'Unit price', type: 'Numeric' },
  { id: 'Unit', label: 'Unit', type: 'Text' },
  { id: 'Stock', label: 'In stock', type: 'Numeric' },
  { id: 'TaxClass', label: 'Tax class', type: 'Text' },
  { id: 'HSN', label: 'HSN/SAC', type: 'Text' },
];

const INVOICE_COLUMNS = [
  { id: 'InvoiceNumber', label: 'Invoice number', type: 'Text' },
  { id: 'Client', label: 'Client', type: 'Ref:Clients' },
  { id: 'Issued', label: 'Issued', type: 'Date' },
  { id: 'Due', label: 'Due', type: 'Date' },
  { id: 'Status', label: 'Status', type: 'Choice',
    widgetOptions: JSON.stringify({ choices: ['Draft', 'Sent', 'Part paid', 'Paid', 'Overdue', 'Cancelled'], choiceOptions: {} }) },
  { id: 'PaidDate', label: 'Paid', type: 'Date' },
  { id: 'AmountPaid', label: 'Amount paid', type: 'Numeric' },
  { id: 'Currency', label: 'Currency', type: 'Text' },
  { id: 'Reference', label: 'Their reference', type: 'Text' },
  { id: 'Terms', label: 'Payment terms', type: 'Text' },
  { id: 'Note', label: 'Note', type: 'Text' },
  { id: 'Total', label: 'Total', type: 'Numeric' },
  { id: 'SentAt', label: 'Sent', type: 'Date' },
  { id: 'SentTo', label: 'Sent to', type: 'Text' },
  // Included from the start rather than left to the upgrade, so a document built here never opens
  // with a list of things still to add to it.
  { id: 'Document', label: 'Document', type: 'Attachments' },
];

const ITEM_COLUMNS = [
  { id: 'Invoice', label: 'Invoice', type: 'Ref:Invoices' },
  { id: 'Description', label: 'Description', type: 'Text' },
  { id: 'Quantity', label: 'Quantity', type: 'Numeric' },
  { id: 'Price', label: 'Unit price', type: 'Numeric' },
  { id: 'Total', label: 'Amount', type: 'Numeric' },
  { id: 'TaxClass', label: 'Tax class', type: 'Text' },
  { id: 'HSN', label: 'HSN/SAC', type: 'Text' },
];

/**
 * Trades whose template lines are prompts rather than data.
 *
 * A template's `lines` seed a blank new document, so "Product name (SKU)" priced at nothing is
 * exactly right there: it tells somebody what to type. As sample data it is useless, because every
 * invoice in the document then totals nothing. These two shops get a real basket instead; every
 * other trade's lines are already priced work and are used as they are.
 */
const SAMPLE_LINES = {
  retail: [
    { description: 'Enamel mug', quantity: 2, unitPrice: 11.5 },
    { description: 'Cotton tote bag', quantity: 1, unitPrice: 14 },
    { description: 'Notebook, A5, ruled', quantity: 3, unitPrice: 8.75 },
  ],
  ecommerce: [
    { description: 'Linen cushion cover, 45cm', quantity: 2, unitPrice: 32 },
    { description: 'Ceramic planter, small', quantity: 1, unitPrice: 18.5 },
    { description: 'Gift wrapping', quantity: 1, unitPrice: 3.5 },
  ],
};

const round2 = (n) => Math.round(n * 100) / 100;
const slug = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 12);

/**
 * The four tables, filled in for one trade.
 *
 * Row ids are not written: Grist assigns them in insert order, starting at 1. That is why the
 * reference columns below can hold plain numbers, and why the tables have to be created in this
 * order — a reference to a table that does not exist yet is rejected.
 */
export function starterTablesFor(templateId, { numberPrefix = 'INV-', grossOf = null } = {}) {
  const template = findTemplate(templateId);
  const lines = SAMPLE_LINES[templateId]
    || ((template?.lines || []).filter((l) => Number(l.unitPrice) > 0).length
      ? template.lines.filter((l) => Number(l.unitPrice) > 0)
      : [{ description: 'Services rendered', quantity: 1, unitPrice: 500 }]);

  // The catalogue is whatever the trade sells, so the composer's product picker has something in it.
  const products = lines.map((l, i) => ({
    SKU: slug(l.description) || `ITEM-${i + 1}`,
    Name: l.description,
    Price: l.unitPrice,
    Unit: l.unit || '',
    Stock: 25,
    TaxClass: '',
    HSN: '',
  }));

  const year = new Date().getFullYear();
  const num = (n) => `${numberPrefix}${year}-${String(n).padStart(4, '0')}`;

  // Four invoices, deliberately in four different states, so aging, chasing and the paid case are
  // all visible without anybody having to build them by hand.
  // The Currency column exists but is left empty on every row. An empty cell means "the business
  // currency, whatever it is set to", so changing that setting later changes these documents too.
  // Stamping today's setting into the rows would freeze them in it forever — which is right for an
  // invoice deliberately billed in another currency, and wrong as a side effect of setup.
  const invoices = [
    { InvoiceNumber: num(1), Client: 1, Issued: day(-52), Due: day(-22), Status: 'Overdue',
      Terms: template?.terms || 'Net 30', Reference: 'PO-4471',
      Note: 'Second reminder sent. Client says payment is with their finance team.' },
    { InvoiceNumber: num(2), Client: 2, Issued: day(-34), Due: day(-4), Status: 'Paid',
      Terms: template?.terms || 'Net 30', PaidDate: day(-6),
      AmountPaid: 0, Note: '' },
    { InvoiceNumber: num(3), Client: 3, Issued: day(-11), Due: day(19), Status: 'Sent',
      Terms: template?.terms || 'Net 30', SentAt: day(-11),
      SentTo: CLIENTS[2].Email, Note: '' },
    { InvoiceNumber: num(4), Client: 1, Issued: day(-1), Due: day(29), Status: 'Draft',
      Terms: template?.terms || 'Net 30', Note: '' },
  ];

  // Each invoice gets a couple of lines off the catalogue, varied so the totals differ.
  const items = [];
  invoices.forEach((_, index) => {
    const invoiceRow = index + 1;
    lines.forEach((l, j) => {
      if (j > 1 && index % 2 === 0) return;    // the shorter invoices get fewer lines
      const quantity = (l.quantity || 1) + (index % 2 ? 1 : 0);
      items.push({
        Invoice: invoiceRow,
        Description: l.description,
        Quantity: quantity,
        Price: l.unitPrice,
        Total: round2(quantity * l.unitPrice),
        TaxClass: '',
        HSN: '',
      });
    });
  });

  // The stored Total on each invoice, so the ledger reads correctly in Grist itself. It is the net
  // of the lines, which is what a Total column in a Grist invoice table conventionally holds.
  //
  // Amount paid is deliberately NOT that figure. Paid means paid in full, and what a customer
  // actually pays includes the tax the invoice adds on top — so a net amount paid renders a paid
  // invoice with a balance outstanding of exactly the VAT. grossOf is how the caller, which is the
  // only thing that knows the tax settings, supplies the real figure.
  invoices.forEach((inv, index) => {
    const mine = items.filter((it) => it.Invoice === index + 1);
    inv.Total = round2(mine.reduce((a, it) => a + it.Total, 0));
    if (inv.Status !== 'Paid') return;
    const client = CLIENTS[inv.Client - 1] || {};
    const gross = grossOf ? grossOf({
      lines: mine.map((it) => ({ description: it.Description, quantity: it.Quantity, unitPrice: it.Price })),
      address: { country: client.Country, state: client.State, city: client.City, postcode: client.Zip },
    }) : inv.Total;
    inv.AmountPaid = round2(Number.isFinite(gross) ? gross : inv.Total);
  });

  // Order matters: a Ref column cannot point at a table Grist has not created yet.
  return [
    { id: 'Clients', label: 'Clients', columns: CLIENT_COLUMNS, records: CLIENTS },
    { id: 'Products', label: 'Products', columns: PRODUCT_COLUMNS, records: products },
    { id: 'Invoices', label: 'Invoices', columns: INVOICE_COLUMNS, records: invoices },
    { id: 'InvoiceItems', label: 'Invoice items', columns: ITEM_COLUMNS, records: items },
  ];
}

/** What a document is missing, so an existing table is never overwritten. */
export function missingFrom(existingTableIds, tables) {
  const have = new Set(existingTableIds || []);
  return tables.filter((t) => !have.has(t.id));
}
