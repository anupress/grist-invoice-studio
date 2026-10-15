// The catalogue, sorted and dated: categories that group the picker, and prices that change over
// time kept as rows with the day each starts, so a document is offered the price of its own date.
// Also the two smaller catalogue points from the same request: a picture keeps its PNG format, and
// an item's unit comes onto the line with its price.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => import(pathToFileURL(_resolve(ROOT, p)).href);

const S = await load('src/model/schema.js');
const R = await load('src/model/records.js');
const { buildUpgradePlan } = await load('src/model/migrate.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

const COLS = [
  { id: 'Name', type: 'Text' }, { id: 'Price', type: 'Numeric' }, { id: 'Unit', type: 'Text' },
  { id: 'Kategorie', type: 'Text' }, { id: 'Gueltig_ab', type: 'Date' }, { id: 'Gueltig_bis', type: 'Date' },
];
const ROWS = [
  { id: 1, Name: 'Beratung', Price: 90, Unit: 'Std.', Kategorie: 'Leistungen', Gueltig_ab: '2025-01-01', Gueltig_bis: '2025-12-31' },
  { id: 2, Name: 'Beratung', Price: 95, Unit: 'Std.', Kategorie: 'Leistungen', Gueltig_ab: '2026-01-01', Gueltig_bis: '' },
  { id: 3, Name: 'Beratung', Price: 99, Unit: 'Std.', Kategorie: 'Leistungen', Gueltig_ab: '2026-07-01', Gueltig_bis: '' },
  { id: 4, Name: 'Kantholz', Price: 6.5, Unit: 'm', Kategorie: 'Material', Gueltig_ab: '', Gueltig_bis: '' },
  { id: 5, Name: 'Altes Teil', Price: 10, Unit: 'Stk.', Kategorie: 'Material', Gueltig_ab: '', Gueltig_bis: '2024-12-31' },
];
const tables = [
  { id: 'Invoices', columns: [{ id: 'InvoiceNumber', type: 'Text' }, { id: 'Client', type: 'Text' }, { id: 'Issued', type: 'Date' }] },
  { id: 'Products', columns: COLS },
];
const schema = S.detectSchema(tables);
const products = S.detectProducts(tables, schema);
const provider = { records: (t) => (t === 'Products' ? ROWS : []) };

eq('German column names are recognised', [products.roles.category, products.roles.validFrom, products.roles.validTo], ['Kategorie', 'Gueltig_ab', 'Gueltig_bis']);
eq('and so are English ones', S.mapRoles([{ id: 'Category' }, { id: 'ValidFrom', type: 'Date' }, { id: 'ValidUntil', type: 'Date' }], { category: [/^category$/i], validFrom: [/^valid_?from$/i], validTo: [/^valid_?(to|until)$/i] }), { category: 'Category', validFrom: 'ValidFrom', validTo: 'ValidUntil' });
ok('a data drawer can pin them', ['category', 'validFrom', 'validTo'].every((r) => S.ROLES_BY_PART.product.includes(r)));

const priceOn = (date, name = 'Beratung') => S.productOptions(products, provider, { date }).filter((p) => p.name === name).map((p) => p.unitPrice);
eq('without a date, every row is offered', S.productOptions(products, provider).length, 5);
eq('a document from 2025 gets the 2025 price', priceOn('2025-06-15'), [90]);
eq('one from March 2026 the January price', priceOn('2026-03-01'), [95]);
eq('one from August 2026 the July price, not both', priceOn('2026-08-01'), [99]);
eq('the first day counts', priceOn('2026-07-01'), [99]);
eq('the last day counts', priceOn('2025-12-31'), [90]);
eq('an item without dates is always offered', priceOn('2030-01-01', 'Kantholz'), [6.5]);
eq('an item that has ended is not', priceOn('2026-01-01', 'Altes Teil'), []);
eq('an epoch date reads the same as a day', priceOn(Date.UTC(2026, 2, 1) / 1000), [95]);
{
  const p = S.productOptions(products, provider, { date: '2026-08-01' }).find((x) => x.name === 'Beratung');
  eq('an option carries its category and unit', [p.category, p.unit], ['Leistungen', 'Std.']);
}
{
  const plain = S.detectProducts([tables[0], { id: 'Products', columns: COLS.slice(0, 3) }], schema);
  eq('a catalogue without dates offers everything, whatever the date', S.productOptions(plain, provider, { date: '2026-08-01' }).length, 5);
}

// ---------------------------------------------------------------------------------------------
// The form and the columns
// ---------------------------------------------------------------------------------------------
ok('the catalogue form asks for the category and the dates', ['category', 'validFrom', 'validTo'].every((r) => R.PRODUCT_FORM.some((f) => f.role === r)));
ok('the dates are dates', R.PRODUCT_FORM.filter((f) => /^valid/.test(f.role)).every((f) => f.type === 'date'));
eq('one press adds each column', [R.ADDABLE.product.category, R.ADDABLE.product.validFrom, R.ADDABLE.product.validTo], ['Category', 'ValidFrom', 'ValidUntil']);
{
  ok('they are not pushed on every catalogue', !S.upgradeChecklist(schema, products).product.some((i) => ['Category', 'ValidFrom', 'ValidUntil'].includes(i.id)));
  const bare = S.detectProducts([tables[0], { id: 'Products', columns: COLS.slice(0, 3) }], schema);
  const plan = buildUpgradePlan(schema, { Products: COLS.slice(0, 3) }, ['ValidFrom'], bare);
  ok('but added when asked for, as a Date column', plan.ok && plan.columns[0].id === 'ValidFrom' && plan.columns[0].def.type === 'Date');
}
{
  const plan = R.recordPlan({ kind: 'product', table: 'Products', roles: products.roles, columns: COLS, values: { name: 'Beratung', unitPrice: 105, category: 'Leistungen', validFrom: '2027-01-01', validTo: '' } });
  eq('a new price version is saved with its start day', [plan.fields.Kategorie, plan.fields.Gueltig_ab], ['Leistungen', Date.UTC(2027, 0, 1) / 1000]);
}

// ---------------------------------------------------------------------------------------------
// The picker, the sidebar, the pictures
// ---------------------------------------------------------------------------------------------
const grid = readFileSync(_resolve(ROOT, 'src/compose/lines-grid.js'), 'utf8');
ok('the picker groups by category in real optgroups', /el\('optgroup', \{ label: g \|\| 'Other' \}/.test(grid));
const main = readFileSync(_resolve(ROOT, 'src/main.js'), 'utf8');
ok('the composer is offered the prices of the document’s date', /productOptions\(app\.products, app\.provider, \{ date: app\.draft\.issued \}\)/.test(main));
ok('the catalogue list shows the category and the start day', /R\.category \? r\[R\.category\]/.test(main) && /`from \$\{r\[R\.validFrom\]\}`/.test(main));
ok('the form suggests the categories already in use', /category: categories\.map/.test(main));
const form = readFileSync(_resolve(ROOT, 'src/compose/record-form.js'), 'utf8');
ok('a picture that is not a JPEG stays a PNG', /const keepPng = !!file\.type && !\/\^image\\\/jpe\?g\$\/i\.test\(file\.type\)/.test(form) && /canvas\.toDataURL\('image\/png'\)/.test(form));
ok('and is uploaded as one', /\/\^data:image\\\/png\/\.test\(toSave\.image\) \? 'png' : 'jpg'/.test(main));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
