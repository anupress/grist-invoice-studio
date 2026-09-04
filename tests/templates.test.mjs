import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const T = await import(pathToFileURL(_resolve(ROOT, 'src/templates/index.js')).href);
const stock = await import(pathToFileURL(_resolve(ROOT, 'src/model/stock.js')).href);
const { sanitise } = await import(pathToFileURL(_resolve(ROOT, 'src/settings/store.js')).href);
const m2 = await import(pathToFileURL(_resolve(ROOT, 'src/model/schema.js')).href);
const { documentKind } = await import(pathToFileURL(_resolve(ROOT, 'src/doc/kinds.js')).href);
const { isLayout, LAYOUTS } = await import(pathToFileURL(_resolve(ROOT, 'src/doc/layouts.js')).href);

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

// ---------------------------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------------------------
eq('fourteen trades', T.TEMPLATES.length, 14);
eq('ids are unique', new Set(T.TEMPLATES.map((t) => t.id)).size, 14);

// Every one has to be complete, or applying it produces a document referring to something that
// does not exist.
for (const t of T.TEMPLATES) {
  ok(`${t.id} has a label`, typeof t.label === 'string' && t.label.length > 3);
  ok(`${t.id} names a real document kind`, documentKind(t.kind).id === t.kind);
  ok(`${t.id} names a real layout`, !t.document?.layout || isLayout(t.document.layout));
  ok(`${t.id} has at least one starter line`, (t.lines || []).length > 0);
  for (const [kind] of Object.entries((t.numbering || {}).prefixes || {})) {
    ok(`${t.id}'s prefix is for a real kind`, documentKind(kind).id === kind);
  }
}

// Eight layouts, each a real choice with a label the choosers can show.
eq('eight layouts', LAYOUTS.length, 8);
eq('their ids are unique', new Set(LAYOUTS.map((l) => l.id)).size, 8);
ok('each accepted by the validator', LAYOUTS.every((l) => isLayout(l.id)));
ok('each with a label', LAYOUTS.every((l) => typeof l.label === 'string' && l.label.length > 2));
ok('and nonsense still is not one', !isLayout('gothic'));

ok('grouped by sector for the chooser', T.templatesBySector().length > 3);
eq('every template appears exactly once when grouped',
  T.templatesBySector().reduce((n, g) => n + g.items.length, 0), 14);

// The trades that actually differ, differ.
eq('a shop advertises tax-inclusive prices', T.findTemplate('retail').money.pricesIncludeTax, true);
eq('a shop issues receipts, not invoices', T.findTemplate('retail').kind, 'receipt');
// A donation is not a sale, and charging tax on one is wrong in a way a regulator notices.
eq('a charity charges no tax', T.findTemplate('nonprofit').money.taxEnabled, false);
ok('and says no goods were given in return', /No goods or services/.test(T.findTemplate('nonprofit').note));
// A shop's document is the order invoice; the packing slip is made from it. The template once
// started with the slip, which built five sample slips marked overdue and part paid.
eq('an online shop starts with an invoice', T.findTemplate('ecommerce').kind, 'invoice');
eq('and keeps its own numbering for the packing slips it makes', T.findTemplate('ecommerce').numbering.prefixes.packing_slip, 'PS-{YYYY}-');
ok('its starter lines carry prices', T.findTemplate('ecommerce').lines.every((l) => l.unitPrice > 0));
// The label names the trade; what the trade decides is said separately.
ok('labels name the trade, not a document type', T.TEMPLATES.every((t) => !/—|receipt|slip/i.test(t.label)));

// What picking a trade decides, in a few words.
{
  const now = new Date('2026-09-04T12:00:00Z');
  const words = (id) => T.templateSummary(T.findTemplate(id), now);
  eq('a shop: receipts, minimal, tax-inclusive, numbered by the day', words('retail'), ['receipts', 'Minimal layout', 'prices include tax', 'numbered R20260904-0001']);
  eq('a charity: receipts with no tax', words('nonprofit'), ['receipts', 'Banded layout', 'no tax', 'numbered DON-2026-0001']);
  eq('rent restarts monthly and asks for the agreement', words('rental'), ['invoices', 'Classic layout', 'numbered RENT-202609-0001', 'numbers restart monthly', 'asks for the agreement number']);
  ok('a freelancer says little, because the template sets little', words('freelancer').length <= 2);
  eq('no template, no words', T.templateSummary(null), []);
}
eq('a legal practice numbers matters', T.findTemplate('legal').document.referenceLabel, 'Matter reference');
eq('a garage asks for the registration', T.findTemplate('auto').document.referenceLabel, 'Registration');
eq('rent restarts its numbering monthly', T.findTemplate('rental').numbering.resetPeriod, 'monthly');

