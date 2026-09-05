import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => import(pathToFileURL(_resolve(ROOT, p)).href);
const ei = await load('src/einvoice/index.js');
const { normaliseDraft, recalc } = await load('src/model/draft.js');
const { simpleRate } = await load('src/money/tax/rates.js');
const { detectSchema } = await load('src/model/schema.js');
const { clientParty } = await load('src/model/resolve.js');
const { CLIENT_FORM } = await load('src/model/records.js');
const store = await load('src/settings/store.js');
const { embeddedFontsFromBytes } = await load('src/export/pdf/font-loader.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

const settings = (profile) => ({
  money: { currency: 'EUR', taxEnabled: true, taxMode: 'simple', taxRates: simpleRate({ rate: 19, name: 'MwSt' }), homeCountry: 'DE' },
  einvoice: { profile },
});
const SELLER = { name: 'Zimmerei Hartmann GmbH', street1: 'Bahnhofstraße 12', city: 'Freiburg', postcode: '79098', country: 'DE', email: 'rechnung@hartmann.example', phone: '+49 761 1234', taxNumber: 'DE 123 456 789' };
const draft = (over = {}, s = settings('peppol')) => recalc(normaliseDraft({
  kind: 'invoice', number: 'RE-2026-0042', issued: '2026-09-01', due: '2026-09-15', status: 'Sent', reference: 'PO-778',
  sender: SELLER,
  client: { name: 'Boulangerie du Port', street1: '1 quai des Antilles', city: 'Nantes', postcode: '44000', country: 'FR', taxNumber: 'FR12345678901', email: 'compta@duport.example' },
  lines: [{ description: 'Dachstuhl aufrichten', quantity: 12, unitPrice: 85, unit: 'Std.' }],
  ...over,
}), s);

// ---------------------------------------------------------------------------------------------
// The electronic address, per profile
// ---------------------------------------------------------------------------------------------
{
  const m = ei.einvoiceModel(draft(), settings('peppol'));
  eq('under Peppol a German seller is addressed by VAT number under scheme 9930', m.seller.endpoint, { scheme: '9930', value: 'DE123456789' });
  eq('and a French buyer under 9957', m.buyer.endpoint, { scheme: '9957', value: 'FR12345678901' });
  const u = ei.einvoiceXml(draft(), settings('peppol'), 'ubl');
  ok('the UBL carries the scheme', u.includes('<cbc:EndpointID schemeID="9930">DE123456789</cbc:EndpointID>') && u.includes('<cbc:EndpointID schemeID="9957">FR12345678901</cbc:EndpointID>'));
  ok('and never EM under Peppol', !u.includes('schemeID="EM"'));

  const x = ei.einvoiceModel(draft(), settings('xrechnung'));
  eq('XRechnung keeps the email under EM', x.seller.endpoint, { scheme: 'EM', value: 'rechnung@hartmann.example' });
  const e = ei.einvoiceModel(draft(), settings('en16931'));
  eq('so does plain EN 16931', e.buyer.endpoint, { scheme: 'EM', value: 'compta@duport.example' });
}

// A typed Peppol ID wins everywhere.
{
  const d = draft({ sender: { ...SELLER, peppolId: '0204:991-12345-67' }, client: { name: 'Gemeente Utrecht', country: 'NL', email: 'x@y.example', peppolId: '0106:12345678' } });
  for (const p of ['peppol', 'xrechnung', 'en16931']) {
    const m = ei.einvoiceModel(d, settings(p));
    eq(`${p}: the seller's typed id is used`, m.seller.endpoint, { scheme: '0204', value: '991-12345-67' });
    eq(`${p}: the buyer's too`, m.buyer.endpoint, { scheme: '0106', value: '12345678' });
  }
  const bad = ei.einvoiceModel(draft({ sender: { ...SELLER, peppolId: 'DE123456789' } }), settings('peppol'));
  eq('an id without a scheme is ignored and the VAT number stands in', bad.seller.endpoint, { scheme: '9930', value: 'DE123456789' });
}

// A party Peppol cannot address is reported, in words that say what to type.
{
  const noVat = ei.einvoiceModel(draft({ client: { name: 'Kalle Anka AB', country: 'SE', email: 'k@anka.example' } }), settings('peppol'));
  eq('a Swedish buyer with no id has no address', noVat.buyer.endpoint, null);
  const res = ei.checkEInvoice(noVat);
  ok('the check refuses it', !res.ok && res.errors.some((e) => e.code === 'PEPPOL-EN16931-R010'));
  ok('and says what Peppol wants', res.errors.some((e) => /Peppol ID|VAT number/.test(e.text)));
  const noSeller = ei.einvoiceModel(draft({ sender: { ...SELLER, taxNumber: '' } }), settings('peppol'));
  ok('a seller without a VAT number or id is refused too', ei.checkEInvoice(noSeller).errors.some((e) => e.code === 'PEPPOL-EN16931-R020'));
  // The same seller is fine under XRechnung, where the email is the address.
  ok('but accepted under XRechnung with an email', !ei.checkEInvoice(ei.einvoiceModel(draft({ sender: { ...SELLER, taxNumber: 'DE123456789' } }), settings('xrechnung'))).errors.some((e) => /R020|BR-DE-2/.test(e.code)));
}

// ---------------------------------------------------------------------------------------------
// The business process id is on every profile now
// ---------------------------------------------------------------------------------------------
{
  const u = ei.einvoiceXml(draft(), settings('en16931'), 'ubl');
  ok('plain EN 16931 UBL names the billing process', u.includes('<cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>'));
  const c = ei.einvoiceXml(draft(), settings('en16931'), 'cii');
  ok('and the CII does', c.includes('<ram:BusinessProcessSpecifiedDocumentContextParameter>') && c.includes('urn:fdc:peppol.eu:2017:poacc:billing:01:1.0'));
}

// ---------------------------------------------------------------------------------------------
// Factur-X: a credit note is still an INVOICE document in the XMP
// ---------------------------------------------------------------------------------------------
{
  const fonts = embeddedFontsFromBytes(
    new Uint8Array(readFileSync(_resolve(ROOT, 'fonts/DejaVuSans-Regular.ttf'))),
    new Uint8Array(readFileSync(_resolve(ROOT, 'fonts/DejaVuSans-Bold.ttf'))),
  );
  const pdf = Buffer.from(ei.facturXPdf(draft({ kind: 'credit_note', number: 'GS-1', relatedTo: 'Rechnung RE-2026-0042' }), settings('en16931'), { fonts })).toString('latin1');
  ok('the XMP says INVOICE', pdf.includes('<fx:DocumentType>INVOICE</fx:DocumentType>'));
  ok('and never CREDITNOTE', !pdf.includes('CREDITNOTE'));
  ok('while the XML inside says 381', pdf.includes('<ram:TypeCode>381</ram:TypeCode>'));
}

// ---------------------------------------------------------------------------------------------
// The client record and the settings carry the id
// ---------------------------------------------------------------------------------------------
{
  const tables = [
    { id: 'Invoices', label: 'Invoices', columns: [{ id: 'InvoiceNumber', type: 'Text' }, { id: 'Client', type: 'Ref:Clients' }, { id: 'Issued', type: 'Date' }, { id: 'Due', type: 'Date' }, { id: 'Total', type: 'Numeric' }] },
    { id: 'Clients', label: 'Clients', columns: [{ id: 'Name', type: 'Text' }, { id: 'Email', type: 'Text' }, { id: 'PeppolId', type: 'Text' }, { id: 'Country', type: 'Text' }] },
  ];
  const schema = detectSchema(tables);
  eq('a PeppolId column is recognised', schema.client.roles.peppolId, 'PeppolId');
  eq('so is ElectronicAddress', detectSchema(tables.map((t) => (t.id === 'Clients' ? { ...t, columns: t.columns.map((c) => (c.id === 'PeppolId' ? { ...c, id: 'ElectronicAddress' } : c)) } : t))).client.roles.peppolId, 'ElectronicAddress');
  eq('the party carries it', clientParty({ id: 1, Name: 'X', PeppolId: '0208:0123456789', Country: 'BE' }, schema.client.roles).peppolId, '0208:0123456789');
  ok('the client form asks for it', CLIENT_FORM.some((f) => f.role === 'peppolId'));
  eq('the business setting is kept, without spaces', store.sanitise({ business: { peppolId: ' 9930 : DE123456789 ' } }).business.peppolId, '9930:DE123456789');
  eq('and defaults to empty', store.sanitise({}).business.peppolId, '');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
