import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => import(pathToFileURL(_resolve(ROOT, p)).href);
const kinds = await load('src/doc/kinds.js');
const { detectSchema, upgradeChecklist } = await load('src/model/schema.js');
const { resolveInvoice, listInvoices } = await load('src/model/resolve.js');
const w = await load('src/model/write.js');
const mig = await load('src/model/migrate.js');
const starter = await load('src/templates/starter.js');
const { SAMPLES } = await load('src/templates/samples.js');
const { normaliseDraft } = await load('src/model/draft.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

// ---------------------------------------------------------------------------------------------
// A kind read back from a cell
// ---------------------------------------------------------------------------------------------
eq('the word', kinds.kindFromCell('Credit note'), 'credit_note');
eq('the id', kinds.kindFromCell('credit_note'), 'credit_note');
eq('shouted', kinds.kindFromCell('CREDIT NOTE'), 'credit_note');
eq('the label, punctuation and all', kinds.kindFromCell('Quote / estimate'), 'quote');
eq('a receipt', kinds.kindFromCell('Receipt'), 'receipt');
eq('with spaces around it', kinds.kindFromCell('  Invoice '), 'invoice');
eq('empty is nothing', kinds.kindFromCell(''), null);
eq('so is null', kinds.kindFromCell(null), null);
eq('and so is nonsense — the chooser decides', kinds.kindFromCell('banana'), null);
eq('every kind round-trips through its word', kinds.DOCUMENT_KINDS.map((k) => kinds.kindFromCell(k.word)), kinds.DOCUMENT_KINDS.map((k) => k.id));
eq('the column offers every word', kinds.KIND_WORDS.length, kinds.DOCUMENT_KINDS.length);

// ---------------------------------------------------------------------------------------------
// A document with a Kind column: the starter's, as a Grist document
// ---------------------------------------------------------------------------------------------
const tables = starter.starterTablesFor('restaurant', { numberPrefix: 'REC-', grossOf: ({ lines }) => lines.reduce((a, l) => a + l.quantity * l.unitPrice, 0) * 1.2 });
const asDoc = tables.map((t) => ({ id: t.id, label: t.label, columns: t.columns.map((c) => ({ id: c.id, type: c.type, widgetOptions: c.widgetOptions || null })), records: t.records.map((r, i) => ({ id: i + 1, ...r })) }));
const provider = { records: (id) => asDoc.find((t) => t.id === id)?.records || [], columns: (id) => asDoc.find((t) => t.id === id)?.columns || [], tables: () => asDoc.map((t) => ({ id: t.id, label: t.label })) };
const schema = detectSchema(asDoc);

eq('the starter has a Kind column', tables.find((t) => t.id === 'Invoices').columns.find((c) => c.id === 'Kind')?.type, 'Choice');
ok('offering every word', JSON.parse(tables.find((t) => t.id === 'Invoices').columns.find((c) => c.id === 'Kind').widgetOptions).choices.includes('Credit note'));
eq('and it is recognised as the kind', schema.invoice.roles.kind, 'Kind');
ok('so the upgrade has nothing to add for it', !upgradeChecklist(schema).invoice.some((i) => i.id === 'Kind'));

// The café: the till sale is a receipt, the catering account is invoiced.
const rows = provider.records('Invoices');
eq('the paid sale is a receipt', rows.find((r) => r.Status === 'Paid').Kind, 'Receipt');
eq('the overdue catering account is an invoice', rows.find((r) => r.Status === 'Overdue').Kind, 'Invoice');
ok('nothing but the paid sale is a receipt', rows.filter((r) => r.Kind === 'Receipt').length === 1);
ok('a builder\'s five are all invoices', starter.starterTablesFor('construction', { numberPrefix: 'INV-' }).find((t) => t.id === 'Invoices').records.every((r) => r.Kind === 'Invoice'));
ok('every sample kind is a real kind', Object.values(SAMPLES).every((s) => s.invoices.every((i) => !i.kind || kinds.documentKind(i.kind).id === i.kind)));
ok('no receipt trade has a receipt that is owed', ['retail', 'restaurant', 'nonprofit'].every((id) => SAMPLES[id].invoices.every((i) => i.status === 'Paid' || i.kind === 'invoice')));

// Resolving: the row's kind outranks the chooser's.
const settingsReceipt = { kind: 'receipt', layout: 'minimal', sender: { name: 'ANUPRESS Café' }, money: { currency: 'GBP' } };
const overdue = rows.find((r) => r.Status === 'Overdue');
const paid = rows.find((r) => r.Status === 'Paid');
eq('an invoice row opens as an invoice even with the chooser on receipt', resolveInvoice(overdue, schema, provider, settingsReceipt).kind, 'invoice');
eq('a receipt row opens as a receipt', resolveInvoice(paid, schema, provider, settingsReceipt).kind, 'receipt');
eq('an empty cell falls back to the chooser', resolveInvoice({ ...overdue, Kind: '' }, schema, provider, settingsReceipt).kind, 'receipt');
eq('so does nonsense in it', resolveInvoice({ ...overdue, Kind: 'banana' }, schema, provider, settingsReceipt).kind, 'receipt');
eq('the list carries each row\'s kind', listInvoices(schema, provider).map((i) => i.kind), rows.map((r) => kinds.kindFromCell(r.Kind)));

// Saving: the word goes into the column, and a document without the column is not nagged.
{
  const draft = normaliseDraft({ kind: 'credit_note', number: 'CN-1', client: { name: 'Table 6' }, issued: '2026-09-01', due: '2026-09-01', status: 'Draft', lines: [{ description: 'Coffee', quantity: 1, unitPrice: 3.2 }] });
  draft.totals = { subtotal: 3.2, taxTotal: 0, total: 3.2, amountPaid: 0, balance: 3.2, taxLines: [], discounts: [], shipping: { amount: 0 } };
  const plan = w.buildWritePlan(draft, schema, { invoiceColumns: provider.columns('Invoices'), lineColumns: provider.columns('InvoiceItems'), existingLineRows: [] });
  eq('the kind is written as its word', plan.invoice.fields.Kind, 'Credit note');

  const bare = asDoc.map((t) => (t.id === 'Invoices' ? { ...t, columns: t.columns.filter((c) => c.id !== 'Kind') } : t));
  const bareSchema = detectSchema(bare);
  eq('without the column, no kind is mapped', bareSchema.invoice.roles.kind, undefined);
  const plan2 = w.buildWritePlan(draft, bareSchema, { invoiceColumns: bare.find((t) => t.id === 'Invoices').columns, lineColumns: provider.columns('InvoiceItems'), existingLineRows: [] });
  ok('and the save does not warn about it', !plan2.skipped.some((s) => s.role === 'kind'));
  ok('the upgrade offers the column instead', upgradeChecklist(bareSchema).invoice.some((i) => i.id === 'Kind'));
  const up = mig.buildUpgradePlan(bareSchema, { Invoices: bare.find((t) => t.id === 'Invoices').columns }, ['Kind']);
  eq('as a choice column', up.columns[0].def.type, 'Choice');
  ok('with the words as its choices', JSON.parse(up.columns[0].def.widgetOptions).choices.includes('Receipt'));
  eq('the resolver then falls back to the chooser', resolveInvoice(overdue, bareSchema, provider, settingsReceipt).kind, 'receipt');
}

// Other names for the column are recognised too.
for (const name of ['Type', 'DocumentType', 'Doc_Type', 'kind']) {
  const renamed = asDoc.map((t) => (t.id === 'Invoices' ? { ...t, columns: t.columns.map((c) => (c.id === 'Kind' ? { ...c, id: name } : c)) } : t));
  eq(`a column called ${name} is the kind`, detectSchema(renamed).invoice.roles.kind, name);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
