import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const w = await import(pathToFileURL(_resolve(ROOT, 'src/model/write.js')).href);
const mig = await import(pathToFileURL(_resolve(ROOT, 'src/model/migrate.js')).href);
const { detectSchema } = await import(pathToFileURL(_resolve(ROOT, 'src/model/schema.js')).href);

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

// ---------------------------------------------------------------------------------------------
// toCell — a value has to arrive as what the column actually stores
// ---------------------------------------------------------------------------------------------
const col = (type, extra = {}) => ({ id: 'C', type, ...extra });

// Grist keeps dates as epoch SECONDS. Sending "2026-08-27" puts text in a date column, which then
// sorts alphabetically and breaks every formula pointing at it.
eq('a date becomes epoch seconds', w.toCell('2026-08-27', col('Date')), Date.parse('2026-08-27T00:00:00Z') / 1000);
eq('read as UTC midnight, so it round-trips to the same day', w.toCell('2026-01-01', col('Date')), Date.parse('2026-01-01T00:00:00Z') / 1000);
eq('an empty date clears the cell', w.toCell('', col('Date')), null);
eq('an unparseable date does not become NaN', w.toCell('not a date', col('Date')), null);

eq('a numeric string becomes a number', w.toCell('1234.50', col('Numeric')), 1234.5);
eq('currency noise is stripped', w.toCell('£1,234.50', col('Numeric')), 1234.5);
eq('and other symbols too', w.toCell('₹ 2,50,000', col('Numeric')), 250000);
eq('an empty number clears', w.toCell('', col('Numeric')), null);
eq('a number stays a number', w.toCell(12, col('Int')), 12);

// The bug this guard exists for, found by saving a real invoice: an invoice number is text, and
// Grist's own template types its Number column as Numeric. Stripping non-digits from
// "INV-2026-0001" and calling parseFloat returns -2026 — a plausible-looking wrong value, written
// with no error anywhere. Refusing is the only safe answer.
eq('a text invoice number is NOT mangled into a number', w.toCell('INV-2026-0001', col('Numeric')), undefined);
eq('and the old approach really did produce nonsense', parseFloat('INV-2026-0001'.replace(/[^0-9.eE+-]/g, '')), -2026);
eq('nor is any other non-numeric text', w.toCell('on completion', col('Numeric')), undefined);
eq('a bare year is a number, though', w.toCell('2026', col('Numeric')), 2026);
eq('and a negative one', w.toCell('-40.5', col('Numeric')), -40.5);

// Refusing has to be REPORTED, or it is just a quieter kind of data loss.
const numericNumber = w.buildWritePlan(
  { rowId: null, number: 'INV-2026-0001', totals: {}, lines: [] },
  { invoice: { table: 'T', roles: { number: 'N' } } },
  { invoiceColumns: [{ id: 'N', type: 'Numeric' }] });
eq('nothing is written', numericNumber.invoice.fields.N, undefined);
ok('and the reason names the value and the type',
  numericNumber.skipped.some((s) => s.role === 'number' && /INV-2026-0001/.test(s.reason) && /numeric/.test(s.reason)));

eq('a reference takes a row id', w.toCell(4, col('Ref:Clients')), 4);
eq('a numeric string reference', w.toCell('4', col('Ref:Clients')), 4);
// 0 is Grist's empty reference. A name written into a Ref column is accepted and then unresolvable.
eq('a name is not a row id', w.toCell('Harbour Lane Bakery', col('Ref:Clients')), 0);

eq('a bool', w.toCell(1, col('Bool')), true);
eq('text', w.toCell(42, col('Text')), '42');
eq('undefined means do not write', w.toCell(undefined, col('Text')), undefined);
eq('null means clear', w.toCell(null, col('Text')), null);

