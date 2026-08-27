import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const T = await import(pathToFileURL(_resolve(ROOT, 'src/templates/index.js')).href);
const stock = await import(pathToFileURL(_resolve(ROOT, 'src/model/stock.js')).href);
const { sanitise } = await import(pathToFileURL(_resolve(ROOT, 'src/settings/store.js')).href);
const { documentKind } = await import(pathToFileURL(_resolve(ROOT, 'src/doc/kinds.js')).href);
const { isLayout } = await import(pathToFileURL(_resolve(ROOT, 'src/doc/layouts.js')).href);

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

ok('grouped by sector for the chooser', T.templatesBySector().length > 3);
eq('every template appears exactly once when grouped',
  T.templatesBySector().reduce((n, g) => n + g.items.length, 0), 14);

// The trades that actually differ, differ.
eq('a shop advertises tax-inclusive prices', T.findTemplate('retail').money.pricesIncludeTax, true);
eq('a shop issues receipts, not invoices', T.findTemplate('retail').kind, 'receipt');
// A donation is not a sale, and charging tax on one is wrong in a way a regulator notices.
eq('a charity charges no tax', T.findTemplate('nonprofit').money.taxEnabled, false);
ok('and says no goods were given in return', /No goods or services/.test(T.findTemplate('nonprofit').note));
eq('an online shop starts with a packing slip', T.findTemplate('ecommerce').kind, 'packing_slip');
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
