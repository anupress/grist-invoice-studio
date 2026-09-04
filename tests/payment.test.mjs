import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pay = await import(pathToFileURL(_resolve(ROOT, 'src/doc/payment.js')).href);
const ex = await import(pathToFileURL(_resolve(ROOT, 'src/money/tax/exemptions.js')).href);
const units = await import(pathToFileURL(_resolve(ROOT, 'src/doc/units.js')).href);
const f = await import(pathToFileURL(_resolve(ROOT, 'src/doc/fields.js')).href);
const text = await import(pathToFileURL(_resolve(ROOT, 'src/send/document-text.js')).href);
const email = await import(pathToFileURL(_resolve(ROOT, 'src/send/email-document.js')).href);
const { invoiceToPdf } = await import(pathToFileURL(_resolve(ROOT, 'src/export/pdf/invoice.js')).href);
const { normaliseDraft, recalc } = await import(pathToFileURL(_resolve(ROOT, 'src/model/draft.js')).href);
const store = await import(pathToFileURL(_resolve(ROOT, 'src/settings/store.js')).href);
const { simpleRate } = await import(pathToFileURL(_resolve(ROOT, 'src/money/tax/rates.js')).href);

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };
const latin1 = (bytes) => Buffer.from(bytes).toString('latin1');

// ---------------------------------------------------------------------------------------------
// IBANs
// ---------------------------------------------------------------------------------------------
eq('an IBAN is stored without spaces', pay.normaliseIban('de89 3704 0044 0532 0130 00'), 'DE89370400440532013000');
eq('and printed in fours', pay.formatIban('DE89370400440532013000'), 'DE89 3704 0044 0532 0130 00');
ok('a German IBAN looks like one', pay.looksLikeIban('DE89 3704 0044 0532 0130 00'));
ok('a French one too', pay.looksLikeIban('FR76 3000 6000 0112 3456 7890 189'));
ok('a sort code does not', !pay.looksLikeIban('01-02-03 12345678'));
ok('nor nothing', !pay.looksLikeIban(''));

// ---------------------------------------------------------------------------------------------
// The EPC payload, line by line as the standard has it
// ---------------------------------------------------------------------------------------------
const epc = pay.epcPayload({ name: 'Zakład Stolarski', iban: 'DE89 3704 0044 0532 0130 00', bic: 'COBADEFFXXX', amount: 1680, remittance: 'Invoice INV-2026-0001' });
const lines = epc.split('\n');
eq('service tag', lines[0], 'BCD');
eq('version 002', lines[1], '002');
eq('UTF-8', lines[2], '1');
eq('a SEPA credit transfer', lines[3], 'SCT');
eq('the BIC', lines[4], 'COBADEFFXXX');
eq('the beneficiary', lines[5], 'Zakład Stolarski');
eq('the IBAN without spaces', lines[6], 'DE89370400440532013000');
eq('the amount as EUR with two places', lines[7], 'EUR1680.00');
eq('no purpose', lines[8], '');
eq('no structured reference', lines[9], '');
eq('the remittance', lines[10], 'Invoice INV-2026-0001');
ok('no trailing line feed', !epc.endsWith('\n'));
eq('the BIC may be empty in version 002', pay.epcPayload({ name: 'A', iban: 'DE89370400440532013000', amount: 1 }).split('\n')[4], '');
eq('a zero amount is left blank rather than written as EUR0.00', pay.epcPayload({ name: 'A', iban: 'X', amount: 0, remittance: 'r' }).split('\n')[7], '');
ok('trailing empty elements are dropped, never a trailing line feed', pay.epcPayload({ name: 'A', iban: 'X', amount: 0 }).endsWith('X'));
eq('a long name is cut to seventy', pay.epcPayload({ name: 'x'.repeat(100), iban: 'X', amount: 1 }).split('\n')[5].length, 70);

const upi = pay.upiPayload({ vpa: 'shop@upi', name: 'Thornbury Works', amount: 1400, note: 'INV-1' });
ok('a UPI link', upi.startsWith('upi://pay?'));
ok('with the payee', upi.includes('pa=shop%40upi'));
ok('the amount', upi.includes('am=1400.00'));
ok('in rupees', upi.includes('cu=INR'));
ok('and the note', upi.includes('tn=INV-1'));