// ---- applying one --------------------------------------------------------------------------
const settings = sanitise({ business: { name: 'Thornbury Works', email: 'a@b.example' }, document: { layout: 'classic' } });
const applied = T.applyTemplate(T.findTemplate('construction'), settings);

eq('the layout changes', applied.document.layout, 'banded');
eq('the wording changes', applied.document.referenceLabel, 'Job reference');
// A template that overwrote somebody's own name and address would be unforgivable.
eq('the business is never touched', applied.business.name, 'Thornbury Works');
eq('nor its email', applied.business.email, 'a@b.example');
// Settings the template says nothing about must survive.
eq('untouched settings survive', applied.money.currency, settings.money.currency);
eq('and the prefixes it does not mention', applied.numbering.prefixes.quote, settings.numbering.prefixes.quote);
eq('applying returns a new object', applied === settings, false);
eq('and leaves the original alone', settings.document.layout, 'classic');

// A prefix override merges rather than replacing the whole map.
const legal = T.applyTemplate(T.findTemplate('legal'), settings);
eq('the invoice prefix changes', legal.numbering.prefixes.invoice, 'LI-{YYYY}-');
eq('the others are kept', legal.numbering.prefixes.credit_note, settings.numbering.prefixes.credit_note);

// What it will change, said before it changes it.
const changes = T.templateChanges(T.findTemplate('construction'), settings);
ok('the changes are listed', changes.length > 0);
ok('each names a path', changes.every((c) => typeof c.path === 'string' && c.path.includes('.')));
ok('and the layout change is among them', changes.some((c) => c.path === 'document.layout' && c.to === 'banded'));
eq('nothing to apply is no changes', T.templateChanges(null, settings), []);

const draft = T.templateDraft(T.findTemplate('freelancer'));
eq('a starter document', draft.kind, 'invoice');
eq('with a line to edit', draft.lines.length, 1);
ok('and terms', draft.terms.length > 5);

// ---------------------------------------------------------------------------------------------
// Setting up a document that has nothing in it
// ---------------------------------------------------------------------------------------------
const starter = await import(pathToFileURL(_resolve(ROOT, 'src/templates/starter.js')).href);
const built = starter.starterTablesFor('construction', { numberPrefix: 'INV-' });

eq('four tables', built.map((t) => t.id), ['Clients', 'Products', 'Invoices', 'InvoiceItems']);
// Order is not cosmetic: a Ref column cannot point at a table Grist has not created yet.
ok('referenced tables are created before the tables that point at them',
  built.findIndex((t) => t.id === 'Clients') < built.findIndex((t) => t.id === 'Invoices'));
ok('and invoices before their items',
  built.findIndex((t) => t.id === 'Invoices') < built.findIndex((t) => t.id === 'InvoiceItems'));

const byId = Object.fromEntries(built.map((t) => [t.id, t]));
ok('at least three clients', byId.Clients.records.length >= 3);
eq('with email addresses, so invoices can be sent', byId.Clients.records.every((c) => /@/.test(c.Email)), true);
eq('five invoices, one in each state', byId.Invoices.records.map((r) => r.Status).sort(), ['Draft', 'Overdue', 'Paid', 'Part paid', 'Sent']);
ok('there is something to chase', byId.Invoices.records.some((i) => i.Status === 'Overdue'));
ok('something already settled', byId.Invoices.records.some((i) => i.Status === 'Paid'));
ok('something in flight', byId.Invoices.records.some((i) => i.Status === 'Sent'));
ok('and something to finish', byId.Invoices.records.some((i) => i.Status === 'Draft'));

// Grist assigns row ids in insert order from 1, which is what makes a plain number a valid Ref.
ok('client references are row ids', byId.Invoices.records.every((i) => i.Client >= 1 && i.Client <= byId.Clients.records.length));
ok('line items point at real invoices', byId.InvoiceItems.records.every((it) => it.Invoice >= 1 && it.Invoice <= 5));
ok('every invoice has at least one line',
  [1, 2, 3, 4, 5].every((n) => byId.InvoiceItems.records.some((it) => it.Invoice === n)));

// The stored total has to agree with the lines, or the ledger reads wrongly in Grist itself.
for (const n of [1, 2, 3, 4]) {
  const inv = byId.Invoices.records[n - 1];
  const sum = byId.InvoiceItems.records.filter((it) => it.Invoice === n).reduce((a, it) => a + it.Total, 0);
  eq(`invoice ${n} total matches its lines`, inv.Total, Math.round(sum * 100) / 100);
}
const paid = byId.Invoices.records.find((i) => i.Status === 'Paid');
eq('with no tax, paid in full is the net total', paid.AmountPaid, paid.Total);

