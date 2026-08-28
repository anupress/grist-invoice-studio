import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';

// The repository root, derived from this file rather than hardcoded, so the suite runs from any
// checkout and any working directory.
const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const m = await import(pathToFileURL(_resolve(ROOT, 'src/model/schema.js')).href);

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

const col = (id, type = 'Text') => ({ id, label: id, type });

// ---------------------------------------------------------------------------------------------
// Grist's official Invoicing template, transcribed from its public API (doc 9NH6D58FmxwP).
// If this fixture ever needs changing, check the real template first — the whole point of it is
// that it is not an approximation.
// ---------------------------------------------------------------------------------------------
const OFFICIAL = [
  { id: 'Prepare_Invoices', label: 'Prepare Invoices', columns: [
    col('Number', 'Numeric'), col('Client', 'Ref:Businesses'), col('Items', 'Any'),
    col('Invoicer', 'Any'), col('Issued', 'Date'), col('Due', 'Any'),
    col('Note', 'Text'), col('References', 'Any'), col('Total', 'Text'),
  ] },
  { id: 'Businesses', label: 'Businesses', columns: [
    col('Name'), col('Street1'), col('Street2'), col('City'), col('State'), col('Zip'),
  ] },
  { id: 'Items', label: 'Items', columns: [
    col('Description'), col('Price', 'Numeric'), col('Quantity', 'Numeric'),
    col('Total', 'Numeric'), col('Invoice', 'Ref:Prepare_Invoices'),
  ] },
  { id: 'Items_summary_Invoice', label: 'Items [by Invoice]', columns: [
    col('Invoice', 'Ref:Prepare_Invoices'), col('group', 'RefList:Items'), col('Total', 'Numeric'),
    col('Client', 'Ref:Businesses'), col('Invoice_Issued', 'Date'), col('Invoice_Due', 'Date'), col('Note', 'Any'),
  ] },
];

const official = m.detectSchema(OFFICIAL);

eq('the official template is recognised, not guessed at', official.source, 'grist-official-invoicing');
eq('confidence is total', official.confidence, 1);
eq('invoice table', official.invoice.table, 'Prepare_Invoices');
eq('line table', official.line.table, 'Items');
eq('client table', official.client.table, 'Businesses');
eq('the auto-summary table is not mistaken for the lines', official.line.table !== 'Items_summary_Invoice', true);

// The trap: Total is a Text column and is empty on every row of the real template. Mapping it would
// print a blank where the amount goes.
eq('the empty Text Total is deliberately not mapped', official.invoice.roles.total, undefined);
ok('and we say why', official.warnings.some((w) => w.code === 'official-total-unused'));
ok('and that clients cannot be emailed', official.warnings.some((w) => w.code === 'no-client-email'));

eq('line roles map to the real column names',
  [official.line.roles.description, official.line.roles.quantity, official.line.roles.unitPrice],
  ['Description', 'Quantity', 'Price']);
eq('client address roles map', official.client.roles.postcode, 'Zip');

// The upgrade is the product's onboarding, so what it offers on the official template matters.
const up = m.upgradeChecklist(official);
const ids = (part) => up[part].map((i) => i.id);
ok('Status is offered — the column everything else depends on', ids('invoice').includes('Status'));
ok('an email column is offered for clients', ids('client').includes('Email'));
ok('a stored invoice number is offered even though Number is already mapped', ids('invoice').includes('InvoiceNumber'));
ok('Note is not offered again — the template already has one', !ids('invoice').includes('Note'));

// Idempotence: run the upgrade, and the same items stop being offered.
const UPGRADED = OFFICIAL.map((t) => t.id !== 'Prepare_Invoices' ? t : {
  ...t, columns: [...t.columns, col('Status', 'Choice'), col('InvoiceNumber', 'Text')],
});
const upgradedSchema = m.detectSchema(UPGRADED);
const after = m.upgradeChecklist(upgradedSchema);
ok('Status is not offered twice', !after.invoice.map((i) => i.id).includes('Status'));

// The reason it stops being offered has to be that it is now USED. Recognition alone would keep
// mapping only the columns the template shipped with, leaving the new column inert.
eq('a column added to a recognised template is actually mapped', upgradedSchema.invoice.roles.status, 'Status');
eq('the stored number takes over from the row-id formula', upgradedSchema.invoice.roles.number, 'InvoiceNumber');
eq('and the role stops being derived', upgradedSchema.invoice.derived.number, undefined);
eq('before the upgrade it was derived', official.invoice.derived.number, 'Number');
eq('the empty Text Total is still withheld after upgrading', upgradedSchema.invoice.roles.total, undefined);

// Same for the client table: adding Email is what makes sending possible at all.
const WITH_EMAIL = OFFICIAL.map((t) => t.id !== 'Businesses' ? t : { ...t, columns: [...t.columns, col('Email')] });
const emailed = m.detectSchema(WITH_EMAIL);
eq('an added client email is mapped', emailed.client.roles.email, 'Email');
ok('and the warning goes away', !emailed.warnings.some((w) => w.code === 'no-client-email'));

