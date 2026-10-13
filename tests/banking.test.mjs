// The bank account, by country.
//
// A UK business gives a sort code and an account number, a US one a routing number, an Indian
// one a UPI id and an IFSC, and a German one an IBAN. The form shows the boxes for the sender's
// country and the document prints those numbers in its own language. Guarded here because the
// printed account is what the money is sent to: a line that goes missing, or that prints a UK
// label on a US invoice, costs somebody a payment.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => import(pathToFileURL(_resolve(ROOT, p)).href);

const { schemeFor, bankLines, SCHEMES, ibanExample, looksLikeIban } = await load('src/doc/banking.js');
const { accountLines, normaliseIban } = await load('src/doc/payment.js');
const { normaliseParty, normaliseDraft, recalc } = await load('src/model/draft.js');
const { sanitise } = await load('src/settings/store.js');
const { settingsFrom } = await load('src/settings/runtime.js');
const { fieldsFor } = await load('src/doc/fields.js');
const { labels, LANGUAGES } = await load('src/doc/lang.js');
const { einvoiceXml } = await load('src/einvoice/index.js');

let pass = 0, fail = 0;
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };

// ---------------------------------------------------------------------------------------------
// Which scheme a country gets
// ---------------------------------------------------------------------------------------------
eq('the UK has sort codes', schemeFor('GB'), 'gb');
eq('and so do the Crown dependencies', [schemeFor('JE'), schemeFor('IM')], ['gb', 'gb']);
eq('the US has routing numbers', schemeFor('us'), 'us');
eq('India has UPI and IFSC', schemeFor('IN'), 'in');
eq('Australia has BSBs', schemeFor('AU'), 'au');
eq('Canada has transit numbers', schemeFor('CA'), 'ca');
eq('New Zealand has one long account number', schemeFor('NZ'), 'nz');
eq('Germany, France, Switzerland and the Gulf are IBAN countries', ['DE', 'FR', 'CH', 'AE', 'SA'].map(schemeFor), ['iban', 'iban', 'iban', 'iban', 'iban']);
eq('Japan, Singapore and Mexico get the generic boxes', ['JP', 'SG', 'MX'].map(schemeFor), ['generic', 'generic', 'generic']);
eq('no country at all is generic, not an error', schemeFor(''), 'generic');
ok('every scheme names its boxes', Object.values(SCHEMES).every((s) => 'code' in s && 'account' in s && 'iban' in s && 'bic' in s));
ok('only India shows the UPI box', Object.entries(SCHEMES).every(([id, s]) => s.upi === (id === 'in')));
ok('the IBAN example follows the country', ibanExample('GB').startsWith('GB') && ibanExample('FR').startsWith('FR') && looksLikeIban(ibanExample('ZZ')));

// ---------------------------------------------------------------------------------------------
// The printed lines
// ---------------------------------------------------------------------------------------------
const L = labels('en');
eq('a UK account prints sort code and account on one line',
  bankLines({ country: 'GB', bankCode: '04-00-04', accountNumber: '12345678' }, L),
  ['Sort code 04-00-04 · Account 12345678']);
eq('a US account prints the routing number',
  bankLines({ country: 'US', bankCode: '021000021', accountNumber: '000123456789', bankName: 'First Example Bank' }, L),
  ['Routing number 021000021 · Account 000123456789', 'Bank First Example Bank']);
eq('an Indian account prints the IFSC',
  bankLines({ country: 'IN', bankCode: 'HDFC0000123', accountNumber: '50100123456789' }, L),
  ['IFSC HDFC0000123 · Account 50100123456789']);
eq('an Australian account prints the BSB',
  bankLines({ country: 'AU', bankCode: '062-000', accountNumber: '12345678' }, L),
  ['BSB 062-000 · Account 12345678']);
eq('a German account prints the IBAN in groups of four, then the BIC',
  bankLines({ country: 'DE', iban: 'de02 1203 0000 0000 2020 51', bic: 'byladem1001' }, L),
  ['IBAN DE02 1203 0000 0000 2020 51', 'BIC BYLADEM1001']);
eq('a UK business with an IBAN for clients abroad prints both',
  bankLines({ country: 'GB', bankCode: '04-00-04', accountNumber: '12345678', iban: 'GB33BUKB20201555555555' }, L),
  ['Sort code 04-00-04 · Account 12345678', 'IBAN GB33 BUKB 2020 1555 5555 55']);
eq('an account number alone still prints', bankLines({ country: 'NZ', accountNumber: '12-3456-7890123-00' }, L), ['Account 12-3456-7890123-00']);
eq('nothing typed, nothing printed', bankLines({ country: 'GB' }, L), []);
ok('a malformed IBAN is not printed as one', !bankLines({ country: 'DE', iban: 'DE1' }, L).some((l) => l.startsWith('IBAN')));
eq('the labels speak the document’s language',
  bankLines({ country: 'GB', bankCode: '04-00-04', accountNumber: '12345678' }, labels('de')),
  ['Sort code 04-00-04 · Konto 12345678']);
