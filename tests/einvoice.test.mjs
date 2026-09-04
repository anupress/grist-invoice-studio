import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const xml = await import(pathToFileURL(_resolve(ROOT, 'src/einvoice/xml.js')).href);
const ei = await import(pathToFileURL(_resolve(ROOT, 'src/einvoice/index.js')).href);
const icc = await import(pathToFileURL(_resolve(ROOT, 'src/export/pdf/icc.js')).href);
const { embeddedFontsFromBytes } = await import(pathToFileURL(_resolve(ROOT, 'src/export/pdf/font-loader.js')).href);
const { normaliseDraft, recalc } = await import(pathToFileURL(_resolve(ROOT, 'src/model/draft.js')).href);
const { simpleRate } = await import(pathToFileURL(_resolve(ROOT, 'src/money/tax/rates.js')).href);

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };
const latin1 = (bytes) => Buffer.from(bytes).toString('latin1');
const tagText = (s, name) => { const m = new RegExp(`<${name}(?: [^>]*)?>([^<]*)</${name}>`).exec(s); return m ? m[1] : null; };
const tagsText = (s, name) => [...s.matchAll(new RegExp(`<${name}(?: [^>]*)?>([^<]*)</${name}>`, 'g'))].map((m) => m[1]);

// ---------------------------------------------------------------------------------------------
// The XML builder
// ---------------------------------------------------------------------------------------------
{
  const doc = xml.el('a', { x: '1' }, xml.el('b', 'Müller & Söhne <Ltd>'), xml.opt('c', ''), xml.el('d', xml.opt('e', null)));
  const out = xml.toXml(doc);
  ok('a declaration', out.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  ok('text is escaped', out.includes('Müller &amp; Söhne &lt;Ltd&gt;'));
  ok('an empty optional vanishes', !out.includes('<c'));
  ok('and so does its empty parent', !out.includes('<d'));
  ok('attributes survive', out.includes('<a x="1">'));
  ok('balanced', xml.balanced(out));
  ok('and the checker notices when not', !xml.balanced('<a><b></a>'));
  eq('money to two places', xml.amt(1234.5), '1234.50');
  eq('float noise is rounded away', xml.amt(0.1 + 0.2), '0.30');
  eq('a quantity without trailing zeros', xml.num(2.5), '2.5');
  eq('a whole quantity', xml.num(3), '3');
  eq('a percentage', xml.num(19), '19');
}

// ---------------------------------------------------------------------------------------------
// A German invoice, through the engine, into the model
// ---------------------------------------------------------------------------------------------
const settings = (over = {}) => ({
  money: { currency: 'EUR', taxEnabled: true, taxMode: 'simple', taxRates: simpleRate({ rate: 19, name: 'MwSt' }), homeCountry: 'DE' },
  einvoice: { profile: 'en16931' },
  ...over,
});
const draft = (over = {}, s = settings()) => recalc(normaliseDraft({
  kind: 'invoice', number: 'RE-2026-0042', issued: '2026-09-01', due: '2026-09-15', status: 'Sent', reference: 'PO-778',
  terms: '14 Tage netto', note: 'Vielen Dank.',
  sender: { name: 'Zimmerei Hartmann GmbH', street1: 'Bahnhofstraße 12', city: 'Freiburg', postcode: '79098', country: 'DE', email: 'rechnung@hartmann.example', phone: '+49 761 1234', taxNumber: 'DE 123 456 789', iban: 'DE89 3704 0044 0532 0130 00', bic: 'COBADEFFXXX', legalText: 'HRB 1234 Freiburg' },
  client: { name: 'Bäckerei Sonnenschein', street1: 'Marktplatz 3', city: 'Basel', postcode: '4001', country: 'CH', email: 'info@sonnenschein.example' },
  lines: [
    { description: 'Dachstuhl aufrichten', quantity: 12, unitPrice: 85, unit: 'Std.' },
    { description: 'Kantholz 10×10', quantity: 40, unitPrice: 6.5, unit: 'm' },
  ],
  ...over,
}), s);

{
  const m = ei.einvoiceModel(draft(), settings());
  eq('an invoice is type 380', m.typeCode, '380');
  eq('the number', m.number, 'RE-2026-0042');
  eq('the dates', [m.issueDate, m.dueDate], ['2026-09-01', '2026-09-15']);
  eq('the currency', m.currency, 'EUR');
  eq('the seller VAT id is stripped of spaces', m.seller.vatId, 'DE123456789');
  eq('and is a VAT id, not a national registration', m.seller.taxId, '');
  eq('the seller endpoint is the email', m.seller.endpoint, { scheme: 'EM', value: 'rechnung@hartmann.example' });
  eq('the country is two letters', [m.seller.country, m.buyer.country], ['DE', 'CH']);
  eq('two lines', m.lines.length, 2);
  eq('hours are HUR', m.lines[0].unitCode, 'HUR');
  eq('metres are MTR', m.lines[1].unitCode, 'MTR');
  eq('the first line net', m.lines[0].net, 1020);
  eq('standard rated at 19', [m.lines[0].category.id, m.lines[0].category.rate], ['S', 19]);
  eq('one breakdown group', m.breakdown.length, 1);
  eq('with the basis of both lines', m.breakdown[0].basis, 1280);
  eq('and the tax', m.breakdown[0].tax, 243.2);
  eq('line total', m.totals.lineExtension, 1280);
  eq('tax exclusive', m.totals.taxExclusive, 1280);
  eq('tax inclusive', m.totals.taxInclusive, 1523.2);
  eq('payable', m.totals.payable, 1523.2);
  eq('SEPA credit transfer', m.payment.code, '58');
  eq('IBAN without spaces', m.payment.iban, 'DE89370400440532013000');
  eq('the buyer reference', m.buyerReference, 'PO-778');
  eq('the check passes', ei.checkEInvoice(m).ok, true);
}

// A national tax number without a country prefix is a registration, not a VAT id.
{
  const m = ei.einvoiceModel(draft({ sender: { name: 'T', country: 'GB', taxNumber: '481 2739 55' } }), settings());
  eq('no prefix, no VAT id', m.seller.vatId, '');
  eq('but the registration is kept', m.seller.taxId, '481 2739 55');
  ok('and the check says so', ei.checkEInvoice(m).warnings.some((w) => w.code === 'BR-CO-26'));
}

// ---------------------------------------------------------------------------------------------
// UBL
// ---------------------------------------------------------------------------------------------
{
  const u = ei.einvoiceXml(draft(), settings(), 'ubl');
  ok('balanced', xml.balanced(u));
  ok('an Invoice root in the UBL namespace', u.includes('<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"'));
  eq('the EN 16931 customization', tagText(u, 'cbc:CustomizationID'), 'urn:cen.eu:en16931:2017');
  eq('the number', tagText(u, 'cbc:ID'), 'RE-2026-0042');
  eq('the type code', tagText(u, 'cbc:InvoiceTypeCode'), '380');
  eq('the due date', tagText(u, 'cbc:DueDate'), '2026-09-15');
  eq('the buyer reference', tagText(u, 'cbc:BuyerReference'), 'PO-778');
  ok('the seller endpoint under the EM scheme', u.includes('<cbc:EndpointID schemeID="EM">rechnung@hartmann.example</cbc:EndpointID>'));
  ok('the VAT id', u.includes('<cbc:CompanyID>DE123456789</cbc:CompanyID>'));
  ok('the buyer country', u.includes('<cbc:IdentificationCode>CH</cbc:IdentificationCode>'));
  ok('SEPA payment means with the IBAN', u.includes('<cbc:PaymentMeansCode>58</cbc:PaymentMeansCode>') && u.includes('<cbc:ID>DE89370400440532013000</cbc:ID>'));
  ok('the BIC', u.includes('<cbc:ID>COBADEFFXXX</cbc:ID>'));
  eq('the tax total', tagsText(u, 'cbc:TaxAmount')[0], '243.20');
  ok('the tax subtotal basis', u.includes('<cbc:TaxableAmount currencyID="EUR">1280.00</cbc:TaxableAmount>'));
  ok('the category S at 19', /<cac:TaxCategory>\s*<cbc:ID>S<\/cbc:ID>\s*<cbc:Percent>19<\/cbc:Percent>/.test(u));
  eq('line extension', tagsText(u, 'cbc:LineExtensionAmount')[0], '1280.00');
  eq('payable', tagText(u, 'cbc:PayableAmount'), '1523.20');
  eq('two lines', (u.match(/<cac:InvoiceLine>/g) || []).length, 2);
  ok('quantity with its unit code', u.includes('<cbc:InvoicedQuantity unitCode="HUR">12</cbc:InvoicedQuantity>'));
  ok('the unit price', u.includes('<cbc:PriceAmount currencyID="EUR">85.00</cbc:PriceAmount>'));
  ok('the German text is intact', u.includes('Bahnhofstraße') && u.includes('Dachstuhl aufrichten'));
  // Schema order: CustomizationID before ID before IssueDate; supplier before customer; tax before totals; lines last.
  const order = ['cbc:CustomizationID', 'cbc:ID', 'cbc:IssueDate', 'cbc:DueDate', 'cbc:InvoiceTypeCode', 'cbc:DocumentCurrencyCode', 'cac:AccountingSupplierParty', 'cac:AccountingCustomerParty', 'cac:PaymentMeans', 'cac:TaxTotal', 'cac:LegalMonetaryTotal', 'cac:InvoiceLine'];
  const positions = order.map((t) => u.indexOf('<' + t));
  ok('elements are in schema order', positions.every((p, i) => p >= 0 && (i === 0 || p > positions[i - 1])));
}

// A credit note is a different root with a different line element and no due date.
{
  const c = ei.einvoiceXml(draft({ kind: 'credit_note', relatedTo: 'Rechnung RE-2026-0042', number: 'GS-2026-0003' }), settings(), 'ubl');
  ok('a CreditNote root', c.includes('<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"'));
  eq('type 381', tagText(c, 'cbc:CreditNoteTypeCode'), '381');
  ok('no due date', !c.includes('<cbc:DueDate>'));
  ok('credited quantities', c.includes('<cbc:CreditedQuantity'));
  ok('naming the invoice it corrects', c.includes('<cac:BillingReference>') && c.includes('<cbc:ID>RE-2026-0042</cbc:ID>'));
  ok('balanced', xml.balanced(c));
}

// XRechnung and Peppol announce themselves.
{
  const x = ei.einvoiceXml(draft(), settings({ einvoice: { profile: 'xrechnung' } }), 'ubl');
  eq('the XRechnung customization', tagText(x, 'cbc:CustomizationID'), 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0');
  eq('with the billing profile', tagText(x, 'cbc:ProfileID'), 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0');
  const p = ei.einvoiceXml(draft(), settings({ einvoice: { profile: 'peppol' } }), 'ubl');
  eq('the Peppol customization', tagText(p, 'cbc:CustomizationID'), 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0');
}

// ---------------------------------------------------------------------------------------------
// CII
// ---------------------------------------------------------------------------------------------
{
  const c = ei.einvoiceXml(draft(), settings(), 'cii');
  ok('balanced', xml.balanced(c));
  ok('the CII root', c.includes('<rsm:CrossIndustryInvoice'));
  ok('the guideline', c.includes('<ram:ID>urn:cen.eu:en16931:2017</ram:ID>'));
  ok('the number and type', c.includes('<ram:ID>RE-2026-0042</ram:ID>') && c.includes('<ram:TypeCode>380</ram:TypeCode>'));
  ok('dates in 102 format', c.includes('<udt:DateTimeString format="102">20260901</udt:DateTimeString>'));
  ok('the due date too', c.includes('<udt:DateTimeString format="102">20260915</udt:DateTimeString>'));
  ok('the VAT registration under VA', c.includes('<ram:ID schemeID="VA">DE123456789</ram:ID>'));
  ok('the buyer reference', c.includes('<ram:BuyerReference>PO-778</ram:BuyerReference>'));
  ok('the seller address in schema order', /<ram:PostcodeCode>79098<\/ram:PostcodeCode>\s*<ram:LineOne>Bahnhofstraße 12<\/ram:LineOne>\s*<ram:CityName>Freiburg<\/ram:CityName>\s*<ram:CountryID>DE<\/ram:CountryID>/.test(c));
  ok('the IBAN', c.includes('<ram:IBANID>DE89370400440532013000</ram:IBANID>'));
  ok('header tax with basis and rate', /<ram:CalculatedAmount>243\.20<\/ram:CalculatedAmount>\s*<ram:TypeCode>VAT<\/ram:TypeCode>\s*<ram:BasisAmount>1280\.00<\/ram:BasisAmount>\s*<ram:CategoryCode>S<\/ram:CategoryCode>\s*<ram:RateApplicablePercent>19<\/ram:RateApplicablePercent>/.test(c));
  ok('the monetary summation', c.includes('<ram:LineTotalAmount>1280.00</ram:LineTotalAmount>') && c.includes('<ram:TaxTotalAmount currencyID="EUR">243.20</ram:TaxTotalAmount>') && c.includes('<ram:GrandTotalAmount>1523.20</ram:GrandTotalAmount>') && c.includes('<ram:DuePayableAmount>1523.20</ram:DuePayableAmount>'));
  eq('two line items', (c.match(/<ram:IncludedSupplyChainTradeLineItem>/g) || []).length, 2);
  ok('lines come before the agreement in the transaction', c.indexOf('<ram:IncludedSupplyChainTradeLineItem>') < c.indexOf('<ram:ApplicableHeaderTradeAgreement>'));
  ok('settlement is last', c.indexOf('<ram:ApplicableHeaderTradeDelivery>') < c.indexOf('<ram:ApplicableHeaderTradeSettlement>'));
  const credit = ei.einvoiceXml(draft({ kind: 'credit_note', relatedTo: 'Rechnung RE-2026-0042' }), settings(), 'cii');
  ok('a credit note references its invoice', credit.includes('<ram:InvoiceReferencedDocument>') && credit.includes('<ram:IssuerAssignedID>RE-2026-0042</ram:IssuerAssignedID>'));
  ok('as type 381', credit.includes('<ram:TypeCode>381</ram:TypeCode>'));
}

// ---------------------------------------------------------------------------------------------
// The arithmetic closes when a discount and shipping are involved
// ---------------------------------------------------------------------------------------------
{
  const d = draft({ discountAmount: 80, shippingAmount: 25 });
  const m = ei.einvoiceModel(d, settings());
  const t = d.totals;
  eq('line nets carry the apportioned discount', m.totals.sumLines, t.subtotal);
  ok('each discounted line declares an allowance', m.lines.every((l) => l.allowance > 0));
  eq('and net = base - allowance on every line', m.lines.every((l) => Math.abs(l.base - l.allowance - l.net) < 0.001), true);
  eq('shipping is a document charge', m.shipping.amount, 25);
  eq('charge total', m.totals.chargeTotal, 25);
  eq('tax exclusive = lines + charge', m.totals.taxExclusive, Math.round((m.totals.lineExtension + 25) * 100) / 100);
  eq('inclusive is the engine total', m.totals.taxInclusive, t.total);
  ok('the breakdown basis includes the shipping', Math.abs(m.breakdown.reduce((a, b) => a + b.basis, 0) - m.totals.taxExclusive) < 0.011);
  ok('the breakdown tax is the tax total', Math.abs(m.breakdown.reduce((a, b) => a + b.tax, 0) - m.totals.taxTotal) < 0.011);
  const res = ei.checkEInvoice(m);
  eq('and the check passes', res.errors, []);
  const u = ei.einvoiceXml(d, settings(), 'ubl');
  ok('the UBL carries the shipping charge', u.includes('<cbc:ChargeIndicator>true</cbc:ChargeIndicator>') && u.includes('<cbc:ChargeTotalAmount currencyID="EUR">25.00</cbc:ChargeTotalAmount>'));
  ok('and the line allowances', u.includes('<cbc:ChargeIndicator>false</cbc:ChargeIndicator>'));
}

// Part paid: prepaid and payable.
{
  const m = ei.einvoiceModel(draft({ amountPaid: 500 }), settings());
  eq('prepaid', m.totals.prepaid, 500);
  eq('payable', m.totals.payable, 1023.2);
  ok('the UBL says so', ei.einvoiceXml(draft({ amountPaid: 500 }), settings(), 'ubl').includes('<cbc:PrepaidAmount currencyID="EUR">500.00</cbc:PrepaidAmount>'));
}

// The reverse charge becomes category AE with its code and reason.
{
  const d = draft({ client: { name: 'Boulangerie du Port', street1: '1 quai', city: 'Nantes', postcode: '44000', country: 'FR', taxNumber: 'FR12345678901', email: 'x@y.example' } });
  const m = ei.einvoiceModel(d, settings());
  eq('reverse charge is AE', m.breakdown[0].id, 'AE');
  eq('at zero', m.breakdown[0].rate, 0);
  eq('with the EU code', m.breakdown[0].reasonCode, 'VATEX-EU-AE');
  ok('and the sentence', m.breakdown[0].reason.includes('196'));
  eq('no tax', m.totals.taxTotal, 0);
  eq('the check passes', ei.checkEInvoice(m).ok, true);
  const u = ei.einvoiceXml(d, settings(), 'ubl');
  ok('the UBL carries the exemption code', u.includes('<cbc:TaxExemptionReasonCode>VATEX-EU-AE</cbc:TaxExemptionReasonCode>'));
  const c = ei.einvoiceXml(d, settings(), 'cii');
  ok('the CII too', c.includes('<ram:ExemptionReasonCode>VATEX-EU-AE</ram:ExemptionReasonCode>') && c.includes('<ram:CategoryCode>AE</ram:CategoryCode>'));
}

// A small business is E with its sentence.
{
  const s = settings({ exempt: { reason: 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.' } });
  const m = ei.einvoiceModel(draft({}, s), s);
  eq('exempt is E', m.breakdown[0].id, 'E');
  ok('with the reason', m.breakdown[0].reason.includes('§ 19'));
}

// ---------------------------------------------------------------------------------------------
// The check catches what receivers reject
// ---------------------------------------------------------------------------------------------
{
  const bad = ei.checkEInvoice(ei.einvoiceModel(draft({ kind: 'quote' }), settings()));
  ok('a quote is not an e-invoice', !bad.ok && bad.errors[0].text.includes('quote'));
  const noCountry = ei.checkEInvoice(ei.einvoiceModel(draft({ client: { name: 'X', country: 'France' } }), settings()));
  ok('a spelled-out country is refused', noCountry.errors.some((e) => e.code === 'BR-11'));
  const noVat = ei.checkEInvoice(ei.einvoiceModel(draft({ sender: { name: 'T', country: 'DE', email: 'a@b.c' } }), settings()));
  ok('a missing VAT id is an error', noVat.errors.some((e) => e.code === 'BR-CO-26'));
  const xr = ei.checkEInvoice(ei.einvoiceModel(draft({ reference: '' }), settings({ einvoice: { profile: 'xrechnung' } })));
  ok('XRechnung insists on a buyer reference', xr.errors.some((e) => e.code === 'BR-DE-15'));
  const xrNoMail = ei.checkEInvoice(ei.einvoiceModel(draft({ client: { name: 'C', country: 'DE' } }), settings({ einvoice: { profile: 'xrechnung' } })));
  ok('and a buyer email', xrNoMail.errors.some((e) => e.code === 'BR-DE-3'));
  const fine = ei.checkEInvoice(ei.einvoiceModel(draft(), settings({ einvoice: { profile: 'xrechnung' } })));
  eq('a complete XRechnung passes', fine.errors, []);
  const zeroQty = ei.checkEInvoice(ei.einvoiceModel(draft({ lines: [{ description: 'X', quantity: 0, unitPrice: 10 }] }), settings()));
  ok('a zero quantity is an error', zeroQty.errors.some((e) => e.code === 'BR-22'));
  const noDue = ei.checkEInvoice(ei.einvoiceModel(draft({ due: '', terms: '' }), settings()));
  ok('no due date and no terms is an error', noDue.errors.some((e) => e.code === 'BR-CO-25'));
  const rc = ei.checkEInvoice(ei.einvoiceModel(draft({ client: { name: 'C', country: 'FR', taxNumber: 'FR 12 345 678 901' } }), settings()));
  eq('reverse charge with a VAT id passes', rc.errors, []);
  const rcShort = ei.checkEInvoice(ei.einvoiceModel(draft({ client: { name: 'C', country: 'FR', taxNumber: 'FR1' } }), settings()));
  ok('but a three-character "VAT number" is not one', rcShort.errors.some((e) => e.code === 'BR-AE-02'));
  const cn = ei.checkEInvoice(ei.einvoiceModel(draft({ kind: 'credit_note' }), settings()));
  ok('a credit note without a reference is warned about', cn.warnings.some((w) => w.code === 'BT-25'));
}

// ---------------------------------------------------------------------------------------------
// The ICC profile
// ---------------------------------------------------------------------------------------------
{
  const p = icc.sRGBProfile();
  const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
  eq('the header states the size', dv.getUint32(0), p.length);
  eq('it is a monitor profile', latin1(p.subarray(12, 16)), 'mntr');
  eq('for RGB', latin1(p.subarray(16, 20)), 'RGB ');
  eq('with an XYZ connection space', latin1(p.subarray(20, 24)), 'XYZ ');
  eq('and the magic', latin1(p.subarray(36, 40)), 'acsp');
  eq('nine tags', dv.getUint32(128), 9);
  const sigs = []; for (let i = 0; i < 9; i++) sigs.push(latin1(p.subarray(132 + i * 12, 136 + i * 12)));
  eq('the tags a matrix/TRC profile needs', sigs, ['desc', 'cprt', 'wtpt', 'rXYZ', 'gXYZ', 'bXYZ', 'rTRC', 'gTRC', 'bTRC']);
  let inBounds = true;
  for (let i = 0; i < 9; i++) { const off = dv.getUint32(136 + i * 12), size = dv.getUint32(140 + i * 12); if (off + size > p.length) inBounds = false; }
  ok('every tag lies inside the file', inBounds);
  ok('a few kilobytes', p.length > 2000 && p.length < 8000);
}

// ---------------------------------------------------------------------------------------------
// Factur-X: the PDF with the invoice inside
// ---------------------------------------------------------------------------------------------
{
  const fonts = embeddedFontsFromBytes(
    new Uint8Array(readFileSync(_resolve(ROOT, 'fonts/DejaVuSans-Regular.ttf'))),
    new Uint8Array(readFileSync(_resolve(ROOT, 'fonts/DejaVuSans-Bold.ttf'))),
  );
  const d = draft();
  const bytes = ei.facturXPdf(d, settings(), { fonts });
  const text = latin1(bytes);
  ok('a PDF 1.7', text.startsWith('%PDF-1.7'));
  ok('with a file identifier', /\/ID \[ <[0-9A-F]{32}> <[0-9A-F]{32}> \]/.test(text));
  ok('XMP metadata', text.includes('/Type /Metadata /Subtype /XML') && text.includes('<pdfaid:part>3</pdfaid:part>') && text.includes('<pdfaid:conformance>B</pdfaid:conformance>'));
  ok('the Factur-X extension schema is declared', text.includes('urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#') && text.includes('pdfaExtension:schemas'));
  ok('and names the file and level', text.includes('<fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>') && text.includes('<fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>') && text.includes('<fx:DocumentType>INVOICE</fx:DocumentType>'));
  ok('an output intent with an ICC profile', text.includes('/S /GTS_PDFA1') && text.includes('/N 3'));
  ok('the embedded file as XML', text.includes('/Type /EmbeddedFile /Subtype /text#2Fxml'));
  ok('associated as an alternative', text.includes('/AFRelationship /Alternative') && /\/AF \[ \d+ 0 R \]/.test(text));
  ok('and in the name tree', text.includes('/EmbeddedFiles << /Names [ (factur-x.xml)'));
  ok('the fonts are embedded', text.includes('/FontFile2'));
  ok('the catalogue points at the metadata', /\/Type \/Catalog \/Pages \d+ 0 R \/Metadata \d+ 0 R \/OutputIntents/.test(text));
  // The XML inside is the CII, byte for byte.
  const cii = ei.einvoiceXml(d, settings(), 'cii');
  const start = text.indexOf('/Type /EmbeddedFile');
  const streamAt = text.indexOf('stream\n', start) + 7;
  const declared = Number(/\/Length (\d+) >>/.exec(text.slice(start, streamAt))[1]);
  const embedded = Buffer.from(bytes.subarray(streamAt, streamAt + declared)).toString('utf8');
  eq('the embedded XML is the CII', embedded, cii);
  // The xref must still be exact with the extra objects.
  const xrefAt = Number(/startxref\s+(\d+)/.exec(text)[1]);
  const block = text.slice(xrefAt);
  const count = Number(/xref\s+0\s+(\d+)/.exec(block)[1]);
  const entries = block.slice(block.indexOf('\n', block.indexOf('0 ' + count)) + 1);
  let exact = true;
  for (let i = 1; i < count; i++) {
    const offset = Number(entries.slice(i * 20, i * 20 + 10));
    if (!text.slice(offset, offset + 20).startsWith(`${i} 0 obj`)) exact = false;
  }
  ok('every object is where the table says', exact);
  // Info and XMP agree on the creation instant.
  const info = /\/CreationDate \(D:(\d{14})\)/.exec(text)[1];
  const xmpDate = /<xmp:CreateDate>([^<]+)<\/xmp:CreateDate>/.exec(text)[1];
  ok('Info and XMP carry a creation date', info.length === 14 && /^\d{4}-\d{2}-\d{2}T/.test(xmpDate));
  // Credit notes say CREDITNOTE.
  const cn = latin1(ei.facturXPdf(draft({ kind: 'credit_note', relatedTo: 'Rechnung RE-2026-0042' }), settings(), { fonts }));
  ok('a credit note is typed as one', cn.includes('<fx:DocumentType>CREDITNOTE</fx:DocumentType>'));
  // Without fonts it refuses rather than producing a non-conformant file.
  let threw = false;
  try { ei.facturXPdf(d, settings(), {}); } catch { threw = true; }
  ok('a Factur-X without embedded fonts is refused', threw);
  // A plain archival PDF/A-3 has the metadata and intent but no attachment.
  const arch = latin1(ei.archivalPdf(d, settings(), { fonts }));
  ok('an archival PDF/A has metadata and an intent', arch.includes('<pdfaid:part>3</pdfaid:part>') && arch.includes('/GTS_PDFA1'));
  ok('but nothing embedded', !arch.includes('/EmbeddedFile') && !arch.includes('fx:DocumentFileName'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