// ---------------------------------------------------------------------------------------------
// A plan against Grist's own template — where Number is a formula
// ---------------------------------------------------------------------------------------------
const OFFICIAL_COLUMNS = {
  Prepare_Invoices: [
    { id: 'Number', type: 'Numeric', isFormula: true },
    { id: 'Client', type: 'Ref:Businesses' },
    { id: 'Issued', type: 'Date' },
    { id: 'Due', type: 'Any', isFormula: true },
    { id: 'Note', type: 'Text' },
    { id: 'Items', type: 'Any', isFormula: true },
    { id: 'References', type: 'Any', isFormula: true },
    { id: 'Total', type: 'Text' },
  ],
  Items: [
    { id: 'Description', type: 'Text' }, { id: 'Price', type: 'Numeric' },
    { id: 'Quantity', type: 'Numeric' }, { id: 'Total', type: 'Numeric', isFormula: true },
    { id: 'Invoice', type: 'Ref:Prepare_Invoices' },
  ],
  Businesses: [{ id: 'Name', type: 'Text' }, { id: 'Street1', type: 'Text' }, { id: 'City', type: 'Text' }],
};
const OFFICIAL = Object.entries(OFFICIAL_COLUMNS).map(([id, columns]) => ({ id, label: id, columns }));
const schema = detectSchema(OFFICIAL);

const draft = {
  rowId: null,
  number: 'INV-2026-0012',
  clientRef: 2,
  issued: '2026-08-27',
  due: '2026-09-26',
  status: 'Sent',
  note: 'Thanks',
  reference: 'PO-771',
  currency: 'GBP',
  totals: { subtotal: 1400, taxTotal: 280, total: 1680, amountPaid: 0, discountTotal: 0, shipping: { amount: 0 } },
  lines: [
    { description: 'Site survey', quantity: 1, unitPrice: 320, amount: 320 },
    { description: '', quantity: 0, unitPrice: 0, amount: 0 },     // an untouched empty row
  ],
};

const plan = w.buildWritePlan(draft, schema, {
  invoiceColumns: OFFICIAL_COLUMNS.Prepare_Invoices,
  lineColumns: OFFICIAL_COLUMNS.Items,
  existingLineRows: [{ id: 7 }, { id: 8 }],
});

// The whole reason this rule exists: Grist's template computes Number from the row id, and writing
// to a formula column is rejected outright — the invoice would half-save with no visible reason.
eq('a formula column is never written', plan.invoice.fields.Number, undefined);
ok('and the person is told why', plan.skipped.some((s) => s.role === 'number' && /formula/.test(s.reason)));

eq('the client goes in as a row id', plan.invoice.fields.Client, 2);
eq('the issue date as epoch seconds', plan.invoice.fields.Issued, Date.parse('2026-08-27T00:00:00Z') / 1000);
eq('the note as text', plan.invoice.fields.Note, 'Thanks');

// This template has nowhere to keep a status or a purchase-order number. Dropping them silently is
// how a person discovers a week later that nothing they typed was saved.
ok('a status with nowhere to go is reported', plan.skipped.some((s) => s.role === 'status' && /no column/.test(s.reason)));
ok('so is their reference', plan.skipped.some((s) => s.role === 'reference'));

// But a COMPUTED figure with nowhere to go is not worth a warning. Telling somebody a total they
// never typed could not be saved — when it is recalculated every time the document opens — is the
// noise that teaches people to ignore the list their purchase-order number appears in.
eq('a computed total is not reported as lost', plan.skipped.some((s) => s.role === 'total'), false);
eq('nor tax', plan.skipped.some((s) => s.role === 'tax'), false);
// Everything left IS something a person can type on the form. `due` is on the list because the
// template computes it as issue date plus a month, so changing it in the composer would silently
// do nothing — exactly the kind of thing that has to be said out loud.
eq('so the list is only things a person typed', plan.skipped.filter((s) => s.where === 'invoice').map((s) => s.role).sort(),
  ['amountPaid', 'currency', 'due', 'number', 'reference', 'status']);
ok('and the due date says it is a formula', plan.skipped.some((s) => s.role === 'due' && /formula/.test(s.reason)));

