import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lang = await import(pathToFileURL(_resolve(ROOT, 'src/doc/lang.js')).href);
const kinds = await import(pathToFileURL(_resolve(ROOT, 'src/doc/kinds.js')).href);
const f = await import(pathToFileURL(_resolve(ROOT, 'src/doc/fields.js')).href);
const render = await import(pathToFileURL(_resolve(ROOT, 'src/doc/render.js')).href);
const text = await import(pathToFileURL(_resolve(ROOT, 'src/send/document-text.js')).href);
const email = await import(pathToFileURL(_resolve(ROOT, 'src/send/email-document.js')).href);
const msg = await import(pathToFileURL(_resolve(ROOT, 'src/send/message.js')).href);
const { invoiceToPdf } = await import(pathToFileURL(_resolve(ROOT, 'src/export/pdf/invoice.js')).href);
const { normaliseDraft, convertDraft } = await import(pathToFileURL(_resolve(ROOT, 'src/model/draft.js')).href);
const store = await import(pathToFileURL(_resolve(ROOT, 'src/settings/store.js')).href);

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };
const latin1 = (bytes) => Buffer.from(bytes).toString('latin1');

// ---------------------------------------------------------------------------------------------
// Which language
// ---------------------------------------------------------------------------------------------
eq('a code', lang.normaliseLanguage('de'), 'de');
eq('upper case', lang.normaliseLanguage('FR'), 'fr');
eq('a locale reduces to its language', lang.normaliseLanguage('pt-BR'), 'pt');
eq('and an underscore one', lang.normaliseLanguage('de_AT'), 'de');
eq('a name somebody typed', lang.normaliseLanguage('German'), 'de');
eq('in its own language', lang.normaliseLanguage('Deutsch'), 'de');
eq('Flemish is Dutch', lang.normaliseLanguage('Vlaams'), 'nl');
eq('nonsense is nothing', lang.normaliseLanguage('Klingon'), '');
eq('empty is nothing', lang.normaliseLanguage(''), '');

const d = (over = {}) => normaliseDraft({
  kind: 'invoice', number: 'INV-2026-0007', issued: '2026-08-28', due: '2026-09-27', status: 'Sent',
  sender: { name: 'Thornbury Works', taxNumber: 'GB1' }, client: { name: 'Harbour Lane Bakery' },
  lines: [{ description: 'Site survey', quantity: 1, unitPrice: 320 }],
  totals: { subtotal: 320, taxTotal: 64, total: 384, amountPaid: 0, balance: 384, taxLines: [{ name: 'VAT', rate: 20, amount: 64 }], discounts: [], shipping: { amount: 0 } },
  ...over,
});

// The order: the document's own choice, then the client's, then the business default, then English.
eq('English by default', lang.languageOf(d(), {}), 'en');
eq('the business default applies', lang.languageOf(d(), { language: 'de' }), 'de');
eq('the client outranks it', lang.languageOf(d({ client: { name: 'X', language: 'fr' } }), { language: 'de' }), 'fr');
eq('the document outranks them both', lang.languageOf(d({ language: 'pl', client: { name: 'X', language: 'fr' } }), { language: 'de' }), 'pl');
eq('an unknown client language is skipped, not honoured', lang.languageOf(d({ client: { name: 'X', language: 'Martian' } }), { language: 'it' }), 'it');