// The bug this guards: amount paid stored net leaves a PAID invoice showing a balance outstanding
// of exactly the VAT. What the customer paid is what the invoice asked for, tax included.
const { computeTotals } = await import(pathToFileURL(_resolve(ROOT, 'src/money/totals.js')).href);
const { buildPreset } = await import(pathToFileURL(_resolve(ROOT, 'src/money/tax/rates.js')).href);
const vat = { currency: 'GBP', taxEnabled: true, taxRates: buildPreset('gb-vat', {}) };
const taxed = starter.starterTablesFor('construction', {
  grossOf: ({ lines, address }) => computeTotals({ lines, addresses: { billing: address } }, vat).total,
});
const paidVat = taxed.find((t) => t.id === 'Invoices').records.find((i) => i.Status === 'Paid');
eq('with VAT, paid in full includes it', paidVat.AmountPaid, Math.round(paidVat.Total * 1.2 * 100) / 100);
ok('and the invoice is therefore settled', paidVat.AmountPaid > paidVat.Total);
// Unpaid invoices are untouched by any of this.
// The paid one and the part-paid one carry a payment; the overdue, sent and draft ones do not.
eq('only the paid and part-paid invoices carry a payment',
  taxed.find((t) => t.id === 'Invoices').records.filter((i) => i.AmountPaid > 0).map((i) => i.Status).sort(), ['Paid', 'Part paid']);
const partVat = taxed.find((t) => t.id === 'Invoices').records.find((i) => i.Status === 'Part paid');
eq('and a part payment is half the gross', partVat.AmountPaid, Math.round(partVat.Total * 1.2 / 2 * 100) / 100);

// The trade decides what is being sold, which is the whole reason it is asked for.
ok('a builder invoices for labour', byId.InvoiceItems.records.some((it) => /Labour/i.test(it.Description)));
const bakery = starter.starterTablesFor('restaurant', {});
const bakeryItems = bakery.find((t) => t.id === 'InvoiceItems').records;
ok('a restaurant does not', !bakeryItems.some((it) => /Labour/i.test(it.Description)));
ok('it sells lunch', bakeryItems.some((it) => /lunch|coffee/i.test(it.Description)));
// The catalogue is what the trade sells, so the composer's product picker is not empty.
ok('products come from the trade', byId.Products.records.some((p) => /Labour/i.test(p.Name)));
ok('and carry a price', byId.Products.records.every((p) => Number(p.Price) > 0));
ok('and a SKU', byId.Products.records.every((p) => String(p.SKU).length > 0));

eq('the numbering prefix is honoured', byId.Invoices.records[0].InvoiceNumber.startsWith('INV-'), true);
// Deliberately NOT stamped: an empty Currency cell means 'the business currency', so changing
// that setting later changes these documents too. Stamping setup's currency froze them forever.
eq('no currency is stamped on the rows', byId.Invoices.records[0].Currency, undefined);
ok('but the column exists for a document that genuinely needs one', byId.Invoices.columns.some((c) => c.id === 'Currency'));
// An unknown trade must still produce a usable document rather than an empty one.
ok('an unknown trade still builds something', starter.starterTablesFor('nonsense', {}).find((t) => t.id === 'InvoiceItems').records.length > 0);

// What goes into the atomic create versus what is added afterwards. The core's create retries the
// WHOLE table as plain Text if Grist refuses any one column type, which would turn the reference
// columns into text and leave a document that looks built but does not join up. So anything that
// might be refused has to be kept out of that bundle.
const invCols = byId.Invoices.columns;
ok('the attachments column is separated out', invCols.some((c) => c.type === 'Attachments'));
ok('reference columns are typed, not text',
  byId.Invoices.columns.find((c) => c.id === 'Client').type === 'Ref:Clients'
  && byId.InvoiceItems.columns.find((c) => c.id === 'Invoice').type === 'Ref:Invoices');
// The choice list rides on widgetOptions, which the create drops, so it must be valid JSON for the
// follow-up that re-applies it.
const status = invCols.find((c) => c.id === 'Status');
eq('status is a choice column', status.type, 'Choice');
const choices = JSON.parse(status.widgetOptions).choices;
ok('with the statuses the send rules key off', ['Draft', 'Sent', 'Paid', 'Overdue'].every((s) => choices.includes(s)));
// Every status the sample invoices actually use has to be one of them.
ok('and no sample invoice uses a status not in the list',
  byId.Invoices.records.every((i) => choices.includes(i.Status)));

