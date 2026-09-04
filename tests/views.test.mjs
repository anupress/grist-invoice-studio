import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const views = await import(pathToFileURL(_resolve(ROOT, 'src/grist/views.js')).href);
const mig = await import(pathToFileURL(_resolve(ROOT, 'src/model/migrate.js')).href);
const { widgetColumns, detectSchema, detectProducts } = await import(pathToFileURL(_resolve(ROOT, 'src/model/schema.js')).href);

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

// ---------------------------------------------------------------------------------------------
// A document the way Grist describes it: column-oriented meta tables
// ---------------------------------------------------------------------------------------------
// Two tables. Products (table 2) has SKU, Name, Image; its page section is 20, its raw section 21,
// and its record-card section 22. The page shows SKU and Name, not Image — the state every
// catalogue this widget set up before 1.20.1 was left in. Invoices (table 1) shows everything.
const col = (rows) => {
  const keys = Object.keys(rows[0]);
  return Object.fromEntries(keys.map((k) => [k, rows.map((r) => r[k])]));
};
const raw = {
  tables: col([
    { id: 1, tableId: 'Invoices', rawViewSectionRef: 11 },
    { id: 2, tableId: 'Products', rawViewSectionRef: 21 },
  ]),
  columns: col([
    { id: 101, parentId: 1, colId: 'InvoiceNumber' },
    { id: 102, parentId: 1, colId: 'Status' },
    { id: 201, parentId: 2, colId: 'SKU' },
    { id: 202, parentId: 2, colId: 'Name' },
    { id: 203, parentId: 2, colId: 'Image' },
  ]),
  sections: col([
    { id: 10, tableRef: 1, parentId: 1, parentKey: 'record' },
    { id: 11, tableRef: 1, parentId: 0, parentKey: 'record' },
    { id: 20, tableRef: 2, parentId: 2, parentKey: 'record' },
    { id: 21, tableRef: 2, parentId: 0, parentKey: 'record' },
    { id: 22, tableRef: 2, parentId: 0, parentKey: 'single' },
    // A chart of the products on another page: a column absent from it is not hidden.
    { id: 23, tableRef: 2, parentId: 3, parentKey: 'chart' },
  ]),
  fields: col([
    { id: 1, parentId: 10, colRef: 101, parentPos: 1 },
    { id: 2, parentId: 10, colRef: 102, parentPos: 2 },
    { id: 3, parentId: 11, colRef: 101, parentPos: 1 },
    { id: 4, parentId: 11, colRef: 102, parentPos: 2 },
    { id: 5, parentId: 20, colRef: 201, parentPos: 1 },
    { id: 6, parentId: 20, colRef: 202, parentPos: 2.5 },
    { id: 7, parentId: 21, colRef: 201, parentPos: 1 },
    { id: 8, parentId: 21, colRef: 202, parentPos: 2 },
    { id: 9, parentId: 21, colRef: 203, parentPos: 3 },
    { id: 10, parentId: 23, colRef: 202, parentPos: 1 },
  ]),
};
const meta = views.viewMeta(raw);

eq('the tables are read', meta.tables.map((t) => t.tableId), ['Invoices', 'Products']);
eq('with their raw sections', meta.tables[1].rawViewSectionRef, 21);
eq('five columns', meta.columns.length, 5);
eq('a section without a page is parentId 0', meta.sections.find((s) => s.id === 21).parentId, 0);
eq('positions are numbers', meta.fields.find((f) => f.id === 6).parentPos, 2.5);

// ---------------------------------------------------------------------------------------------
// What is hidden
// ---------------------------------------------------------------------------------------------
const wanted = [
  { table: 'Products', id: 'Image' },
  { table: 'Products', id: 'Name' },
  { table: 'Invoices', id: 'Status' },
  { table: 'Invoices', id: 'PaidDate' },     // not in the table at all
  { table: 'Clients', id: 'Email' },         // no such table
];
const hidden = views.hiddenColumns(meta, wanted);
eq('only the picture column is hidden', hidden.map((h) => `${h.table}.${h.id}`), ['Products.Image']);
eq('from the products page, and nothing else', hidden[0].sections, [20]);
eq('carrying the column ref the field will need', hidden[0].colRef, 203);
ok('a column absent from the table is the upgrade’s business, not this', !hidden.some((h) => h.id === 'PaidDate'));
ok('a column on its page is not reported', !hidden.some((h) => h.id === 'Name'));

