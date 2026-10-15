// A column added in a live document is seen at once (1.28.1).
//
// From the video production run of 1.28.0, in a real Grist document: pressing "Add category
// column" on the catalogue form added the column, but the field stayed disabled with its button
// until Refresh; "Add a column to keep it" beside the DIN remark zone added AddressNote, but the
// composer still said there was no column for it, so a Save straight after dropped the note. The
// upgrade re-read the rows and not the columns, and the provider serves columns from a cache it
// keeps for the session. The in-memory demo writes its columns directly, which is why it never
// showed. This drives the live path against a stand-in for Grist's plugin API.
//
// The form also came back empty: adding a column redraws the page, and a New form was read again
// from nothing. That half is checked against main.js's source below.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => import(pathToFileURL(_resolve(ROOT, p)).href);

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

// ---- a Grist document, as the plugin API shows it --------------------------------------------
// Invoices and Products, each described in _grist_Tables / _grist_Tables_column (column-oriented),
// with their rows.
const doc = {
  tables: {
    Invoices: { id: [1], InvoiceNumber: ['INV-1'], Client: ['Muster GmbH'], Date: [1760486400], Total: [100] },
    Products: { id: [1, 2], Name: ['Survey', 'Report'], Price: [120, 300] },
  },
  metaTables: { id: [1, 2], tableId: ['Invoices', 'Products'] },
  metaColumns: { id: [], parentId: [], colId: [], label: [], type: [], isFormula: [], formula: [], widgetOptions: [], visibleCol: [] },
};
const ref = { Invoices: 1, Products: 2 };
function addMetaColumn(table, colId, type) {
  const m = doc.metaColumns;
  m.id.push(100 + m.id.length); m.parentId.push(ref[table]); m.colId.push(colId); m.label.push(colId);
  m.type.push(type); m.isFormula.push(false); m.formula.push(''); m.widgetOptions.push(''); m.visibleCol.push(0);
}
for (const [c, t] of [['InvoiceNumber', 'Text'], ['Client', 'Text'], ['Date', 'Date'], ['Total', 'Numeric']]) addMetaColumn('Invoices', c, t);
for (const [c, t] of [['Name', 'Text'], ['Price', 'Numeric']]) addMetaColumn('Products', c, t);

const sent = [];
const docApi = {
  listTables: async () => Object.keys(doc.tables),
  fetchTable: async (t) => {
    if (t === '_grist_Tables') return structuredClone(doc.metaTables);
    if (t === '_grist_Tables_column') return structuredClone(doc.metaColumns);
    return structuredClone(doc.tables[t]);
  },
  // What Grist does with AddVisibleColumn / AddColumn: a new column in the metadata, empty cells.
  applyUserActions: async (actions) => {
    sent.push(...actions);
    for (const [action, table, colId, def] of actions) {
      if (action !== 'AddVisibleColumn' && action !== 'AddColumn') continue;
      addMetaColumn(table, colId, def?.type || 'Text');
      doc.tables[table][colId] = doc.tables[table].id.map(() => null);
    }
    return { retValues: actions.map(() => null) };
  },
};
globalThis.location = { search: '' };
globalThis.window = { grist: { ready: async () => {}, on: (ev, cb) => cb(), docApi }, self: 1, top: 2 };

const bridge = await load('src/core/grist/bridge.js');
const { GristProvider } = await load('src/core/data/provider.js');
const { applyUpgrade, forgetColumns } = await load('src/grist/writer.js');
const { buildUpgradePlan } = await load('src/model/migrate.js');
const { detectSchema, detectProducts } = await load('src/model/schema.js');

ok('the stand-in connects', await bridge.connect());
const provider = await new GristProvider().init();
await provider.prime(['Invoices', 'Products']);
const ids = (t) => provider.columns(t).map((c) => c.id);

// As main.js's rescan() reads the document: every table with its columns.
const tables = () => provider.tables().map((t) => ({ id: t.id, label: t.id, columns: provider.columns(t.id) }));
const scan = () => { const schema = detectSchema(tables()); return { schema, products: detectProducts(tables(), schema) }; };
const columnsByTable = () => Object.fromEntries(provider.tables().map((t) => [t.id, provider.columns(t.id)]));

{
  const { schema, products } = scan();
  ok('the invoices are found', schema.invoice && schema.invoice.table === 'Invoices');
  ok('the catalogue is found', products && products.table === 'Products');
  ok('neither has the columns yet', !products.roles.category && !schema.invoice.roles.addressNote);
}

// The catalogue form's "Add category column".
{
  const { schema, products } = scan();
  const plan = buildUpgradePlan(schema, columnsByTable(), ['Category'], products);
  ok('a plan for the category column', plan.ok && plan.columns.length === 1 && plan.columns[0].table === 'Products');
  const res = await applyUpgrade(plan, provider, { live: true });
  ok('the upgrade says it worked', res.ok);
  ok('Grist was asked to add it', sent.some((a) => a[1] === 'Products' && a[2] === 'Category'));
  eq('the new column is seen without a Refresh', ids('Products'), ['Name', 'Price', 'Category']);
  ok('and the catalogue maps it, so the field opens', scan().products.roles.category === 'Category');
  eq('the rows are still there', provider.records('Products').map((r) => r.Name), ['Survey', 'Report']);
}

// The composer's "Add a column to keep it" beside the DIN remark zone.
{
  const { schema, products } = scan();
  const plan = buildUpgradePlan(schema, columnsByTable(), ['AddressNote'], products);
  ok('a plan for the remark column', plan.ok && plan.columns.length === 1 && plan.columns[0].table === 'Invoices');
  const res = await applyUpgrade(plan, provider, { live: true });
  ok('it worked', res.ok);
  ok('the invoice table has it at once', ids('Invoices').includes('AddressNote'));
  ok('so the composer knows where the remark goes before any Refresh', scan().schema.invoice.roles.addressNote === 'AddressNote');
}

// forgetColumns is harmless where there is nothing to forget.
forgetColumns(null, ['Products']);
forgetColumns({ data: {} }, ['Products']);
ok('no provider, or the demo one, is left alone', true);

// ---- the form keeps what was typed --------------------------------------------------------------
{
  const main = readFileSync(_resolve(ROOT, 'src/main.js'), 'utf8');
  const at = main.indexOf('function renderRecordEditor');
  const editor = main.slice(at, at + 3000);
  ok('the editor reuses kept values before reading the row', /const values = kept \|\| readRecord\(/.test(editor));
  ok('kept values are used once', /app\.record\.kept = null;/.test(editor));
  ok('adding a column keeps the values being typed', /onAddColumn: \(role\) => \{ app\.record\.kept = values; return addColumnForRole\(kind, role\); \}/.test(editor));
}

console.log(`add-column-live: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