eq('a new invoice has no row id yet', plan.invoice.rowId, null);
eq('one real line is written', plan.lines.adds.length, 1);
// A reference link needs a row id that does not exist until the header is created, so the plan
// leaves a placeholder for the executor to fill in.
eq('with a placeholder for the invoice it belongs to', plan.lines.adds[0].Invoice, '__INVOICE_ROW_ID__');
eq('the blank grid row is not written', plan.lines.adds.filter((f) => !f.Description).length, 0);

// A new document opens with one empty line, and an empty line defaults to a quantity of 1. If
// quantity counted as content, every new invoice would write a blank row nobody typed.
const freshPlan = w.buildWritePlan(
  { rowId: null, number: 'X', issued: '2026-08-27', lines: [{ description: '', quantity: 1, unitPrice: 0, amount: 0 }], totals: {} },
  schema, { invoiceColumns: OFFICIAL_COLUMNS.Prepare_Invoices, lineColumns: OFFICIAL_COLUMNS.Items });
eq('an untouched new line writes nothing', freshPlan.lines.adds.length, 0);
eq('and the summary says so', w.describePlan(freshPlan), 'Add 1 invoice.');
// But a free line — described, priced at nothing — is real and must be kept.
const freeLine = w.buildWritePlan(
  { rowId: null, lines: [{ description: 'Delivery, waived', quantity: 1, unitPrice: 0, amount: 0 }], totals: {} },
  schema, { invoiceColumns: OFFICIAL_COLUMNS.Prepare_Invoices, lineColumns: OFFICIAL_COLUMNS.Items });
eq('a described line priced at zero is still a line', freeLine.lines.adds.length, 1);
eq('the line total is a formula here, so it is left alone', plan.lines.adds[0].Total, undefined);
eq('lines that are no longer on the invoice are removed', plan.lines.removes, [7, 8]);
eq('summarised plainly', w.describePlan(plan), 'Add 1 invoice, add 1 line, remove 2 lines.');

// ---------------------------------------------------------------------------------------------
// An ordinary document with real, writable columns
// ---------------------------------------------------------------------------------------------
const ORD_COLUMNS = {
  Invoices: [
    { id: 'InvoiceNumber', type: 'Text' }, { id: 'Client', type: 'Text' },
    { id: 'Issued', type: 'Date' }, { id: 'Status', type: 'Choice' },
    { id: 'Total', type: 'Numeric' }, { id: 'Reference', type: 'Text' },
  ],
  LineItems: [
    { id: 'Invoice', type: 'Text' }, { id: 'Description', type: 'Text' },
    { id: 'Qty', type: 'Numeric' }, { id: 'UnitPrice', type: 'Numeric' },
  ],
};
const ordSchema = detectSchema(Object.entries(ORD_COLUMNS).map(([id, columns]) => ({ id, label: id, columns })));
const ordPlan = w.buildWritePlan(
  { ...draft, rowId: 5, clientRef: undefined, client: { name: 'Harbour Lane Bakery' },
    lines: [{ rowId: 9, description: 'Survey', quantity: 1, unitPrice: 320, amount: 320 }] },
  ordSchema,
  { invoiceColumns: ORD_COLUMNS.Invoices, lineColumns: ORD_COLUMNS.LineItems, existingLineRows: [{ id: 9 }] },
);

eq('a writable number column is written', ordPlan.invoice.fields.InvoiceNumber, 'INV-2026-0012');
eq('a text client column takes the name', ordPlan.invoice.fields.Client, 'Harbour Lane Bakery');
eq('the status lands', ordPlan.invoice.fields.Status, 'Sent');
eq('and the total', ordPlan.invoice.fields.Total, 1680);
eq('an existing invoice updates rather than duplicating', ordPlan.invoice.rowId, 5);
eq('an existing line updates too', ordPlan.lines.updates.length, 1);
eq('nothing is removed', ordPlan.lines.removes, []);
// A text link column carries the invoice NUMBER, which is known now, rather than a row id.
eq('a text link carries the number', ordPlan.lines.updates[0].fields.Invoice, 'INV-2026-0012');
eq('summarised', w.describePlan(ordPlan), 'Update 1 invoice, update 1 line.');
eq('and it is clean', ordPlan.ok, true);

