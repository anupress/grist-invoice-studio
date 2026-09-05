// Setting up a document that has nothing in it yet.
//
// Pointing this widget at a fresh Grist document used to produce "No invoices found in this
// document" and no way forward, which is a dead end at exactly the moment somebody is deciding
// whether the thing is worth using. This builds the four tables it needs and fills them with a
// complete sample business — clients, a catalogue, five documents in five states — so the first
// screen after connecting is a working document rather than an explanation of why there isn't one.
//
// Everything comes from ./samples.js, per trade: a builder gets labour and materials and clients
// with job references, a café gets lunches and a catering account. What the four tables are
// called and which columns they carry is the same for every trade — what differs between trades
// is what is sold and to whom, not how it is stored.
//
// Everything here is invented. No real business, person or address appears, and none should: this
// data ends up in screenshots and in other people's documents.

import { findTemplate } from './index.js';
import { SAMPLES, sampleFor, sampleLinesFor } from './samples.js';
import { documentKind, KIND_WORDS } from '../doc/kinds.js';

const iso = (d) => d.toISOString().slice(0, 10);
const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return iso(d); };

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
  // The language their documents are written in: de, fr, es, it, nl, pl, pt. Empty means the
  // business's own default. A few sample clients abroad carry one, so the feature shows itself.
  { id: 'Language', label: 'Language', type: 'Text' },
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
  // When the work was done. German invoices must carry it; the sample says the invoice date.
  { id: 'ServiceDate', label: 'Service date', type: 'Date' },
  { id: 'Status', label: 'Status', type: 'Choice',
    widgetOptions: JSON.stringify({ choices: ['Draft', 'Sent', 'Part paid', 'Paid', 'Overdue', 'Cancelled'], choiceOptions: {} }) },
  // Which kind of document the row is, so one table holds invoices, quotes, credit notes and
  // receipts and each opens as itself. A café's table has till receipts and a catering account
  // in it; before this column, both showed as whatever the bar said.
  { id: 'Kind', label: 'Kind', type: 'Choice',
    widgetOptions: JSON.stringify({ choices: KIND_WORDS, choiceOptions: {} }) },
  { id: 'PaidDate', label: 'Paid', type: 'Date' },
  { id: 'AmountPaid', label: 'Amount paid', type: 'Numeric' },
  { id: 'Currency', label: 'Currency', type: 'Text' },
  { id: 'Reference', label: 'Their reference', type: 'Text' },
  { id: 'Terms', label: 'Payment terms', type: 'Text' },
  { id: 'Note', label: 'Note', type: 'Text' },
  { id: 'Total', label: 'Total', type: 'Numeric' },
  { id: 'SentAt', label: 'Sent', type: 'Date' },
  { id: 'SentTo', label: 'Sent to', type: 'Text' },
  // The document this one corrects or follows — filled in when a credit note is raised against
  // an invoice, or an invoice from a quote.
  { id: 'RelatedTo', label: 'Related to', type: 'Text' },
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
  { id: 'Unit', label: 'Unit', type: 'Text' },
];

/** The lines of each trade's first sample document, for the preview drawn before setup. */
export const SAMPLE_LINES = Object.fromEntries(Object.keys(SAMPLES).map((id) => [id, sampleLinesFor(id)]));

const round2 = (n) => Math.round(n * 100) / 100;

/** The sample business identity for a trade — what the document says when nothing has been typed. */
export function sampleBusinessFor(templateId) {
  const s = sampleFor(templateId);
  return { ...s.business, paymentDetails: s.paymentDetails || '' };
}

/**
 * The four tables, filled in for one trade.
 *
 * Row ids are not written: Grist assigns them in insert order, starting at 1. That is why the
 * reference columns below can hold plain numbers, and why the tables have to be created in this
 * order — a reference to a table that does not exist yet is rejected.
 */