// Nothing already in the document is ever replaced.
eq('an existing table is left alone', starter.missingFrom(['Clients', 'Invoices'], built).map((t) => t.id), ['Products', 'InvoiceItems']);
eq('a document that has them all needs nothing', starter.missingFrom(['Clients', 'Products', 'Invoices', 'InvoiceItems'], built), []);

// Every trade, not just the two spot-checked above: a trade whose starter document does not read
// back is one where somebody picks it off the list and lands straight back at "no invoices found".
for (const t of T.TEMPLATES) {
  const built2 = starter.starterTablesFor(t.id, {});
  const d2 = m2.detectSchema(built2.map((x) => ({ id: x.id, label: x.label, columns: x.columns })));
  eq(`${t.id}: reads back`, d2.invoice?.table, 'Invoices');
  eq(`${t.id}: nothing left to upgrade`, m2.upgradeChecklist(d2).invoice.length, 0);
  const items2 = built2.find((x) => x.id === 'InvoiceItems').records;
  ok(`${t.id}: every line is priced`, items2.every((it) => Number(it.Price) > 0 && Number(it.Quantity) > 0));
  ok(`${t.id}: every line is described`, items2.every((it) => String(it.Description).trim().length > 0));
  const invs2 = built2.find((x) => x.id === 'Invoices').records;
  ok(`${t.id}: invoice numbers are unique`, new Set(invs2.map((i) => i.InvoiceNumber)).size === invs2.length);
  ok(`${t.id}: no invoice is empty`, invs2.every((i) => i.Total > 0));
  // The catalogue is written before the invoices that quote it, so SKUs cannot collide silently.
  const prods2 = built2.find((x) => x.id === 'Products').records;
  eq(`${t.id}: SKUs are unique`, new Set(prods2.map((p) => p.SKU)).size, prods2.length);
}

// The point of all this: the result is a document this widget can actually read.
const detected = m2.detectSchema(built.map((t) => ({ id: t.id, label: t.label, columns: t.columns })));
eq('what it builds, it can read back', detected.invoice.table, 'Invoices');
eq('with the lines', detected.line.table, 'InvoiceItems');
eq('and the clients', detected.client.table, 'Clients');
eq('the invoice number is a real stored column', detected.invoice.roles.number, 'InvoiceNumber');
eq('the status is mapped', detected.invoice.roles.status, 'Status');
eq('client emails are mapped, so it can send', detected.client.roles.email, 'Email');
// The catalogue's picture column maps to the image role, which is what lets an invoice line show
// the product it bills for. Empty by default: a document without pictures stays exactly as it was.
const detProducts = m2.detectProducts(built.map((t) => ({ id: t.id, label: t.label, columns: t.columns })), detected);
eq('the catalogue image column is mapped', detProducts.roles.image, 'Image');
// The shop trades ship pictograms so the thumbnail feature is visible from the first second;
// every other trade's catalogue starts picture-free, and so do its documents.
{
  const shop = starter.starterTablesFor('retail', {}).find((t) => t.id === 'Products').records;
  ok('retail products carry pictures', shop.every((p) => String(p.Image).startsWith('data:image/svg+xml')));
  const cafe = starter.starterTablesFor('restaurant', {}).find((t) => t.id === 'Products').records;
  // The café's counter items carry pictures; its catering line, which is a service, does not.
  ok('so does the cafe', cafe.filter((p) => String(p.Image).startsWith('data:image/svg+xml')).length >= 4);
  // Attachments, because dragging a photo in is the gesture a Grist user reaches for. The data
  // URIs in the records are what the DEMO shows and what the live writer UPLOADS through the
  // attachment API — they never enter the column as text.
  eq('the Image column is Attachments — the type a person drags photos into',
    starter.starterTablesFor('retail', {}).find((t) => t.id === 'Products').columns.find((c) => c.id === 'Image').type, 'Attachments');
  const trade = starter.starterTablesFor('construction', {}).find((t) => t.id === 'Products').records;
  ok('a construction catalogue starts picture-free', trade.every((p) => !p.Image));
}
// And nothing is left for the upgrade to add to the invoice table.
eq('nothing left to upgrade', m2.upgradeChecklist(detected).invoice.length, 0);