// ---------------------------------------------------------------------------------------------
// The dictionary is complete for every language, key for key
// ---------------------------------------------------------------------------------------------
const en = lang.labels('en');
for (const l of lang.LANGUAGES) {
  const L = lang.labels(l.id);
  for (const key of Object.keys(en)) {
    if (typeof en[key] === 'string') ok(`${l.id} has ${key}`, typeof L[key] === 'string' && L[key].length > 0);
    else for (const sub of Object.keys(en[key])) ok(`${l.id} has ${key}.${sub}`, typeof L[key][sub] === 'string' && L[key][sub].length > 0);
  }
  // Every kind has a word, and a legend where English has one.
  for (const k of kinds.DOCUMENT_KINDS) {
    const lk = lang.localiseKind(k, l.id);
    ok(`${l.id}: ${k.id} has a word`, lk.word.length > 0);
    eq(`${l.id}: ${k.id} keeps its behaviour`, [lk.showsMoney, lk.lineMode, lk.demandsPayment], [k.showsMoney, k.lineMode, k.demandsPayment]);
    eq(`${l.id}: ${k.id} keeps a second date only where English has one`, !!lk.dateLabels.second, !!k.dateLabels.second);
    eq(`${l.id}: ${k.id} keeps a legend only where English has one`, !!lk.legend, !!k.legend);
  }
}
eq('English is itself', lang.localiseKind(kinds.documentKind('invoice'), 'en').word, 'Invoice');
eq('German', lang.localiseKind(kinds.documentKind('invoice'), 'de').word, 'Rechnung');
eq('a French quote', lang.localiseKind(kinds.documentKind('quote'), 'fr').word, 'Devis');
eq('a Polish credit note', lang.localiseKind(kinds.documentKind('credit_note'), 'pl').word, 'Faktura korygująca');
eq('a Dutch delivery note', lang.localiseKind(kinds.documentKind('delivery_note'), 'nl').word, 'Pakbon');
eq('an unknown language is English', lang.localiseKind(kinds.documentKind('invoice'), 'xx').word, 'Invoice');

// A stored label counts only when somebody changed it from the English default.
eq('an untouched default yields the translation', lang.labelOr('Tax ID', 'Tax ID', 'USt-IdNr.'), 'USt-IdNr.');
eq('a changed one is kept', lang.labelOr('VAT No.', 'Tax ID', 'USt-IdNr.'), 'VAT No.');
eq('an empty one yields the translation', lang.labelOr('', 'Tax ID', 'USt-IdNr.'), 'USt-IdNr.');

eq('a standard status is translated', lang.localiseStatus('Paid', 'de'), 'Bezahlt');
eq('whatever its case', lang.localiseStatus('part paid', 'fr'), 'Partiellement payée');
eq('a custom status stays as typed', lang.localiseStatus('Awaiting sign-off', 'de'), 'Awaiting sign-off');

// ---------------------------------------------------------------------------------------------
// Dates in the language
// ---------------------------------------------------------------------------------------------
eq('English is unchanged', render.docDate('2026-08-28'), '28 Aug 2026');
eq('and explicitly so', render.docDate('2026-08-28', 'en'), '28 Aug 2026');
ok('German writes the month its own way', /28\. Aug\.? 2026/.test(render.docDate('2026-08-28', 'de')));
ok('French', /28 août 2026/.test(render.docDate('2026-08-28', 'fr')));
ok('Polish', /28 sie 2026/.test(render.docDate('2026-08-28', 'pl')));
ok('an epoch too', /28 août 2026/.test(render.docDate(Date.parse('2026-08-28T00:00:00Z') / 1000, 'fr')));
eq('nothing is still a dash', render.docDate('', 'de'), '—');

// ---------------------------------------------------------------------------------------------
// The renderers all read the same words
// ---------------------------------------------------------------------------------------------
const german = d({ language: 'de', client: { name: 'Beispiel GmbH', country: 'DE' } });
const fields = f.fieldsFor(german, {});
eq('the fields carry the language', fields.lang, 'de');
eq('and the localised kind', fields.kind.word, 'Rechnung');
eq('the columns are German', f.lineColumns(fields).map((c) => c.label), ['Beschreibung', 'Menge', 'Einzelpreis', 'Betrag']);

// The on-screen document needs a DOM, which Node has not got; the email body is built from the
// same fields and is a string, so it stands in for it here. The browser check covers the screen.
const html = email.documentToEmailHtml(german, {});
ok('the document says Rechnung', html.includes('Rechnung'));
ok('and Rechnungsempfänger', html.includes('Rechnungsempfänger'));
ok('and Fälliger Betrag', html.includes('Fälliger Betrag'));
ok('and the German date', /28\. Aug\.? 2026/.test(html));
ok('the status is translated', html.includes('Gesendet'));
ok('nothing English remains in the labels', !html.includes('Bill to') && !html.includes('Subtotal') && !html.includes('>Invoice<'));