// ---------------------------------------------------------------------------------------------
// An ordinary document nobody built for us
// ---------------------------------------------------------------------------------------------
const ORDINARY = [
  { id: 'Products', label: 'Products', columns: [col('SKU'), col('Name'), col('Price', 'Numeric'), col('Stock', 'Int')] },
  { id: 'Invoices', label: 'Invoices', columns: [
    col('InvoiceNumber'), col('Client', 'Ref:Clients'), col('IssueDate', 'Date'), col('DueDate', 'Date'),
    col('Amount', 'Numeric'), col('Status', 'Choice'), col('PONumber'), col('Notes'),
  ] },
  { id: 'LineItems', label: 'Line items', columns: [
    col('Invoice', 'Ref:Invoices'), col('Description'), col('Qty', 'Numeric'), col('UnitPrice', 'Numeric'),
  ] },
  { id: 'Clients', label: 'Clients', columns: [
    col('Name'), col('Email'), col('Phone'), col('Address'), col('City'), col('Postcode'), col('Country'),
  ] },
];
const ord = m.detectSchema(ORDINARY);

eq('falls back to matching names', ord.source, 'heuristic');
eq('picks the invoice table, not the product catalogue', ord.invoice.table, 'Invoices');
eq('finds the line items', ord.line.table, 'LineItems');
eq('finds the clients', ord.client.table, 'Clients');
eq('the products table is not mistaken for line items', ord.line.table !== 'Products', true);
eq('number', ord.invoice.roles.number, 'InvoiceNumber');
eq('status', ord.invoice.roles.status, 'Status');
eq('the client PO number is not confused with our own number', ord.invoice.roles.reference, 'PONumber');
eq('issue date beats due date for "issued"', ord.invoice.roles.issued, 'IssueDate');
eq('due date', ord.invoice.roles.due, 'DueDate');
eq('total', ord.invoice.roles.total, 'Amount');
eq('client email is found, so no warning', ord.warnings.some((w) => w.code === 'no-client-email'), false);

// ---------------------------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------------------------

// A column is claimed once. Without that, "Notes" would satisfy both `note` and `description`-ish
// patterns and two roles would silently point at the same data.
const claimed = m.mapRoles([col('Total', 'Numeric')], { subtotal: [/^total$/i], total: [/^total$/i] });
eq('one column cannot fill two roles', Object.keys(claimed).length, 1);

// Grist lets a column's id and its human label differ, and real documents use the label.
const labelled = m.detectSchema([
  { id: 'Bills', label: 'Bills', columns: [
    { id: 'A', label: 'Invoice Number', type: 'Text' },
    { id: 'B', label: 'Customer', type: 'Ref:People' },
    { id: 'C', label: 'Due Date', type: 'Date' },
  ] },
]);
eq('columns are matched on their label too', [labelled.invoice.roles.number, labelled.invoice.roles.client], ['A', 'B']);

// A flat one-amount-per-invoice table is a legitimate shape, not a failure.
const flat = m.detectSchema([
  { id: 'Invoices', label: 'Invoices', columns: [col('Number'), col('Customer'), col('Amount', 'Numeric'), col('Date', 'Date')] },
]);
eq('a flat table still produces an invoice', flat.invoice.table, 'Invoices');
eq('with no line table', flat.line, null);
ok('and says so', flat.warnings.some((w) => w.code === 'flat-invoice'));

// Nothing recognisable at all.
eq('an empty document', m.detectSchema([]).source, 'none');
eq('a document with nothing invoice-shaped', m.detectSchema([
  { id: 'Songs', label: 'Songs', columns: [col('Title'), col('Artist'), col('Length', 'Numeric')] },
]).source, 'none');

// A type hint breaks a tie between equally-named columns, but never beats a better name match.
const tie = m.mapRoles(
  [{ id: 'Issued', label: 'Issued', type: 'Text' }, { id: 'Created', label: 'Created', type: 'Date' }],
  { issued: [/^issued$/i, /created/i] });
eq('a name match beats a type match', tie.issued, 'Issued');

// ---------------------------------------------------------------------------------------------
// Chosen tables. Detection is a guess, however good, and a guess never outranks an answer.
// ---------------------------------------------------------------------------------------------
const oddTables = [
  { id: 'Ledger', columns: [
    { id: 'RefNo', label: 'Invoice number', type: 'Text' },
    { id: 'Party', label: 'Client', type: 'Text' },
    { id: 'Raised', label: 'Issued', type: 'Date' },
  ] },
  { id: 'Detail', columns: [
    { id: 'Ledger', label: 'Invoice', type: 'Ref:Ledger' },
    { id: 'What', label: 'Description', type: 'Text' },
    { id: 'Each', label: 'Unit price', type: 'Numeric' },
  ] },
  // Named so no client pattern matches it: choosing is for exactly the tables detection rejects.
  { id: 'Rolodex', columns: [
    { id: 'Name', label: 'Name', type: 'Text' },
    { id: 'Email', label: 'Email', type: 'Text' },
  ] },
  { id: 'PriceList', columns: [
    { id: 'Name', label: 'Name', type: 'Text' },
    { id: 'Price', label: 'Unit price', type: 'Numeric' },
  ] },
];