eq('a document with no invoice table cannot be saved into', w.buildWritePlan(draft, { }, {}).ok, false);

// ---------------------------------------------------------------------------------------------
// The upgrade — additive, idempotent, and never over an existing column
// ---------------------------------------------------------------------------------------------
const columnsByTable = OFFICIAL_COLUMNS;
const up = mig.buildUpgradePlan(schema, columnsByTable);

const added = up.columns.map((c) => `${c.table}.${c.id}`);
ok('a status column is added to the invoice table', added.includes('Prepare_Invoices.Status'));
ok('an email column to the clients', added.includes('Businesses.Email'));
ok('and a stored invoice number, because the existing one is a formula', added.includes('Prepare_Invoices.InvoiceNumber'));
ok('every column carries the reason it is there', up.columns.every((c) => typeof c.why === 'string' && c.why.length > 10));
eq('nothing is renamed, retyped or removed', mig.upgradeActions(up).every((a) => a[0] === 'AddColumn'), true);

// Choice options must be a JSON STRING; passing the object leaves a Choice column with no choices,
// which looks like it worked and then refuses every value.
const status = up.columns.find((c) => c.id === 'Status');
eq('choices are serialised', typeof status.def.widgetOptions, 'string');
eq('and really are the statuses', JSON.parse(status.def.widgetOptions).choices[0], 'Draft');

// Idempotence: with the columns present, the plan is empty.
const upgradedColumns = {
  ...columnsByTable,
  Prepare_Invoices: [...columnsByTable.Prepare_Invoices, { id: 'Status', type: 'Choice' }, { id: 'InvoiceNumber', type: 'Text' }],
};
const upgradedSchema = detectSchema(Object.entries(upgradedColumns).map(([id, columns]) => ({ id, label: id, columns })));
const second = mig.buildUpgradePlan(upgradedSchema, upgradedColumns);
eq('running it again adds no status', second.columns.some((c) => c.id === 'Status'), false);
eq('nor a second invoice number', second.columns.some((c) => c.id === 'InvoiceNumber'), false);

// A column already present is reported rather than attempted.
const partial = mig.buildUpgradePlan(schema, { ...columnsByTable, Prepare_Invoices: [...columnsByTable.Prepare_Invoices, { id: 'Status', type: 'Choice' }] });
ok('an existing column is noted, not re-added', partial.alreadyThere.some((c) => c.id === 'Status'));

// Choosing a subset
const only = mig.buildUpgradePlan(schema, columnsByTable, ['Status']);
eq('only what was asked for', only.columns.map((c) => c.id), ['Status']);

// An upgrade must not cost the document its invoice numbers. The new stored column becomes the
// mapped one the moment it exists, so without copying the old formula's values across, every
// existing invoice would show a row id where its number used to be.
const numberCol = up.columns.find((c) => c.id === 'InvoiceNumber');
eq('the stored number knows where its values come from', numberCol.backfillFrom, 'Number');
eq('an ordinary new column has nothing to copy', up.columns.find((c) => c.id === 'Status').backfillFrom, null);

const fakeProvider = { records: (t) => (t === 'Prepare_Invoices' ? [{ id: 1, Number: 51372 }, { id: 2, Number: 51373 }, { id: 3, Number: null }] : []) };
const back = mig.backfillActions(up, fakeProvider);
eq('one bulk update', back.length, 1);
eq('into the new column', Object.keys(back[0][3]), ['InvoiceNumber']);
eq('for the rows that have a value', back[0][2], [1, 2]);
// The old column is Numeric and the new one is Text, so the values have to be converted or Grist
// stores numbers in a text column and they sort as text anyway.
eq('converted to text', back[0][3].InvoiceNumber, ['51372', '51373']);
eq('nothing to copy means no action at all', mig.backfillActions(up, { records: () => [] }).length, 0);