const plain = text.documentToPlainText(german, {});
ok('the plain text says RECHNUNG', plain.startsWith('RECHNUNG INV-2026-0007'));
ok('with a German subtotal', plain.includes('Zwischensumme'));

const pdf = latin1(invoiceToPdf(german, {}));
ok('the PDF says RECHNUNG', pdf.includes('RECHNUNG'));
ok('and Zwischensumme', pdf.includes('Zwischensumme'));
// ü is Latin-1, so a German document still needs no embedded font.
ok('and needs no embedded font for it', !pdf.includes('/FontFile2'));

// A quote in French carries the French legend; a statement in Italian its own words.
ok('a French quote says it is not a request for payment, in French',
  f.fieldsFor(d({ kind: 'quote', language: 'fr' }), {}).legend.includes('non une demande de paiement'));
ok('an Italian statement heads its columns in Italian',
  f.lineColumns(f.fieldsFor(d({ kind: 'statement', language: 'it' }), {})).map((c) => c.label).includes('Saldo'));

// The message placeholders follow the document's language.
const m = msg.buildMessage('invoice_sent', german, {}, { now: new Date('2026-08-28T09:00:00Z') });
ok('{kind} is Rechnung', m.subject.includes('Rechnung INV-2026-0007'));
ok('and the due date is German', /27\. Sept?\.? 2026/.test(m.body));

// The English document is byte-for-byte what it was: same labels, same dates.
const english = email.documentToEmailHtml(d(), {});
ok('English still says Invoice', english.includes('>Invoice<') && english.includes('Bill to') && english.includes('28 Aug 2026'));

// ---------------------------------------------------------------------------------------------
// The document a credit note refers to
// ---------------------------------------------------------------------------------------------
const inv = d({ rowId: 3, status: 'Sent' });
const credit = convertDraft(inv, 'credit_note', { relatedTo: 'Invoice INV-2026-0007' });
eq('the credit note names the invoice', credit.relatedTo, 'Invoice INV-2026-0007');
eq('and has no number of its own yet', credit.number, '');
const cf = f.fieldsFor(credit, {});
eq('so the reference is shown', cf.showRelated, true);
ok('and the legend names it', cf.legend.includes('INV-2026-0007'));
ok('in German too', f.fieldsFor({ ...credit, language: 'de' }, {}).legend.includes('INV-2026-0007'));
ok('on the document', email.documentToEmailHtml(credit, {}).includes('Refers to') && text.documentToPlainText(credit, {}).includes('Refers to: Invoice INV-2026-0007'));
eq('a plain conversion carries nothing', convertDraft(inv, 'receipt').relatedTo, '');
eq('a credit note without one keeps the general legend', f.fieldsFor(d({ kind: 'credit_note' }), {}).legend, kinds.documentKind('credit_note').legend);

// ---------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------
eq('the default language is English', store.sanitise({}).document.language, 'en');
eq('a stored language survives', store.sanitise({ document: { language: 'pl' } }).document.language, 'pl');
eq('a stored name is normalised', store.sanitise({ document: { language: 'Deutsch' } }).document.language, 'de');
eq('nonsense falls back to English', store.sanitise({ document: { language: 'xx' } }).document.language, 'en');
eq('PDF fonts default to auto', store.sanitise({}).document.pdfFont, 'auto');
eq('and accept embed', store.sanitise({ document: { pdfFont: 'embed' } }).document.pdfFont, 'embed');
eq('and nothing else', store.sanitise({ document: { pdfFont: 'comic' } }).document.pdfFont, 'auto');
eq('issued documents lock by default', store.sanitise({}).document.lockIssued, true);
eq('and can be left editable', store.sanitise({ document: { lockIssued: false } }).document.lockIssued, false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