const forced = m.detectSchema(oddTables, { force: { invoice: 'Ledger', line: 'Detail', client: 'Rolodex' } });
eq('the chosen invoice table is used', forced.invoice.table, 'Ledger');
eq('and its columns are still matched by name', forced.invoice.roles.number, 'RefNo');
eq('the chosen line table too', forced.line.table, 'Detail');
eq('with its link column found', forced.line.roles.invoiceLink, 'Ledger');
eq('and the chosen client table', forced.client.table, 'Rolodex');
eq('the source says who decided', forced.source, 'chosen');
// "Rolodex" never passes the name filter the heuristic applies — which is the whole point of
// choosing: the person knows something the pattern does not.
eq('the heuristic alone rejects that table', m.detectSchema(oddTables).client, null);
eq('client email is mapped, so warnings do not complain about it',
  (forced.warnings || []).some((w) => w.code === 'no-client-email'), false);

// A choice that names nothing real changes nothing.
eq('an unknown table id is ignored', m.detectSchema(oddTables, { force: { invoice: 'Nonsense' } }).source !== 'chosen', true);
eq('no force at all is plain detection', m.detectSchema(oddTables).source, 'heuristic');
// Forcing what detection already picked leaves the detection story intact.
{
  const auto = m.detectSchema(oddTables);
  const same = m.detectSchema(oddTables, { force: { invoice: auto.invoice.table } });
  eq('forcing the same table is a no-op', same.source, auto.source);
}

// The catalogue: chosen directly, skipping the used-table and naming filters.
const cat = m.detectProducts(oddTables, forced, { force: 'PriceList' });
eq('the chosen catalogue is used', cat.table, 'PriceList');
eq('with its price column', cat.roles.unitPrice, 'Price');
// But a table that cannot fill a picker is refused rather than returned hollow.
eq('a chosen catalogue with no name column yields nothing',
  m.detectProducts([{ id: 'Numbers', columns: [{ id: 'N', label: 'Amount', type: 'Numeric' }] }], null, { force: 'Numbers' }), null);

// ---------------------------------------------------------------------------------------------
// Statuses are a vocabulary, not a constant. The document's own words come first.
// ---------------------------------------------------------------------------------------------
eq('choices come out of parsed options', m.choicesOf({ choices: ['Draft', 'Approved'] }), ['Draft', 'Approved']);
eq('and out of the JSON string Grist stores', m.choicesOf('{"choices":["Draft","Approved"]}'), ['Draft', 'Approved']);
eq('broken JSON is no choices, not a crash', m.choicesOf('{oops'), []);
eq('no options is no choices', m.choicesOf(null), []);

{
  const schema = { invoice: { table: 'Invoices', roles: { status: 'Status' } } };
  const provider = {
    columns: () => [{ id: 'Status', type: 'Choice', widgetOptions: '{"choices":["Draft","Awaiting approval"]}' }],
    records: () => [{ id: 1, Status: 'In dispute' }, { id: 2, Status: 'draft' }, { id: 3, Status: '' }],
  };
  const opts = m.statusOptions(schema, provider);
  eq('the column’s own choices lead', opts.slice(0, 2), ['Draft', 'Awaiting approval']);
  ok('a status merely in use is still a real status', opts.includes('In dispute'));
  ok('the built-ins follow for anything not covered', opts.includes('Paid') && opts.includes('Overdue'));
  // "draft" in a row and "Draft" in the choices are one status, spelled the owner's way.
  eq('deduplicated case-insensitively, first casing kept', opts.filter((s) => s.toLowerCase() === 'draft'), ['Draft']);
  eq('no document at all still offers the defaults', m.statusOptions(null, null), m.STATUS_DEFAULTS);
}

// Registering a new choice is an addition, never a rewrite.
{
  const wo = JSON.stringify({ choices: ['Draft', 'Paid'], choiceOptions: { Paid: { fillColor: '#e2f2eb' } } });
  const added = m.withChoice(wo, 'Awaiting approval');
  eq('the new choice lands at the end', JSON.parse(added.widgetOptions).choices, ['Draft', 'Paid', 'Awaiting approval']);
  eq('the colours on existing choices survive', JSON.parse(added.widgetOptions).choiceOptions.Paid.fillColor, '#e2f2eb');
  eq('a value already present changes nothing', m.withChoice(wo, 'paid').changed, false);
  eq('an empty value changes nothing', m.withChoice(wo, '  ').changed, false);
  eq('unparsable options start fresh rather than crash', JSON.parse(m.withChoice('{oops', 'Held').widgetOptions).choices, ['Held']);
  eq('and the result is the string Grist stores', typeof added.widgetOptions, 'string');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