// ---------------------------------------------------------------------------------------------
// Stock — the most destructive thing here, so the most constrained
// ---------------------------------------------------------------------------------------------
const products = { table: 'Products', roles: { name: 'Name', sku: 'SKU', unitPrice: 'Price', stock: 'Stock' } };
const rows = () => [
  { id: 1, SKU: 'DUCT-100', Name: 'Ducting, 100mm', Price: 145, Stock: 20 },
  { id: 2, SKU: 'CERT-EL', Name: 'Electrical certification', Price: 210, Stock: 3 },
  { id: 3, SKU: 'GRL-01', Name: 'Grille', Price: 22, Stock: 0 },
];
const lines = (arr) => ({ lines: arr });

// Off unless asked for. Plenty of people keep a product table purely as a price list.
eq('off by default', stock.buildStockPlan(lines([{ description: 'Ducting, 100mm', quantity: 2 }]), products, rows(), {}).ok, false);
ok('and says so', /switched off/.test(stock.buildStockPlan(lines([]), products, rows(), {}).reason));

const on = { enabled: true };
const plan = stock.buildStockPlan(lines([
  { description: 'Ducting, 100mm', quantity: 6 },
  { description: 'Electrical certification', quantity: 1 },
]), products, rows(), on);

eq('two products move', plan.updates.length, 2);
eq('by the quantity sold', plan.updates[0], { id: 1, fields: { Stock: 14 }, product: 'Ducting, 100mm', from: 20, to: 14 });
eq('and it is clean', plan.ok, true);
ok('summarised plainly', stock.describeStockPlan(plan).includes('Ducting, 100mm 20 → 14'));

// Saving an invoice twice is an ordinary thing to do. Taking the goods off twice is not.
eq('an invoice already adjusted is never adjusted again',
  stock.buildStockPlan(lines([{ description: 'Ducting, 100mm', quantity: 6 }]), products, rows(), { enabled: true, already: true }).ok, false);
ok('and says why', /already been taken off/.test(
  stock.buildStockPlan(lines([]), products, rows(), { enabled: true, already: true }).reason));

// Two entries of the same item on one invoice is ordinary. Writing each line separately would have
// the second overwrite the first rather than add to it.
const twice = stock.buildStockPlan(lines([
  { description: 'Ducting, 100mm', quantity: 4 },
  { description: 'Ducting, 100mm', quantity: 3 },
]), products, rows(), on);
eq('repeated lines are added together, not overwritten', twice.updates.length, 1);
eq('to the combined quantity', twice.updates[0].to, 13);

// A negative stock figure is not a small error — it is a number nobody can reconcile.
const short = stock.buildStockPlan(lines([{ description: 'Electrical certification', quantity: 5 }]), products, rows(), on);
eq('selling more than there is, is refused', short.ok, false);
eq('nothing is written', short.updates.length, 0);
ok('and the problem names the figures', short.problems[0].text.includes('5 sold but only 3 in stock'));
// Allowed explicitly, it goes through — some businesses do sell from an order book.
const allowed = stock.buildStockPlan(lines([{ description: 'Electrical certification', quantity: 5 }]), products, rows(), { enabled: true, allowNegative: true });
eq('unless it is explicitly allowed', allowed.updates[0].to, -2);

// Matching
eq('a SKU matches', stock.matchProduct({ description: 'DUCT-100' }, products, rows()).id, 1);
eq('an exact name matches', stock.matchProduct({ description: 'Grille' }, products, rows()).id, 3);
eq('case does not matter', stock.matchProduct({ description: 'ducting, 100mm' }, products, rows()).id, 1);
// Deliberately not fuzzy: guessing would be right most of the time, and the times it was wrong
// would move stock on the wrong product.
eq('a near miss is not a match', stock.matchProduct({ description: '100mm Ducting' }, products, rows()), null);
eq('nothing matches nothing', stock.matchProduct({ description: '' }, products, rows()), null);

const unknown = stock.buildStockPlan(lines([{ description: 'Consultancy', quantity: 1 }]), products, rows(), on);
eq('a line not in the catalogue is skipped, not guessed at', unknown.skipped.length, 1);
eq('and nothing moves', unknown.updates.length, 0);

// A blank grid row must not move anything.
eq('empty lines are ignored', stock.buildStockPlan(lines([{ description: '', quantity: 1 }]), products, rows(), on).updates.length, 0);
eq('so are zero quantities', stock.buildStockPlan(lines([{ description: 'Grille', quantity: 0 }]), products, rows(), on).updates.length, 0);

// No stock column at all is a perfectly normal document, not an error.
eq('a catalogue with no stock column is left alone',
  stock.buildStockPlan(lines([{ description: 'Grille', quantity: 1 }]), { table: 'P', roles: { name: 'Name' } }, rows(), on).ok, false);
eq('and no products at all', stock.buildStockPlan(lines([{ description: 'x', quantity: 1 }]), null, [], on).ok, false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