// The raw section and the record card are not pages; a column missing from them is not hidden.
{
  const m2 = views.viewMeta({ ...raw, fields: col(views.viewMeta(raw).fields.filter((f) => f.id !== 9).map((f) => ({ ...f }))) });
  eq('a column missing from the raw view is still not "hidden"', views.hiddenColumns(m2, [{ table: 'Products', id: 'Image' }])[0].sections, [20]);
}

// A table with no page at all has nothing to be hidden from.
{
  const m3 = views.viewMeta({ ...raw, sections: col(meta.sections.filter((s) => s.id !== 20).map((s) => ({ ...s }))) });
  eq('no page, nothing hidden', views.hiddenColumns(m3, [{ table: 'Products', id: 'Image' }]), []);
}

// Two pages showing the same table, one with the column and one without: only the one without.
{
  const sections = [...meta.sections.map((s) => ({ ...s })), { id: 30, tableRef: 2, parentId: 4, parentKey: 'record' }];
  const fields = [...meta.fields.map((f) => ({ ...f })), { id: 11, parentId: 30, colRef: 201, parentPos: 1 }, { id: 12, parentId: 30, colRef: 203, parentPos: 2 }];
  const m4 = views.viewMeta({ ...raw, sections: col(sections), fields: col(fields) });
  eq('only the page missing it is listed', views.hiddenColumns(m4, [{ table: 'Products', id: 'Image' }])[0].sections, [20]);
}

// ---------------------------------------------------------------------------------------------
// The repair
// ---------------------------------------------------------------------------------------------
const actions = views.revealActions(meta, hidden);
eq('one field per page that lacks the column', actions.length, 1);
eq('it is a row in the fields meta table', actions[0].slice(0, 3), ['AddRecord', '_grist_Views_section_field', null]);
eq('on the products page, for the image column', [actions[0][3].parentId, actions[0][3].colRef], [20, 203]);
eq('placed after the last field the page has', actions[0][3].parentPos, 3.5);
ok('nothing touches the table itself', actions.every((a) => a[1] === '_grist_Views_section_field'));
eq('nothing to reveal, nothing to do', views.revealActions(meta, []), []);

// A page with no fields yet starts at one.
{
  const sections = [...meta.sections.map((s) => ({ ...s })), { id: 40, tableRef: 2, parentId: 5, parentKey: 'record' }];
  const m5 = views.viewMeta({ ...raw, sections: col(sections) });
  const h5 = views.hiddenColumns(m5, [{ table: 'Products', id: 'Image' }]);
  const a5 = views.revealActions(m5, h5).find((a) => a[3].parentId === 40);
  eq('an empty page gets the column at position one', a5[3].parentPos, 1);
}

// ---------------------------------------------------------------------------------------------
// Which columns are the widget's to look for
// ---------------------------------------------------------------------------------------------
{
  const tables = [
    { id: 'Invoices', label: 'Invoices', columns: [{ id: 'InvoiceNumber', type: 'Text' }, { id: 'Client', type: 'Ref:Clients' }, { id: 'Issued', type: 'Date' }, { id: 'Due', type: 'Date' }, { id: 'Status', type: 'Choice' }, { id: 'Total', type: 'Numeric' }] },
    { id: 'InvoiceItems', label: 'Invoice items', columns: [{ id: 'Invoice', type: 'Ref:Invoices' }, { id: 'Description', type: 'Text' }, { id: 'Quantity', type: 'Numeric' }, { id: 'Price', type: 'Numeric' }, { id: 'Total', type: 'Numeric' }] },
    { id: 'Clients', label: 'Clients', columns: [{ id: 'Name', type: 'Text' }, { id: 'Email', type: 'Text' }, { id: 'City', type: 'Text' }] },
    { id: 'Products', label: 'Products', columns: [{ id: 'SKU', type: 'Text' }, { id: 'Name', type: 'Text' }, { id: 'Price', type: 'Numeric' }, { id: 'Photo', type: 'Attachments' }] },
  ];
  const schema = detectSchema(tables);
  const products = detectProducts(tables, schema);
  const cols = widgetColumns(schema, products);
  const names = cols.map((c) => `${c.table}.${c.id}`);
  ok('the status column is the widget’s', names.includes('Invoices.Status'));
  ok('so is the client email', names.includes('Clients.Email'));
  ok('the picture column is reported under its own name', names.includes('Products.Photo'));
  ok('a column the document has not got is not listed', !names.includes('Invoices.PaidDate'));
  ok('a column the widget did not add is not listed either', !names.includes('Clients.City'));
  eq('no schema, no columns', widgetColumns(null), []);
}

