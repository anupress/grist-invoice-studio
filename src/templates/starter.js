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
  // Attachments, because dragging a photo into a cell is the gesture a Grist user reaches for.
  // The sample pictograms are data URIs, which an Attachments column cannot hold — so on a live
  // document the writer UPLOADS them through Grist's attachment API after the column exists, and
  // the demo simply keeps them in memory. Both worlds get the same pictures, each in the only
  // form its column can carry.
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
// Little flat pictograms as data URIs, so the two shop trades demonstrate line thumbnails the
// moment they are chosen — in the setup sample and in the document it builds. SVG in an <img>
// runs no script, and everything drawn is invented, like all sample data here.
const PIC = (body) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 72 72'>" + body + "</svg>");

const PICS = {
  mug: PIC("<rect width='72' height='72' rx='10' fill='#eaf1fa'/><rect x='16' y='22' width='28' height='30' rx='5' fill='#14509b'/><path d='M44 28h7a7 7 0 0 1 0 14h-7' fill='none' stroke='#14509b' stroke-width='5'/>"),
  tote: PIC("<rect width='72' height='72' rx='10' fill='#f4efe4'/><path d='M20 28h32l-4 26H24z' fill='#8a5a08'/><path d='M28 28v-4a8 8 0 0 1 16 0v4' fill='none' stroke='#8a5a08' stroke-width='4'/>"),
  notebook: PIC("<rect width='72' height='72' rx='10' fill='#e9f3ec'/><rect x='20' y='16' width='34' height='40' rx='4' fill='#16704a'/><rect x='20' y='16' width='7' height='40' fill='#0e4a30'/><path d='M33 28h15M33 36h15M33 44h15' stroke='#e9f3ec' stroke-width='3'/>"),
  cushion: PIC("<rect width='72' height='72' rx='10' fill='#f6ecec'/><rect x='16' y='16' width='40' height='40' rx='12' fill='#a33830'/><circle cx='36' cy='36' r='4' fill='#f6ecec'/>"),
  planter: PIC("<rect width='72' height='72' rx='10' fill='#eef1f5'/><path d='M22 34h28l-4 22H26z' fill='#5f7285'/><path d='M36 34c0-10 6-16 14-18-1 10-6 16-14 18zm0 0c0-10-6-16-14-18 1 10 6 16 14 18z' fill='#16704a'/>"),
  lunch: PIC("<rect width='72' height='72' rx='10' fill='#f7f0e6'/><ellipse cx='36' cy='44' rx='24' ry='9' fill='#c77d2a'/><path d='M16 44a20 14 0 0 1 40 0z' fill='#e8e2d6'/><circle cx='36' cy='30' r='3' fill='#c77d2a'/>"),
  coffee: PIC("<rect width='72' height='72' rx='10' fill='#efe9e4'/><path d='M22 30h24v14a12 12 0 0 1-24 0z' fill='#5b3a24'/><path d='M46 32h5a6 6 0 0 1 0 12h-5' fill='none' stroke='#5b3a24' stroke-width='4'/><path d='M29 18c0 3-3 3-3 6m10-6c0 3-3 3-3 6' fill='none' stroke='#a98868' stroke-width='3' stroke-linecap='round'/>"),
  gift: PIC("<rect width='72' height='72' rx='10' fill='#fdf1e0'/><rect x='16' y='30' width='40' height='26' rx='3' fill='#c77d2a'/><rect x='33' y='30' width='6' height='26' fill='#fdf1e0'/><path d='M36 30c-8 0-12-4-12-8 6-2 10 2 12 8zm0 0c8 0 12-4 12-8-6-2-10 2-12 8z' fill='none' stroke='#c77d2a' stroke-width='4'/>"),
};

export const SAMPLE_LINES = {
  restaurant: [
    { description: 'Set lunch', quantity: 2, unitPrice: 18.5, image: PICS.lunch },
    { description: 'Coffee', quantity: 2, unitPrice: 3.2, image: PICS.coffee },
  ],
  retail: [
    { description: 'Enamel mug', quantity: 2, unitPrice: 11.5, image: PICS.mug },
    { description: 'Cotton tote bag', quantity: 1, unitPrice: 14, image: PICS.tote },
    { description: 'Notebook, A5, ruled', quantity: 3, unitPrice: 8.75, image: PICS.notebook },
  ],
  ecommerce: [
    { description: 'Linen cushion cover, 45cm', quantity: 2, unitPrice: 32, image: PICS.cushion },
    { description: 'Ceramic planter, small', quantity: 1, unitPrice: 18.5, image: PICS.planter },
    { description: 'Gift wrapping', quantity: 1, unitPrice: 3.5, image: PICS.gift },
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
    // The shop trades ship with pictograms so the thumbnail feature is visible from the first
    // second; every other trade's column starts empty and the document stays picture-free.
    Image: l.image || '',
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
