import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => import(pathToFileURL(_resolve(ROOT, p)).href);
const { normaliseDraft, recalc } = await load('src/model/draft.js');
const { simpleRate } = await load('src/money/tax/rates.js');
const f = await load('src/doc/fields.js');
const lang = await load('src/doc/lang.js');
const ei = await load('src/einvoice/index.js');
const email = await load('src/send/email-document.js');
const text = await load('src/send/document-text.js');
const { detectSchema, upgradeChecklist } = await load('src/model/schema.js');
const { resolveInvoice } = await load('src/model/resolve.js');
const w = await load('src/model/write.js');
const starter = await load('src/templates/starter.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

const settings = (over = {}) => ({
  money: { currency: 'EUR', taxEnabled: true, taxMode: 'simple', taxRates: simpleRate({ rate: 19, name: 'MwSt' }), homeCountry: 'DE' },
  einvoice: { profile: 'xrechnung' },
  ...over,
});
const draft = (over = {}, s = settings()) => recalc(normaliseDraft({
  kind: 'invoice', number: 'RE-2026-0042', issued: '2026-09-01', due: '2026-09-15', status: 'Sent', reference: 'PO-778',
  sender: { name: 'Zimmerei Hartmann GmbH', street1: 'Bahnhofstraße 12', city: 'Freiburg', postcode: '79098', country: 'DE', email: 'rechnung@hartmann.example', phone: '+49 761 1234', taxNumber: 'DE 123 456 789', iban: 'DE89 3704 0044 0532 0130 00' },
  client: { name: 'Stadtwerke Musterstadt', street1: 'Rathausplatz 1', city: 'Musterstadt', postcode: '12345', country: 'DE', email: 'einkauf@musterstadt.example' },
  lines: [{ description: 'Dachstuhl aufrichten', quantity: 12, unitPrice: 85, unit: 'Std.' }],
  ...over,
}), s);

// ---------------------------------------------------------------------------------------------
// The draft carries it, the words exist for it, the document shows it only when set
// ---------------------------------------------------------------------------------------------
eq('a service date survives normalisation', normaliseDraft({ serviceDate: '2026-08-28' }).serviceDate, '2026-08-28');
eq('and is empty when absent', normaliseDraft({}).serviceDate, '');
for (const l of lang.LANGUAGES) ok(`${l.id} has a word for it`, typeof lang.labels(l.id).serviceDate === 'string' && lang.labels(l.id).serviceDate.length > 3);
eq('German calls it what the law calls it', lang.labels('de').serviceDate, 'Leistungsdatum');

eq('not shown when empty', f.fieldsFor(draft(), settings()).showServiceDate, false);
eq('shown when set', f.fieldsFor(draft({ serviceDate: '2026-08-28' }), settings()).showServiceDate, true);
eq('never on a document without money', f.fieldsFor(draft({ kind: 'delivery_note', serviceDate: '2026-08-28' }), settings()).showServiceDate, false);

{
  const d = draft({ serviceDate: '2026-08-28', client: { name: 'Beispiel GmbH', country: 'DE', language: 'de' } });
  const html = email.documentToEmailHtml(d, settings());
  ok('the email prints it in the document language', html.includes('Leistungsdatum') && /28\. Aug\.? 2026/.test(html));
  const plain = text.documentToPlainText(d, settings());
  ok('so does the plain text', plain.includes('Leistungsdatum'));
  ok('and neither prints it when empty', !email.documentToEmailHtml(draft(), settings()).includes('Leistungsdatum'));
}

// ---------------------------------------------------------------------------------------------
// The e-invoice: BT-72 in both syntaxes, the service date first, the issue date standing in
// ---------------------------------------------------------------------------------------------
{
  const m = ei.einvoiceModel(draft({ serviceDate: '2026-08-28' }), settings());
  eq('the model carries the service date as the delivery date', m.deliveryDate, '2026-08-28');
  eq('and the issue date when there is none', ei.einvoiceModel(draft(), settings()).deliveryDate, '2026-09-01');

  const u = ei.einvoiceXml(draft({ serviceDate: '2026-08-28' }), settings(), 'ubl');
  ok('UBL carries cac:Delivery with the date', u.includes('<cac:Delivery>') && u.includes('<cbc:ActualDeliveryDate>2026-08-28</cbc:ActualDeliveryDate>'));
  // Schema order: after the customer party, before the payment means.
  ok('in schema order', u.indexOf('<cac:AccountingCustomerParty>') < u.indexOf('<cac:Delivery>') && u.indexOf('<cac:Delivery>') < u.indexOf('<cac:PaymentMeans>'));
  ok('the fallback is the issue date', ei.einvoiceXml(draft(), settings(), 'ubl').includes('<cbc:ActualDeliveryDate>2026-09-01</cbc:ActualDeliveryDate>'));

  const c = ei.einvoiceXml(draft({ serviceDate: '2026-08-28' }), settings(), 'cii');
  ok('CII carries it as the delivery event', /<ram:ActualDeliverySupplyChainEvent>\s*<ram:OccurrenceDateTime>\s*<udt:DateTimeString format="102">20260828<\/udt:DateTimeString>/.test(c));
}

// ---------------------------------------------------------------------------------------------
// The column: recognised, offered, written, read back
// ---------------------------------------------------------------------------------------------
{
  const tables = starter.starterTablesFor('construction', { numberPrefix: 'INV-' });
  const asDoc = tables.map((t) => ({ id: t.id, label: t.label, columns: t.columns.map((c) => ({ id: c.id, type: c.type })), records: t.records.map((r, i) => ({ id: i + 1, ...r })) }));
  const provider = { records: (id) => asDoc.find((t) => t.id === id)?.records || [], columns: (id) => asDoc.find((t) => t.id === id)?.columns || [] };
  const schema = detectSchema(asDoc);
  eq('the starter has the column', tables.find((t) => t.id === 'Invoices').columns.find((c) => c.id === 'ServiceDate')?.type, 'Date');
  ok('filled with the issue date', tables.find((t) => t.id === 'Invoices').records.every((r) => r.ServiceDate === r.Issued));
  eq('it is recognised as the service date', schema.invoice.roles.serviceDate, 'ServiceDate');
  ok('so the upgrade has nothing to add', !upgradeChecklist(schema).invoice.some((i) => i.id === 'ServiceDate'));
  eq('a row reads back with it', resolveInvoice(provider.records('Invoices')[0], schema, provider, settings()).serviceDate, provider.records('Invoices')[0].Issued);

  for (const name of ['DeliveryDate', 'Leistungsdatum', 'PerformedOn', 'supply_date']) {
    const renamed = asDoc.map((t) => (t.id === 'Invoices' ? { ...t, columns: t.columns.map((c) => (c.id === 'ServiceDate' ? { ...c, id: name } : c)) } : t));
    eq(`a column called ${name} is the service date`, detectSchema(renamed).invoice.roles.serviceDate, name);
  }

  const d = draft({ serviceDate: '2026-08-28', client: { name: 'Harbour Lane Bakery' } });
  const plan = w.buildWritePlan(d, schema, { invoiceColumns: provider.columns('Invoices'), lineColumns: provider.columns('InvoiceItems'), existingLineRows: [] });
  // A Date column holds epoch seconds; the plan converts, as it does for every date.
  eq('saving writes it, as the date column stores it', plan.invoice.fields.ServiceDate, Math.floor(Date.parse('2026-08-28T00:00:00Z') / 1000));

  const bare = asDoc.map((t) => (t.id === 'Invoices' ? { ...t, columns: t.columns.filter((c) => c.id !== 'ServiceDate') } : t));
  const bareSchema = detectSchema(bare);
  ok('a document without the column is offered it', upgradeChecklist(bareSchema).invoice.some((i) => i.id === 'ServiceDate'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