// ---------------------------------------------------------------------------------------------
// The upgrade adds columns a person can see
// ---------------------------------------------------------------------------------------------
{
  const plan = { columns: [{ table: 'Invoices', id: 'PaidDate', def: { type: 'Date', label: 'Paid' } }] };
  eq('visible by default', mig.upgradeActions(plan)[0][0], 'AddVisibleColumn');
  eq('with the raw-data fallback on request', mig.upgradeActions(plan, { visible: false })[0][0], 'AddColumn');
  eq('the rest of the action is unchanged', mig.upgradeActions(plan)[0].slice(1), ['Invoices', 'PaidDate', { type: 'Date', label: 'Paid' }]);

  // And the writer never sends the old action first.
  const src = readFileSync(_resolve(ROOT, 'src/grist/writer.js'), 'utf8');
  ok('the setup adds its attachments column visibly', /apply\(bundle\('AddVisibleColumn'\)\)/.test(src));
  ok('falling back to the raw data only when refused', /apply\(bundle\('AddColumn'\)\)/.test(src));
  ok('and no bare AddColumn is sent anywhere else', !/\['AddColumn'/.test(src));
}

// ---------------------------------------------------------------------------------------------
// Against a stubbed Grist: the live path end to end
// ---------------------------------------------------------------------------------------------
{
  const sent = [];
  let refuseVisible = false;
  globalThis.window = globalThis;
  globalThis.grist = {
    ready: async () => {},
    docApi: {
      listTables: async () => ['Invoices', 'Products'],
      fetchTable: async (id) => ({ _grist_Tables: raw.tables, _grist_Tables_column: raw.columns, _grist_Views_section: raw.sections, _grist_Views_section_field: raw.fields }[id] || { id: [] }),
      applyUserActions: async (actions) => {
        if (refuseVisible && actions.some((a) => a[0] === 'AddVisibleColumn')) throw new Error('Unknown action AddVisibleColumn');
        sent.push(actions);
        return { retValues: actions.map(() => 1) };
      },
    },
  };
  const writer = await import(pathToFileURL(_resolve(ROOT, 'src/grist/writer.js')).href + '?views');
  const provider = { tables: () => [{ id: 'Invoices' }, { id: 'Products' }], columns: () => [], records: () => [], refreshTables: async () => {}, invalidate() {}, prime: async () => {} };

  // The repair.
  const found = views.hiddenColumns(await views.readViewMeta(), [{ table: 'Products', id: 'Image' }]);
  eq('the live read finds the hidden picture column', found.map((h) => h.id), ['Image']);
  const r = await writer.revealColumns(found, { live: true });
  eq('revealing succeeds', r.ok, true);
  eq('one column revealed', r.revealed, 1);
  const last = sent[sent.length - 1];
  eq('by adding one field row', last.map((a) => a[0] + ':' + a[1]), ['AddRecord:_grist_Views_section_field']);
  eq('to the products page', last[0][3].parentId, 20);
  eq('the demo has no pages and says so kindly', await writer.revealColumns(found, { live: false }), { ok: true, revealed: 1 });
  eq('nothing hidden, nothing sent', await writer.revealColumns([], { live: true }), { ok: true, revealed: 0 });

  // The upgrade, on a Grist that knows the newer action.
  const plan = { ok: true, columns: [{ table: 'Invoices', id: 'PaidDate', part: 'invoice', role: 'paidDate', def: { type: 'Date', label: 'Paid' }, backfillFrom: null }] };
  const up = await writer.applyUpgrade(plan, provider, { live: true });
  eq('the upgrade succeeds', up.ok, true);
  eq('and adds the column where it can be seen', sent[sent.length - 1][0][0], 'AddVisibleColumn');

  // And on one that does not: the column still arrives, in the raw data.
  refuseVisible = true;
  const before = sent.length;
  const old = await writer.applyUpgrade(plan, provider, { live: true });
  eq('an old Grist still gets the column', old.ok, true);
  eq('through the raw-data action', sent[before][0][0], 'AddColumn');
  eq('with the same definition', sent[before][0].slice(1), ['Invoices', 'PaidDate', { type: 'Date', label: 'Paid' }]);
}

console.log(`\n${pass} passed, ${fail} failed`);
// Explicit: the core's grist.ready() wrapper leaves a timer running once a stub has been called.
process.exit(fail === 0 ? 0 : 1);
