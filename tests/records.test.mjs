import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rec = await import(pathToFileURL(_resolve(ROOT, 'src/model/records.js')).href);
const schema = await import(pathToFileURL(_resolve(ROOT, 'src/model/schema.js')).href);
const starter = await import(pathToFileURL(_resolve(ROOT, 'src/templates/starter.js')).href);
const store = await import(pathToFileURL(_resolve(ROOT, 'src/settings/store.js')).href);

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

// ---------------------------------------------------------------------------------------------
// The form resolves itself against a real table
// ---------------------------------------------------------------------------------------------
const clientCols = [
  { id: 'Name', type: 'Text' }, { id: 'Email', type: 'Text' }, { id: 'City', type: 'Text' },
  { id: 'Country', type: 'Text' }, { id: 'Language', type: 'Text' }, { id: 'Display', type: 'Text', isFormula: true },
];
const clientRoles = { name: 'Name', email: 'Email', city: 'City', country: 'Country', language: 'Language', phone: 'Display' };

{
  const f = rec.formFields('client', clientRoles, clientCols);
  eq('every client field is asked for, in order', f.map((x) => x.role), ['name', 'email', 'phone', 'street1', 'street2', 'city', 'state', 'postcode', 'country', 'taxNumber', 'peppolId', 'language']);
  ok('a mapped field knows its column', f.find((x) => x.role === 'email').colId === 'Email' && f.find((x) => x.role === 'email').writable);
  ok('an unmapped field is present in the form but not writable', !f.find((x) => x.role === 'street1').present && !f.find((x) => x.role === 'street1').writable);
  ok('a formula column is present but not writable', f.find((x) => x.role === 'phone').present && !f.find((x) => x.role === 'phone').writable);
}

const productCols = [
  { id: 'Name', type: 'Text' }, { id: 'Price', type: 'Numeric' }, { id: 'Unit', type: 'Text' }, { id: 'Image', type: 'Attachments' }, { id: 'SKU', type: 'Text' },
];
const productRoles = { name: 'Name', unitPrice: 'Price', unit: 'Unit', image: 'Image', sku: 'SKU' };

{
  const f = rec.formFields('product', productRoles, productCols);
  ok('the picture field knows the column takes attachments', f.find((x) => x.role === 'image').attachments);
  ok('a text picture column is not attachments', !rec.formFields('product', productRoles, [...productCols.filter((c) => c.id !== 'Image'), { id: 'Image', type: 'Text' }]).find((x) => x.role === 'image').attachments);
}

// ---------------------------------------------------------------------------------------------
// Reading a row into the form
// ---------------------------------------------------------------------------------------------
{
  const v = rec.readRecord({ id: 3, Name: 'Harbour Lane Bakery', Email: 'a@b.example', City: 'Bristol', Country: 'GB', Language: 'de' }, 'client', clientRoles);
  eq('mapped values come through by role', [v.name, v.email, v.city, v.country, v.language], ['Harbour Lane Bakery', 'a@b.example', 'Bristol', 'GB', 'de']);
  eq('an unmapped role is empty, not undefined', v.street1, '');
  eq('a blank row is all empty', rec.readRecord(null, 'product', productRoles).name, '');
  eq('a name for a record', rec.recordName({ name: '  Alder Court ' }, 'client'), 'Alder Court');
  eq('and for one without', [rec.recordName({}, 'client'), rec.recordName({}, 'product')], ['Unnamed client', 'Untitled item']);
}

