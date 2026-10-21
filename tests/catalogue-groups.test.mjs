// The catalogue as products (1.29.0).
//
// From a German user's third round. The sidebar listed every row of the catalogue in table order:
// a product with three prices was three entries, categories could be searched for but not chosen,
// and the German words for Refresh, Edit and New ran past the column's edge. Now the list is one
// entry per product, grouped by category and A to Z, with a category to narrow it by; a product's
// prices over time sit on its form, the next one a press away; and the head keeps its buttons
// inside the column in any language.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => import(pathToFileURL(_resolve(ROOT, p)).href);
const src = (p) => readFileSync(_resolve(ROOT, p), 'utf8');

const C = await load('src/model/catalogue.js');
const S = await load('src/model/schema.js');
const { translateText } = await load('src/i18n/ui.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

// ---------------------------------------------------------------------------------------------
// What makes two rows one product
// ---------------------------------------------------------------------------------------------
{
  eq('a SKU is the product', S.productKey('Consulting', 'DAY'), 'sku:day');
  eq('whatever its case', S.productKey('x', 'Day '), 'sku:day');
  eq('without a SKU, the name is', S.productKey(' Beratung ', ''), 'name:beratung');
  eq('two SKUs with one name are two products', S.productKey('T-shirt', 'TS-S') === S.productKey('T-shirt', 'TS-M'), false);
  eq('nothing at all is no key', S.productKey('', null), '');
}

// ---------------------------------------------------------------------------------------------
// The catalogue that was tried: three prices for one service, two sections, one item with none
// ---------------------------------------------------------------------------------------------
const COLS = [
  { id: 'Name', type: 'Text' }, { id: 'SKU', type: 'Text' }, { id: 'Price', type: 'Numeric' }, { id: 'Unit', type: 'Text' },
  { id: 'Category', type: 'Text' }, { id: 'ValidFrom', type: 'Date' }, { id: 'ValidUntil', type: 'Date' }, { id: 'Image', type: 'Text' },
];
const ROWS = [
  { id: 1, Name: 'Hausbesuch', SKU: 'VISIT', Price: 39, Unit: 'visit', Category: 'Besuche', ValidFrom: '2026-01-01', ValidUntil: '2026-11-30', Image: 'pic-1' },
  { id: 2, Name: 'Hausbesuch', SKU: 'VISIT', Price: 45, Unit: 'visit', Category: '', ValidFrom: '2026-12-01', ValidUntil: '', Image: null },
  { id: 3, Name: 'Hausbesuch', SKU: 'VISIT', Price: 49, Unit: 'visit', Category: 'Besuche', ValidFrom: '2027-01-01', ValidUntil: '', Image: null },
  { id: 4, Name: 'Stiefelfüllung groß', SKU: 'BOOT-L', Price: 24, Unit: 'boot', Category: 'Stiefel', ValidFrom: '', ValidUntil: '', Image: null },
  { id: 5, Name: 'Stiefelfüllung klein', SKU: 'BOOT-S', Price: 12, Unit: 'boot', Category: 'Stiefel', ValidFrom: '', ValidUntil: '', Image: null },
  { id: 6, Name: 'Rute, symbolisch', SKU: '', Price: 5, Unit: '', Category: '', ValidFrom: '', ValidUntil: '', Image: null },
  { id: 7, Name: 'Altes Angebot', SKU: '', Price: 10, Unit: '', Category: 'Stiefel', ValidFrom: '', ValidUntil: '2025-12-31', Image: null },
];
const tables = [
  { id: 'Invoices', columns: [{ id: 'InvoiceNumber', type: 'Text' }, { id: 'Client', type: 'Text' }, { id: 'Issued', type: 'Date' }] },
  { id: 'Products', columns: COLS },
];
const schema = S.detectSchema(tables);
const products = S.detectProducts(tables, schema);
const provider = { records: (t) => (t === 'Products' ? ROWS : []) };
const TODAY = '2026-10-21';

{
  const items = C.catalogueItems(products, provider, { today: TODAY });
  eq('one entry per product, A to Z', items.map((i) => i.name), ['Altes Angebot', 'Hausbesuch', 'Rute, symbolisch', 'Stiefelfüllung groß', 'Stiefelfüllung klein']);
  const visit = items.find((i) => i.sku === 'VISIT');
  eq('the version in force today is the one to open', visit.id, 1);
  eq('with its price', visit.price, 39);
  eq('its three prices, earliest start first', visit.versions.map((v) => [v.id, v.price, v.current]), [[1, 39, true], [2, 45, false], [3, 49, false]]);
  eq('the category travels with the product', visit.category, 'Besuche');
  eq('and so does the picture', visit.image, 'pic-1');
  eq('an undated item is always current', items.find((i) => i.sku === 'BOOT-L').versions[0].current, true);
  eq('an item that ended opens on its last version', items.find((i) => i.name === 'Altes Angebot').id, 7);
}
{
  const dec = C.catalogueItems(products, provider, { today: '2026-12-15' }).find((i) => i.sku === 'VISIT');
  eq('in December the second price is current', [dec.id, dec.price], [2, 45]);
  eq('and the first is not', dec.versions.map((v) => v.current), [false, true, false]);
  const nov = C.catalogueItems(products, provider, { today: '2025-11-01' }).find((i) => i.sku === 'VISIT');
  eq('before any price started, the next to start is shown', [nov.id, nov.price, nov.versions.some((v) => v.current)], [1, 39, false]);
  eq('the picker and the list agree on the December price', S.productOptions(products, provider, { date: '2026-12-15' }).find((p) => p.sku === 'VISIT').unitPrice, 45);
  eq('and on the name key where there is no SKU', S.productOptions(products, provider, { date: TODAY }).filter((p) => p.name === 'Rute, symbolisch').length, 1);
}

// ---------------------------------------------------------------------------------------------
// Sections and the chooser
// ---------------------------------------------------------------------------------------------
{
  const items = C.catalogueItems(products, provider, { today: TODAY });
  eq('the categories in use, A to Z', C.categoriesOf(items), ['Besuche', 'Stiefel']);
  const groups = C.groupByCategory(items);
  eq('a section per category, the uncategorised last', groups.map((g) => g.category), ['Besuche', 'Stiefel', '']);
  eq('the products A to Z within each', groups[1].items.map((i) => i.name), ['Altes Angebot', 'Stiefelfüllung groß', 'Stiefelfüllung klein']);
  eq('nothing uncategorised, no empty section', C.groupByCategory(items.filter((i) => i.category)).map((g) => g.category), ['Besuche', 'Stiefel']);
  eq('A to Z is a person’s: case does not count, 10 follows 9', ['b', 'A', 'item 10', 'item 9'].sort(C.alpha), ['A', 'b', 'item 9', 'item 10']);
}

// ---------------------------------------------------------------------------------------------
// The words beside a product, and a version's span
// ---------------------------------------------------------------------------------------------
{
  const items = C.catalogueItems(products, provider, { today: TODAY });
  const visit = items.find((i) => i.sku === 'VISIT');
  eq('a product with versions says how many', C.catalogueSubline(visit), 'Besuche · VISIT · visit · 3 prices');
  eq('one dated price says when it starts', C.catalogueSubline({ category: '', sku: 'X', unit: '', validFrom: '2026-12-01', versions: [{}] }), 'X · from 2026-12-01');
  eq('an undated one says nothing of the sort', C.catalogueSubline(items.find((i) => i.sku === 'BOOT-L')), 'Stiefel · BOOT-L · boot');
  eq('in German', C.catalogueSubline(visit, (s) => translateText(s, 'de')), 'Besuche · VISIT · visit · 3 Preise');
  eq('and the start day in German', C.catalogueSubline({ category: '', sku: 'X', unit: '', validFrom: '2026-12-01', versions: [{}] }, (s) => translateText(s, 'de')), 'X · ab 2026-12-01');
  eq('a span with both days', C.versionSpan({ validFrom: '2026-01-01', validTo: '2026-11-30' }), '2026-01-01 – 2026-11-30');
  eq('from a day', translateText(C.versionSpan({ validFrom: '2026-12-01', validTo: '' }), 'de'), 'ab 2026-12-01');
  eq('until a day', translateText(C.versionSpan({ validFrom: '', validTo: '2025-12-31' }), 'de'), 'bis 2025-12-31');
  eq('no days at all', [C.versionSpan({ validFrom: '', validTo: '' }), translateText('always', 'de')], ['always', 'immer']);
}

// ---------------------------------------------------------------------------------------------
// Wired in: the sidebar, the form, the picker, the head
// ---------------------------------------------------------------------------------------------
{
  const main = src('src/main.js');
  ok('the catalogue list is the products', /catalogueItems\(src, app\.provider\)\.map/.test(main));
  ok('clients are A to Z', /\.sort\(\(a, b\) => alpha\(a\.name, b\.name\)\)/.test(main));
  ok('a category chooser narrows the catalogue', /pick\('Category', \[\{ value: '', label: 'Any category' \}/.test(main));
  ok('the list is read by section', /groupByCategory\(rows\)/.test(main) && /class: 'studio-side__group'/.test(main));
  ok('a category heading is the person’s own word', /text: sec\.category \|\| 'Other', dataset: sec\.category \? \{ nt: '' \} : null/.test(main));
  ok('a product is active whichever of its versions is open', /\(r\.versions \|\| \[\]\)\.some\(\(v\) => v\.id === app\.record\.rowId\)/.test(main));
  ok('the form gets the product’s prices', /priceHistory: history \? \{/.test(main));
  ok('the next price starts today, in a New form', /onNewPrice: \(\) => openRecordWith\(kind, \{ \.\.\.values, validFrom: todayKey\(\), validTo: '' \}\)/.test(main));
  ok('a duplicate carries no dates', /onDuplicate: kind === 'product' && rowId != null \? \(\) => openRecordWith\(kind, \{ \.\.\.values, validFrom: '', validTo: '' \}\)/.test(main));
  ok('the head is the count and one group of buttons', /class: 'studio-side__countbox'/.test(main) && /class: 'studio-side__actions' \}, \[refreshBtn, editBtn, newBtn\]/.test(main));

  const form = src('src/compose/record-form.js');
  ok('the form lists the versions', /function priceList\(\{ versions, rowId, onOpen \}, money\)/.test(form));
  ok('each a press away, except the one open', /if \(!editing\) onOpen\(v\.id\)/.test(form));
  ok('with New price and Duplicate beside them', /button\('New price from a date', priceHistory\.onNewPrice/.test(form) && /button\('Duplicate', onDuplicate/.test(form));

  const grid = src('src/compose/lines-grid.js');
  ok('the picker is A to Z within sections, sections A to Z', /sort\(\(\[a\], \[b\]\) => alpha\(a\.name, b\.name\) \|\| alpha\(a\.sku, b\.sku\)\)/.test(grid) && /groups\.filter\(\(g\) => g\)\.sort\(alpha\)/.test(grid));

  const css = src('src/styles/studio.css');
  ok('the head wraps its button group as one', /\.studio-side__head \{[^}]*flex-wrap: wrap/.test(css) && /\.studio-side__actions \{[^}]*flex: none/.test(css));
  ok('the count takes what is left and clips', /\.studio-side__countbox \{[^}]*flex: 1 1 0; min-width: 0; overflow: hidden/.test(css));
  ok('German gets a wider column', /html\[data-ui-lang="de"\] \.studio-side \{ width: 300px; \}/.test(css));
  ok('and Edit’s reservation covers Bearbeiten and Schließen', /html\[data-ui-lang="de"\] \.studio-side__head \.studio-btn--edit \{ min-width: 88px; \}/.test(css));
  const ccss = src('src/styles/composer.css');
  ok('a button in a form cell wraps rather than overflows', /\.rec-missing \.cmp-btn, \.cmp-field > \.cmp-btn \{ white-space: normal/.test(ccss));
}

console.log(`\ncatalogue-groups: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