// ---------------------------------------------------------------------------------------------
// Starter tables for an empty document
// ---------------------------------------------------------------------------------------------
eq('an empty document is missing all three', mig.missingStarterTables([]).length, 3);
eq('and none once they exist', mig.missingStarterTables(['Invoices', 'InvoiceItems', 'Clients']).length, 0);

const create = mig.createTableActions(mig.STARTER_TABLES);
eq('three tables are created', create.filter((a) => a[0] === 'AddTable').length, 3);
// A Ref to a table Grist has not made yet is rejected and takes the whole bundle down with it, so
// those columns are created as Text and converted afterwards.
const itemsTable = create.find((a) => a[0] === 'AddTable' && a[1] === 'InvoiceItems');
eq('the reference is created as text first', itemsTable[2].find((c) => c.id === 'Invoice').type, 'Text');
ok('and converted once its target exists',
  create.some((a) => a[0] === 'ModifyColumn' && a[1] === 'InvoiceItems' && a[2] === 'Invoice' && a[3].type === 'Ref:Invoices'));
ok('conversions come after every table is created',
  create.findIndex((a) => a[0] === 'ModifyColumn') > create.map((a) => a[0]).lastIndexOf('AddTable'));

// The upgrade plan reaches the catalogue when it is handed one.
{
  const schemaU = detectSchema([
    { id: 'Invoices', columns: [{ id: 'InvoiceNumber', label: 'Invoice number', type: 'Text' }, { id: 'Client', label: 'Client', type: 'Text' }, { id: 'Issued', label: 'Issued', type: 'Date' }] },
    { id: 'Products', columns: [{ id: 'Name', label: 'Name', type: 'Text' }, { id: 'Price', label: 'Unit price', type: 'Numeric' }] },
  ]);
  const productsU = { table: 'Products', roles: { name: 'Name', unitPrice: 'Price' } };
  const planU = mig.buildUpgradePlan(schemaU, { Invoices: [], Products: [] }, null, productsU);
  ok('the plan adds Image to the catalogue table', planU.columns.some((c) => c.table === 'Products' && c.id === 'Image'));
  const planNo = mig.buildUpgradePlan(schemaU, { Invoices: [], Products: [{ id: 'Image', type: 'Attachments' }] }, null, productsU);
  ok('but never a second one', !planNo.columns.some((c) => c.table === 'Products' && c.id === 'Image'));
}

// ---------------------------------------------------------------------------------------------
// Currency: the one field where empty is an instruction, not an omission.
// ---------------------------------------------------------------------------------------------
{
  const schemaC = { invoice: { table: 'T', roles: { currency: 'Currency', number: 'N' } } };
  const cols = { invoiceColumns: [{ id: 'Currency', type: 'Text' }, { id: 'N', type: 'Text' }] };
  // Clearing the field on an existing row must actually clear the stored override, or the row
  // stays dollar-fixed forever and changing the business currency visibly does nothing.
  const cleared = w.buildWritePlan({ rowId: 7, number: 'X', currency: '', totals: {}, lines: [] }, schemaC, cols);
  eq('a cleared currency on an existing row clears the cell', cleared.invoice.fields.Currency, null);
  // A new row with no currency writes none at all: there is nothing to clear, and an empty cell
  // already means the business currency.
  const fresh = w.buildWritePlan({ rowId: null, number: 'X', currency: '', totals: {}, lines: [] }, schemaC, cols);
  eq('a new row without a currency writes none', 'Currency' in fresh.invoice.fields, false);
  ok('and that is not reported as a failure', !fresh.skipped.some((k) => k.role === 'currency'));
  // A typed one still lands.
  const set = w.buildWritePlan({ rowId: 7, number: 'X', currency: 'USD', totals: {}, lines: [] }, schemaC, cols);
  eq('a chosen currency is written', set.invoice.fields.Currency, 'USD');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