// ---------------------------------------------------------------------------------------------
// Which code a document gets
// ---------------------------------------------------------------------------------------------
const draft = (over = {}) => {
  const d = normaliseDraft({
    kind: 'invoice', number: 'INV-2026-0007', issued: '2026-08-28', due: '2026-09-27', status: 'Sent',
    currency: 'EUR', format: { currency: 'EUR' },
    sender: { name: 'Thornbury Works', country: 'DE', iban: 'DE89 3704 0044 0532 0130 00', bic: 'COBADEFFXXX' },
    client: { name: 'Harbour Lane Bakery', country: 'DE' },
    lines: [{ description: 'Site survey', quantity: 1, unitPrice: 320 }],
    ...over,
  });
  return recalc(d, { money: { currency: 'EUR', taxEnabled: true, taxRates: simpleRate({ rate: 19, name: 'MwSt' }), homeCountry: 'DE' } });
};
const fieldsOf = (d, s = {}) => f.fieldsFor(d, s);

{
  const d = draft();
  const code = pay.paymentCode(d, {}, fieldsOf(d));
  eq('a euro invoice with an IBAN gets the SEPA code', code.kind, 'epc');
  ok('it encodes', code.code.size > 20 && code.code.modules.length === code.code.size);
  ok('at level M as the standard asks', code.level === 'M');
  ok('the amount is what is owed', code.text.includes('EUR380.80'));
  ok('the remittance names the document', code.text.includes('Invoice INV-2026-0007'));
  ok('the lines print the IBAN in fours', code.lines[0] === 'IBAN DE89 3704 0044 0532 0130 00');
  ok('and the BIC', code.lines[1] === 'BIC COBADEFFXXX');
  ok('and the reference', code.lines.some((l) => l.includes('INV-2026-0007')));
  eq('the caption is in the document language', code.caption, 'Scan to pay');
  eq('German caption', pay.paymentCode({ ...d, language: 'de' }, {}, fieldsOf({ ...d, language: 'de' })).caption, 'Zum Bezahlen scannen');
}

// The standard is euro-only: a pound document with an IBAN gets nothing rather than a code that
// asks a banking app for pounds it cannot send.
{
  const d = draft({ currency: 'GBP', format: { currency: 'GBP' } });
  eq('a pound document gets no SEPA code', pay.paymentCode(d, {}, fieldsOf(d)), null);
}
{
  const d = draft({ currency: 'GBP', format: { currency: 'GBP' }, sender: { name: 'T', paymentLink: 'https://pay.example/t' } });
  const code = pay.paymentCode(d, {}, fieldsOf(d));
  eq('but a payment link serves any currency', code.kind, 'link');
  eq('encoding the URL', code.text, 'https://pay.example/t');
  eq('printed beside the code', code.lines, ['https://pay.example/t']);
  eq('under a different caption', code.caption, 'Pay online');
}
{
  const d = draft({ currency: 'INR', format: { currency: 'INR' }, sender: { name: 'T', upiId: 'shop@okaxis' } });
  eq('a rupee document with a UPI id gets UPI', pay.paymentCode(d, {}, fieldsOf(d)).kind, 'upi');
}
{
  const d = draft({ sender: { name: 'T', paymentLink: 'http://pay.example/t' } });
  eq('a plain-http link is refused', pay.paymentCode(d, {}, fieldsOf(d)), null);
}
{
  const d = draft({ kind: 'quote' });
  eq('a quote asks for no money, so no code', pay.paymentCode(d, {}, fieldsOf(d)), null);
  const r = draft({ kind: 'receipt' });
  eq('nor a receipt', pay.paymentCode(r, {}, fieldsOf(r)), null);
}
{
  const d = draft({ amountPaid: 380.8 });
  eq('a settled invoice shows no code', pay.paymentCode(d, {}, fieldsOf(d)), null);
  const part = draft({ amountPaid: 100 });
  ok('a part-paid one asks for the balance', pay.paymentCode(part, {}, fieldsOf(part)).text.includes('EUR280.80'));
}
{
  const d = draft();
  eq('the setting turns it off', pay.paymentCode(d, { showPayQr: false }, fieldsOf(d)), null);
}
// A long name and a long number still fit — the remittance gives way before the code does.
{
  const d = draft({ number: 'INVOICE-2026-000000000123-REISSUE', sender: { name: 'Gesellschaft für Handwerk und Innenausbau Nord GmbH & Co. KG', iban: 'DE89 3704 0044 0532 0130 00' } });
  const code = pay.paymentCode(d, {}, fieldsOf(d));
  ok('a long payload still yields a code', !!code);
  ok('by shortening the remittance or dropping to level L', code.text.length < 140);
}
{
  const svg = pay.qrSvg({ size: 3, modules: [[true, false, true], [false, true, false], [true, false, true]] }, 60, 'a "label" <x>');
  ok('an SVG', svg.startsWith('<svg') && svg.includes('viewBox="0 0 11 11"'));
  eq('one square per dark module', (svg.match(/h1v1h-1z/g) || []).length, 5);
  ok('with an accessible name, escaped', svg.includes('aria-label="a &quot;label&quot; &lt;x>"'));
}