// ---------------------------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------------------------
{
  const p = rec.recordPlan({ kind: 'client', table: 'Clients', roles: clientRoles, columns: clientCols, rowId: null,
    values: { name: 'Alder Court Dental', email: 'billing@aldercourt.example', phone: '+44 1225 496 220', street1: '3 Alder Court', city: 'Bath', country: 'gb', language: 'de' } });
  eq('a new client plans an add', [p.ok, p.table, p.rowId], [true, 'Clients', null]);
  eq('mapped, writable fields are written', p.fields, { Name: 'Alder Court Dental', Email: 'billing@aldercourt.example', City: 'Bath', Country: 'gb', Language: 'de' });
  eq('the unmapped street and the formula phone are reported, not dropped silently', p.skipped.map((s) => s.role).sort(), ['phone', 'street1']);
}
{
  const p = rec.recordPlan({ kind: 'client', table: 'Clients', roles: clientRoles, columns: clientCols, rowId: 7, values: { name: 'X', email: '', city: 'Bath' } });
  eq('an update writes a cleared field as empty', p.fields.Email, '');
  eq('and keeps the row id', p.rowId, 7);
  const blank = rec.recordPlan({ kind: 'client', table: 'Clients', roles: clientRoles, columns: clientCols, rowId: null, values: { name: '', email: 'x@y.example' } });
  eq('a new client needs a name', [blank.ok, blank.problems[0]], [false, 'Name is required.']);
  const nothing = rec.recordPlan({ kind: 'client', table: 'Clients', roles: { name: 'Nope' }, columns: clientCols, rowId: null, values: { name: 'A' } });
  ok('a role mapped to a column the table lacks cannot be written', !nothing.ok);
}
{
  const p = rec.recordPlan({ kind: 'product', table: 'Products', roles: productRoles, columns: productCols, rowId: null,
    values: { name: 'Site survey', unitPrice: '320', unit: 'day', image: ['L', 12], sku: 'SURVEY' } });
  eq('a price typed as text becomes a number', p.fields.Price, 320);
  eq('an uploaded picture is written as the attachment list', p.fields.Image, ['L', 12]);
  eq('an attachment id alone is wrapped', rec.recordPlan({ kind: 'product', table: 'Products', roles: productRoles, columns: productCols, rowId: 1, values: { name: 'X', unitPrice: 1, image: 9 } }).fields.Image, ['L', 9]);
  const notUploaded = rec.recordPlan({ kind: 'product', table: 'Products', roles: productRoles, columns: productCols, rowId: null, values: { name: 'X', unitPrice: 1, image: 'data:image/jpeg;base64,AAAA' } });
  ok('a picture that was never uploaded is not put into an attachment column', !('Image' in notUploaded.fields) && notUploaded.skipped.some((s) => s.role === 'image'));
  const textCol = rec.recordPlan({ kind: 'product', table: 'Products', roles: productRoles, columns: [...productCols.filter((c) => c.id !== 'Image'), { id: 'Image', type: 'Text' }], rowId: null, values: { name: 'X', unitPrice: 1, image: 'https://example.com/a.jpg' } });
  eq('but a text picture column takes the address', textCol.fields.Image, 'https://example.com/a.jpg');
  const cleared = rec.recordPlan({ kind: 'product', table: 'Products', roles: productRoles, columns: productCols, rowId: 4, values: { name: 'X', unitPrice: 1, image: null } });
  eq('clearing the picture on an existing row writes null', cleared.fields.Image, null);
  const noPrice = rec.recordPlan({ kind: 'product', table: 'Products', roles: productRoles, columns: productCols, rowId: null, values: { name: 'X', unitPrice: '' } });
  eq('a catalogue item needs a price', noPrice.problems, ['Unit price is required.']);
  const badPrice = rec.recordPlan({ kind: 'product', table: 'Products', roles: productRoles, columns: productCols, rowId: null, values: { name: 'X', unitPrice: 'ten' } });
  ok('a price that is not a number is reported rather than stored wrongly', badPrice.skipped.some((s) => s.role === 'unitPrice'));
}

// ---------------------------------------------------------------------------------------------
// Column choices: a table built by hand, with its own names
// ---------------------------------------------------------------------------------------------
const german = [
  { id: 'Rechnungen', label: 'Rechnungen', columns: [{ id: 'Nr', type: 'Text' }, { id: 'Kunde', type: 'Ref:Kunden' }, { id: 'Datum', type: 'Date' }, { id: 'Faellig', type: 'Date' }, { id: 'Summe', type: 'Numeric' }, { id: 'Notiz', type: 'Text' }] },
  { id: 'Kunden', label: 'Kunden', columns: [{ id: 'Firma', type: 'Text' }, { id: 'Mail', type: 'Text' }, { id: 'Ort', type: 'Text' }, { id: 'Land', type: 'Text' }] },
  { id: 'Posten', label: 'Posten', columns: [{ id: 'Rechnung', type: 'Ref:Rechnungen' }, { id: 'Text', type: 'Text' }, { id: 'Menge', type: 'Numeric' }, { id: 'Preis', type: 'Numeric' }] },
  { id: 'Artikel', label: 'Artikel', columns: [{ id: 'Bezeichnung', type: 'Text' }, { id: 'Preis', type: 'Numeric' }, { id: 'Einheit', type: 'Text' }, { id: 'Bild', type: 'Attachments' }] },
];