export function starterTablesFor(templateId, { numberPrefix = 'INV-', grossOf = null, empty = false } = {}) {
  // The same four tables with nothing in them, for someone who wants the structure and not the
  // sample. Columns are identical, so the two paths never diverge.
  if (empty) {
    return [
      { id: 'Clients', label: 'Clients', columns: CLIENT_COLUMNS, records: [] },
      { id: 'Products', label: 'Products', columns: PRODUCT_COLUMNS, records: [] },
      { id: 'Invoices', label: 'Invoices', columns: INVOICE_COLUMNS, records: [] },
      { id: 'InvoiceItems', label: 'Invoice items', columns: ITEM_COLUMNS, records: [] },
    ];
  }
  const template = findTemplate(templateId);
  const sample = sampleFor(templateId);
  const terms = template?.terms || 'Net 30';

  const clients = sample.clients.map((c) => ({ ...c }));

  // The catalogue is what the trade sells, so the composer's product picker has something in it.
  const products = sample.products.map((p, i) => ({
    SKU: p.SKU || `ITEM-${i + 1}`,
    Name: p.Name,
    Price: p.Price,
    Unit: p.Unit || '',
    Stock: p.Stock != null ? p.Stock : 25,
    TaxClass: p.TaxClass || '',
    HSN: p.HSN || '',
    // The shop trades ship with pictograms so the thumbnail feature is visible from the first
    // second; every other trade's column starts empty and the document stays picture-free.
    Image: p.Image || '',
  }));

  const year = new Date().getFullYear();
  const num = (n) => `${numberPrefix}${year}-${String(n).padStart(4, '0')}`;

  // Five documents, deliberately in five different states, so aging, chasing, a deposit and the
  // paid case are all visible without anybody having to build them by hand.
  //
  // The Currency column exists but is left empty on every row. An empty cell means "the business
  // currency, whatever it is set to", so changing that setting later changes these documents too.
  // Stamping today's setting into the rows would freeze them in it forever — which is right for an
  // invoice deliberately billed in another currency, and wrong as a side effect of setup.
  const invoices = sample.invoices.map((inv, index) => {
    const client = clients[inv.client - 1] || clients[0];
    const issued = day(-inv.age);
    const due = day(-inv.age + inv.terms);
    const row = {
      InvoiceNumber: num(index + 1),
      Client: inv.client,
      Issued: issued,
      Due: due,
      ServiceDate: issued,
      Status: inv.status,
      // The document's own kind where the sample says so — a till receipt for the paid sale, an
      // invoice for the trade account — and the trade's default kind otherwise.
      Kind: documentKind(inv.kind || template?.kind || 'invoice').word,
      Terms: inv.status === 'Draft' && !inv.terms ? terms : terms,
      Reference: inv.reference || '',
      Note: inv.note || '',
      AmountPaid: 0,
    };
    if (inv.status === 'Sent' || inv.status === 'Overdue' || inv.status === 'Part paid' || inv.status === 'Paid') {
      row.SentAt = issued;
      row.SentTo = client.Email || '';
    }
    if (inv.status === 'Paid') row.PaidDate = day(Math.min(-1, -inv.age + Math.max(1, Math.floor(inv.terms / 2))));
    return row;
  });

  // The lines, priced off the catalogue.
  const items = [];
  sample.invoices.forEach((inv, index) => {
    for (const [p, qty] of inv.lines) {
      const prod = products[p] || products[0];
      items.push({
        Invoice: index + 1,
        Description: prod.Name,
        Quantity: qty,
        Price: prod.Price,
        Total: round2(qty * prod.Price),
        TaxClass: prod.TaxClass || '',
        HSN: prod.HSN || '',
        Unit: prod.Unit || '',
      });
    }
  });

  // The stored Total on each invoice, so the ledger reads correctly in Grist itself. It is the net
  // of the lines, which is what a Total column in a Grist invoice table conventionally holds.
  //
  // Amount paid is deliberately NOT that figure. Paid means paid in full, and what a customer
  // actually pays includes the tax the invoice adds on top — so a net amount paid renders a paid
  // invoice with a balance outstanding of exactly the VAT. grossOf is how the caller, which is the
  // only thing that knows the tax settings, supplies the real figure. A part payment is half of it.
  invoices.forEach((inv, index) => {
    const mine = items.filter((it) => it.Invoice === index + 1);
    inv.Total = round2(mine.reduce((a, it) => a + it.Total, 0));
    if (inv.Status !== 'Paid' && inv.Status !== 'Part paid') return;
    const client = clients[inv.Client - 1] || {};
    const gross = grossOf ? grossOf({
      lines: mine.map((it) => ({ description: it.Description, quantity: it.Quantity, unitPrice: it.Price })),
      address: { country: client.Country, state: client.State, city: client.City, postcode: client.Zip },
    }) : inv.Total;
    const full = round2(Number.isFinite(gross) ? gross : inv.Total);
    inv.AmountPaid = inv.Status === 'Paid' ? full : round2(full / 2);
  });

  // Order matters: a Ref column cannot point at a table Grist has not created yet.
  return [
    { id: 'Clients', label: 'Clients', columns: CLIENT_COLUMNS, records: clients },
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