// ---------------------------------------------------------------------------------------------
// The renderers carry it
// ---------------------------------------------------------------------------------------------
{
  const d = draft();
  const t = text.documentToPlainText(d, {});
  ok('the plain text prints the IBAN', t.includes('IBAN DE89 3704 0044 0532 0130 00'));
  const m = email.documentToEmailHtml(d, {});
  ok('the email prints the IBAN', m.includes('DE89 3704 0044 0532 0130 00'));
  ok('but carries no code', !m.includes('<svg'));
  const p = latin1(invoiceToPdf(d, {}));
  ok('the PDF draws the code as squares', (p.match(/ re\n/g) || []).length > 200);
  ok('with the caption', p.includes('SCAN TO PAY'));
  const none = latin1(invoiceToPdf(draft({ kind: 'quote' }), {}));
  ok('and a quote draws none', (none.match(/ re\n/g) || []).length === 0);
}

// ---------------------------------------------------------------------------------------------
// The legal line
// ---------------------------------------------------------------------------------------------
{
  const d = draft({ sender: { name: 'T', legalText: 'Registered in England no. 01234567' } });
  ok('the plain text ends with it', text.documentToPlainText(d, {}).trimEnd().endsWith('Registered in England no. 01234567'));
  ok('the email carries it', email.documentToEmailHtml(d, {}).includes('Registered in England no. 01234567'));
  ok('the PDF too', latin1(invoiceToPdf(d, {})).includes('Registered in England no. 01234567'));
  eq('a party keeps it', d.sender.legalText, 'Registered in England no. 01234567');
}

// ---------------------------------------------------------------------------------------------
// Exemptions
// ---------------------------------------------------------------------------------------------
ok('Germany cites § 19 UStG', ex.smallBusinessNote('DE').includes('§ 19 UStG'));
ok('France cites art. 293 B', ex.smallBusinessNote('fr').includes('293 B'));
ok('Poland cites art. 113', ex.smallBusinessNote('PL').includes('113'));
ok('somewhere without a sentence gets the generic one', ex.smallBusinessNote('ZZ').includes('small business'));
eq('the business’s own wording wins', ex.smallBusinessNote('DE', 'Kleinunternehmer nach § 19 UStG.'), 'Kleinunternehmer nach § 19 UStG.');
eq('no exemption is nothing', ex.exemptionFor({ exemption: '' }), null);
eq('the scheme yields the reason', ex.exemptionFor({ exemption: 'small_business', homeCountry: 'AT' }).reason.includes('Kleinunternehmerregelung'), true);

// Through the engine: a small business charges nothing and says why.
{
  const d = normaliseDraft({ kind: 'invoice', number: 'R-1', sender: { name: 'T', country: 'DE' }, client: { name: 'C', country: 'DE' }, lines: [{ description: 'Work', quantity: 1, unitPrice: 100 }] });
  const s = { money: { currency: 'EUR', taxEnabled: true, taxRates: simpleRate({ rate: 19, name: 'MwSt' }), homeCountry: 'DE' }, exempt: ex.exemptionFor({ exemption: 'small_business', homeCountry: 'DE' }) };
  const r = recalc(d, s);
  eq('no tax', r.totals.taxTotal, 0);
  ok('and the § 19 sentence on the document', r.totals.exempt.reason.includes('§ 19 UStG'));
  ok('printed in the plain text', text.documentToPlainText(r, s).includes('§ 19 UStG'));
}