for (const lang of LANGUAGES) {
  const l = labels(lang.id);
  ok(`${lang.id} has its account words`, ['accountNumber', 'sortCode', 'routingNumber', 'bsb', 'ifsc', 'transitNumber', 'bankCode', 'bank'].every((k) => typeof l[k] === 'string' && l[k]));
}

// ---------------------------------------------------------------------------------------------
// The block on the document
// ---------------------------------------------------------------------------------------------
function documentFor(business, currency = 'GBP') {
  const stored = sanitise({});
  Object.assign(stored.business, { name: 'ANUPRESS Works', country: 'GB' }, business);
  stored.money.currency = currency;
  const settings = settingsFrom(stored, 'invoice', null);
  const draft = normaliseDraft({
    kind: 'invoice', number: 'INV-7', issued: '2026-09-08', due: '2026-10-08',
    sender: stored.business, client: { name: 'Harbour Lane Bakery', country: 'GB' },
    lines: [{ description: 'Work', quantity: 1, unitPrice: 100 }],
  });
  recalc(draft, settings);
  return { draft, settings, fields: fieldsFor(draft, settings) };
}
{
  const { draft, settings, fields } = documentFor({ bankCode: '04-00-04', accountNumber: '12345678' });
  const block = accountLines(draft, settings, fields);
  ok('a UK invoice carries a bank transfer block', block && block.caption === 'Bank transfer');
  eq('holder, numbers, reference', block.lines, ['ANUPRESS Works', 'Sort code 04-00-04 · Account 12345678', 'Payment reference: INV-7']);
}
{
  const { draft, settings, fields } = documentFor({ accountHolder: 'A. Mustermann' });
  ok('no account typed, no block', accountLines(draft, settings, fields) === null);
}
{
  const { draft, settings, fields } = documentFor({ country: 'US', bankCode: '021000021', accountNumber: '000123456789' }, 'USD');
  const block = accountLines(draft, settings, fields);
  ok('a dollar invoice from a US business prints the routing number', block && block.lines.some((l) => l.startsWith('Routing number 021000021')));
}

// ---------------------------------------------------------------------------------------------
// The account travels: party, settings, e-invoice
// ---------------------------------------------------------------------------------------------
{
  const p = normaliseParty({ name: 'X', country: 'GB', bankCode: '04-00-04', accountNumber: '12345678', bankName: 'Example Bank' });
  eq('normaliseParty keeps the country’s numbers', [p.bankCode, p.accountNumber, p.bankName], ['04-00-04', '12345678', 'Example Bank']);
  const s = sanitise({ business: { bankCode: '  04-00-04 ', accountNumber: ' 12345678 ', bankName: 'x'.repeat(100) } });
  eq('sanitise trims and caps them', [s.business.bankCode, s.business.accountNumber, s.business.bankName.length], ['04-00-04', '12345678', 60]);
  ok('the defaults carry the boxes, empty', sanitise({}).business.accountNumber === '' && sanitise({}).business.bankCode === '');
}
{
  const { draft, settings } = documentFor({ bankCode: '04-00-04', accountNumber: '12345678' });
  const ubl = einvoiceXml(draft, settings, 'ubl');
  ok('UBL names the account where there is no IBAN', /<cbc:PaymentMeansCode>30<\/cbc:PaymentMeansCode>/.test(ubl) && /<cac:PayeeFinancialAccount>\s*<cbc:ID>04-00-04 12345678<\/cbc:ID>/.test(ubl));
  const cii = einvoiceXml(draft, settings, 'cii');
  ok('CII puts it in the proprietary slot, never in IBANID', /<ram:ProprietaryID>04-00-04 12345678<\/ram:ProprietaryID>/.test(cii) && !/<ram:IBANID>/.test(cii));
}
{
  const { draft, settings } = documentFor({ country: 'DE', iban: 'DE02120300000000202051', bic: 'BYLADEM1001' }, 'EUR');
  const ubl = einvoiceXml(draft, settings, 'ubl');
  ok('an IBAN is still the ID, and euros still mean SEPA (58)', /<cbc:PaymentMeansCode>58<\/cbc:PaymentMeansCode>/.test(ubl) && /<cbc:ID>DE02120300000000202051<\/cbc:ID>/.test(ubl));
  const cii = einvoiceXml(draft, settings, 'cii');
  ok('and CII writes IBANID with no proprietary id', /<ram:IBANID>DE02120300000000202051<\/ram:IBANID>/.test(cii) && !/ProprietaryID/.test(cii));
}
ok('normaliseIban is still reachable from payment.js', normaliseIban(' de02 ') === 'DE02');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