{
  const force = {
    invoice: 'Rechnungen', line: 'Posten', client: 'Kunden', product: 'Artikel',
    columns: {
      invoice: { number: 'Nr', client: 'Kunde', issued: 'Datum', due: 'Faellig', total: 'Summe', note: 'Notiz' },
      line: { invoiceLink: 'Rechnung', description: 'Text', quantity: 'Menge', unitPrice: 'Preis' },
      client: { name: 'Firma', email: 'Mail', city: 'Ort', country: 'Land' },
      product: { name: 'Bezeichnung', unitPrice: 'Preis', unit: 'Einheit', image: 'Bild' },
    },
  };
  const s = schema.detectSchema(german, { force });
  eq('the invoice roles are the chosen columns', s.invoice.roles, force.columns.invoice);
  eq('so are the line roles', s.line.roles, force.columns.line);
  eq('and the client roles', s.client.roles, force.columns.client);
  eq('the source says chosen', s.source, 'chosen');
  ok('no warning about a missing client email once it is mapped', !s.warnings.some((w) => w.code === 'no-client-email'));
  const p = schema.detectProducts(german, s, { force: 'Artikel', columns: force.columns.product });
  eq('the catalogue roles too', p.roles, force.columns.product);
}
{
  // Choosing a column for one role takes it away from whatever guessed it, and '-' unmaps.
  const roles = schema.applyRoleChoices({ number: 'Nr', note: 'Text', reference: 'Ref' }, [{ id: 'Nr' }, { id: 'Text' }, { id: 'Ref' }], { reference: 'Text', note: '-' });
  eq('a chosen column serves one role only', roles, { number: 'Nr', reference: 'Text' });
  eq('a choice naming a column that is gone is ignored', schema.applyRoleChoices({ number: 'Nr' }, [{ id: 'Nr' }], { client: 'Vanished' }), { number: 'Nr' });
  eq('no choices, no change', schema.applyRoleChoices({ number: 'Nr' }, [{ id: 'Nr' }], {}), { number: 'Nr' });
}
{
  const s = store.sanitise({ tables: { invoice: 'Rechnungen', columns: { invoice: { number: 'Nr', client: 'Kunde' }, client: { name: 7 }, bogus: { a: 'b' } } } });
  eq('column choices survive sanitising', s.tables.columns.invoice, { number: 'Nr', client: 'Kunde' });
  eq('a non-string choice is dropped', s.tables.columns.client, {});
  eq('every part is present', Object.keys(s.tables.columns).sort(), ['client', 'invoice', 'line', 'product']);
  eq('nothing by default', store.sanitise({}).tables.columns.invoice, {});
}

// ---------------------------------------------------------------------------------------------
// The empty starter
// ---------------------------------------------------------------------------------------------
{
  const empty = starter.starterTablesFor('restaurant', { empty: true });
  eq('four tables', empty.map((t) => t.id), ['Clients', 'Products', 'Invoices', 'InvoiceItems']);
  ok('with no rows', empty.every((t) => t.records.length === 0));
  const full = starter.starterTablesFor('restaurant', {});
  eq('and exactly the columns the full starter has', empty.map((t) => t.columns.map((c) => c.id)), full.map((t) => t.columns.map((c) => c.id)));
  const detected = schema.detectSchema(empty.map((t) => ({ id: t.id, label: t.label, columns: t.columns })));
  eq('an empty document still reads back', [detected.invoice?.table, detected.line?.table, detected.client?.table], ['Invoices', 'InvoiceItems', 'Clients']);
  eq('with nothing left to upgrade', schema.upgradeChecklist(detected).invoice.length, 0);
}

// ---------------------------------------------------------------------------------------------
// Saving and removing in the demo, through the writer
// ---------------------------------------------------------------------------------------------
{
  const writer = await import(pathToFileURL(_resolve(ROOT, 'src/grist/writer.js')).href);
  const data = { defaultTable: 'Clients', tables: { Clients: { id: 'Clients', columns: clientCols, records: [{ id: 1, Name: 'A' }, { id: 4, Name: 'B' }] } } };
  const provider = { data, setData(d) { this.data = d; }, tables: () => [{ id: 'Clients' }], records: (t) => data.tables[t].records };
  const add = await writer.saveRecord(rec.recordPlan({ kind: 'client', table: 'Clients', roles: clientRoles, columns: clientCols, rowId: null, values: { name: 'Kingfisher', email: 'k@p.example' } }), provider, { live: false });
  eq('a new record gets the next id', [add.ok, add.rowId], [true, 5]);
  eq('and is in the table', data.tables.Clients.records.find((r) => r.id === 5).Name, 'Kingfisher');
  const upd = await writer.saveRecord(rec.recordPlan({ kind: 'client', table: 'Clients', roles: clientRoles, columns: clientCols, rowId: 4, values: { name: 'B Ltd' } }), provider, { live: false });
  eq('an update keeps its id', [upd.ok, upd.rowId], [true, 4]);
  eq('and changes the row', data.tables.Clients.records.find((r) => r.id === 4).Name, 'B Ltd');
  const gone = await writer.saveRecord(rec.recordPlan({ kind: 'client', table: 'Clients', roles: clientRoles, columns: clientCols, rowId: 99, values: { name: 'Z' } }), provider, { live: false });
  ok('updating a vanished row fails honestly', !gone.ok);
  const rm = await writer.removeRecord('Clients', 1, provider, { live: false });
  eq('a record can be removed', [rm.ok, data.tables.Clients.records.map((r) => r.id)], [true, [4, 5]]);
  const bad = await writer.saveRecord({ ok: false, problems: ['Name is required.'] }, provider, { live: false });
  eq('a plan that is not ok is not saved', [bad.ok, bad.error], [false, 'Name is required.']);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