// ---------------------------------------------------------------------------------------------
// The reverse charge, worked out rather than ticked
// ---------------------------------------------------------------------------------------------
{
  const s = { money: { currency: 'EUR', taxEnabled: true, taxMode: 'simple', taxRates: simpleRate({ rate: 19, name: 'MwSt' }), homeCountry: 'DE' } };
  const fr = recalc(normaliseDraft({ kind: 'invoice', sender: { name: 'T', country: 'DE' }, client: { name: 'C', country: 'FR', taxNumber: 'FR12345678901' }, lines: [{ description: 'W', quantity: 1, unitPrice: 100 }] }), s);
  eq('a French business client is reverse-charged', fr.totals.taxTotal, 0);
  ok('and told so, citing article 196', fr.totals.exempt.reason.includes('196'));
  const frDe = recalc(normaliseDraft({ kind: 'invoice', language: 'fr', sender: { name: 'T', country: 'DE' }, client: { name: 'C', country: 'FR', taxNumber: 'FR12345678901' }, lines: [{ description: 'W', quantity: 1, unitPrice: 100 }] }), s);
  ok('in the document language', frDe.totals.exempt.reason.startsWith('Autoliquidation'));
  const consumer = recalc(normaliseDraft({ kind: 'invoice', sender: { name: 'T', country: 'DE' }, client: { name: 'C', country: 'FR' }, lines: [{ description: 'W', quantity: 1, unitPrice: 100 }] }), s);
  eq('a French consumer without a VAT number is charged', consumer.totals.taxTotal, 19);
  const home = recalc(normaliseDraft({ kind: 'invoice', sender: { name: 'T', country: 'DE' }, client: { name: 'C', country: 'DE', taxNumber: 'DE123' }, lines: [{ description: 'W', quantity: 1, unitPrice: 100 }] }), s);
  eq('a domestic business is charged', home.totals.taxTotal, 19);
  const us = recalc(normaliseDraft({ kind: 'invoice', sender: { name: 'T', country: 'DE' }, client: { name: 'C', country: 'US', taxNumber: '12-3456789' }, lines: [{ description: 'W', quantity: 1, unitPrice: 100 }] }), s);
  eq('outside the EU it is not a reverse charge', us.totals.exempt, null);
  const off = recalc(normaliseDraft({ kind: 'invoice', sender: { name: 'T', country: 'DE' }, client: { name: 'C', country: 'FR', taxNumber: 'FR1' }, lines: [{ description: 'W', quantity: 1, unitPrice: 100 }] }), { money: { ...s.money, taxMode: 'none', taxEnabled: false, taxRates: [] } });
  ok('a business that charges no tax says that instead', off.totals.exempt.reason.includes('switched off'));
  const flat = recalc(normaliseDraft({ kind: 'invoice', taxAmount: 5, sender: { name: 'T', country: 'DE' }, client: { name: 'C', country: 'FR', taxNumber: 'FR1' }, lines: [{ description: 'W', quantity: 1, unitPrice: 100 }] }), s);
  eq('a typed tax figure is honoured over the rule', flat.totals.taxTotal, 5);
}

// ---------------------------------------------------------------------------------------------
// Unit codes for the e-invoice
// ---------------------------------------------------------------------------------------------
eq('hours', units.unitCode('hours'), 'HUR');
eq('an hour in German', units.unitCode('Std.'), 'HUR');
eq('pieces', units.unitCode('pcs'), 'C62');
eq('a Polish piece', units.unitCode('szt'), 'C62');
eq('kilograms', units.unitCode('kg'), 'KGM');
eq('square metres', units.unitCode('m²'), 'MTK');
eq('a day', units.unitCode('day'), 'DAY');
eq('a month', units.unitCode('Monat'), 'MON');
eq('nothing is a unit', units.unitCode(''), 'C62');
eq('the unknown is a unit', units.unitCode('widgets'), 'C62');
eq('a code typed directly passes through', units.lineUnitCode('HUR'), 'HUR');
eq('case-insensitively', units.lineUnitCode('mtk'), 'MTK');
ok('but a word is not mistaken for a code', !units.isUnitCode('hours'));

// ---------------------------------------------------------------------------------------------
// Settings survive sanitising
// ---------------------------------------------------------------------------------------------
{
  const s = store.sanitise({ business: { iban: 'de89 3704 0044 0532 0130 00', bic: ' cobadeffxxx ', paymentLink: 'https://pay.example/x', legalText: 'HRB 1' }, money: { exemption: 'small_business', exemptionText: 'own words' } });
  eq('the IBAN is normalised', s.business.iban, 'DE89370400440532013000');
  eq('the BIC too', s.business.bic, 'COBADEFFXXX');
  eq('the link survives', s.business.paymentLink, 'https://pay.example/x');
  eq('the legal line survives', s.business.legalText, 'HRB 1');
  eq('the exemption survives', [s.money.exemption, s.money.exemptionText], ['small_business', 'own words']);
  eq('the code is shown by default', s.document.showPayQr, true);
  eq('a plain-http link is dropped', store.sanitise({ business: { paymentLink: 'http://pay.example/x' } }).business.paymentLink, '');
  eq('an unknown exemption is none', store.sanitise({ money: { exemption: 'royalty' } }).money.exemption, '');
  eq('the code can be turned off', store.sanitise({ document: { showPayQr: false } }).document.showPayQr, false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
