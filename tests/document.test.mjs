import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const kinds = await import(pathToFileURL(_resolve(ROOT, 'src/doc/kinds.js')).href);
const f = await import(pathToFileURL(_resolve(ROOT, 'src/doc/fields.js')).href);
const draftMod = await import(pathToFileURL(_resolve(ROOT, 'src/model/draft.js')).href);

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

const cols = (fields) => f.lineColumns(fields).map((c) => c.id);

const baseDraft = (over = {}) => draftMod.normaliseDraft({
  kind: 'invoice',
  number: 'INV-2026-0001',
  issued: '2026-08-01',
  due: '2026-08-31',
  sender: { name: 'Thornbury Works', country: 'GB', taxNumber: 'GB 481 2739 55' },
  client: { name: 'Harbour Lane Bakery', country: 'GB' },
  lines: [{ description: 'Site survey', quantity: 1, unitPrice: 320 }],
  totals: { subtotal: 320, taxTotal: 64, total: 384, amountPaid: 0, balance: 384, taxLines: [{ name: 'VAT', rate: 20, amount: 64 }], discounts: [] },
  ...over,
});

// ---------------------------------------------------------------------------------------------
// Kinds are behaviour, not headings
// ---------------------------------------------------------------------------------------------
eq('an unknown kind falls back to the invoice', kinds.documentKind('nonsense').id, 'invoice');
eq('the invoice demands payment', kinds.documentKind('invoice').demandsPayment, true);
// A quote that reads like an invoice gets paid by accident and then argued about.
eq('a quote does not', kinds.documentKind('quote').demandsPayment, false);
eq('and its second date is an expiry, not a due date', kinds.documentKind('quote').dateLabels.second, 'Valid until');
eq('a receipt’s second date is when it was paid', kinds.documentKind('receipt').dateLabels.second, 'Paid');
eq('a credit note has no second date at all', kinds.documentKind('credit_note').dateLabels.second, null);

// The one that is a real behavioural difference rather than wording.
eq('a delivery note shows no money', kinds.documentKind('delivery_note').showsMoney, false);
eq('nor does a packing slip', kinds.documentKind('packing_slip').showsMoney, false);
eq('an invoice does', kinds.documentKind('invoice').showsMoney, true);

eq('a statement lists documents, not items', kinds.documentKind('statement').lineMode, 'documents');
eq('a delivery note lists quantities', kinds.documentKind('delivery_note').lineMode, 'quantities');

eq('a quote becomes an invoice', kinds.conversionsFor('quote').map((k) => k.id), ['invoice', 'proforma']);
eq('an invoice becomes a receipt or a credit note', kinds.conversionsFor('invoice').map((k) => k.id), ['receipt', 'credit_note']);
eq('a receipt becomes nothing', kinds.conversionsFor('receipt'), []);

// A paid document shows the payment only where a balance means something. A receipt for £384
// paid in full used to show "Paid −£384" and then "Amount paid £0.00".
{
  const paidTotals = { subtotal: 320, taxTotal: 64, total: 384, amountPaid: 384, balance: 0, taxLines: [{ name: 'VAT', rate: 20, amount: 64 }], discounts: [] };
  eq('an invoice with money on it shows the payment and the balance', f.fieldsFor(baseDraft({ totals: paidTotals }), {}).showPaid, true);
  eq('a receipt does not — its total is what was paid', f.fieldsFor(baseDraft({ kind: 'receipt', totals: paidTotals }), {}).showPaid, false);
  eq('nor a credit note', f.fieldsFor(baseDraft({ kind: 'credit_note', totals: paidTotals }), {}).showPaid, false);
  eq('nor a quote', f.fieldsFor(baseDraft({ kind: 'quote', totals: paidTotals }), {}).showPaid, false);
}

// Every kind has to be complete, or the renderer prints undefined at the top of a document.
for (const k of kinds.DOCUMENT_KINDS) {
  ok(`${k.id} has a word`, typeof k.word === 'string' && k.word.length > 0);
  ok(`${k.id} has a line mode`, ['items', 'quantities', 'documents'].includes(k.lineMode));
  ok(`${k.id} has an issued label`, typeof k.dateLabels.issued === 'string');
  ok(`${k.id} has a total label or shows no money`, k.showsMoney ? k.totalLabel !== undefined : true);
}

// ---------------------------------------------------------------------------------------------
// Fields, mostly derived
// ---------------------------------------------------------------------------------------------
const invoiceFields = f.fieldsFor(baseDraft(), {});
eq('an invoice shows the money columns', cols(invoiceFields), ['description', 'quantity', 'unitPrice', 'amount']);
eq('and its totals', invoiceFields.showTotals, true);
eq('and a due date', invoiceFields.showSecondDate, true);

const deliveryFields = f.fieldsFor(baseDraft({ kind: 'delivery_note' }), {});
// The point of a delivery note: it goes in the box, and the person unpacking it is not the person
// who agreed the price.
eq('a delivery note has no price columns', cols(deliveryFields), ['description', 'quantity']);
eq('and no totals block at all', deliveryFields.showTotals, false);
eq('and no tax', deliveryFields.showTax, false);

const statementFields = f.fieldsFor(baseDraft({ kind: 'statement' }), {});
eq('a statement lists documents with a running balance',
  cols(statementFields), ['description', 'date', 'reference', 'charge', 'paid', 'balance']);

// HSN appears when the data has codes...
const withHsn = f.fieldsFor(baseDraft({ lines: [{ description: 'Ducting', quantity: 1, unitPrice: 100, hsn: '7306' }] }), {});
ok('an HSN column when the lines carry codes', cols(withHsn).includes('hsn'));
// ...and also when the regime requires them but the data has none, because THAT is the problem.
const indiaNoHsn = f.fieldsFor(baseDraft(), { money: { taxPreset: 'in-gst' } });
ok('and when Indian GST is in use but the codes are missing', cols(indiaNoHsn).includes('hsn'));
eq('flagged as missing so the UI can say so', indiaNoHsn.hsnMissing, true);
eq('a UK invoice has no HSN column', cols(invoiceFields).includes('hsn'), false);

// A discount column only earns its width when something is discounted.
eq('no discount column by default', cols(invoiceFields).includes('discount'), false);
ok('but one when a line is discounted',
  cols(f.fieldsFor(baseDraft({ lines: [{ description: 'X', quantity: 1, unitPrice: 100, discountAmount: 10 }] }), {})).includes('discount'));

// Tax numbers appear when tax is being charged, or when the reason none is charged is the client's.
ok('the sender’s tax number when charging tax', invoiceFields.showSenderTaxNumber);
const noTax = f.fieldsFor(baseDraft({ totals: { subtotal: 320, taxTotal: 0, total: 320, amountPaid: 0, balance: 320, taxLines: [] } }), {});
eq('and not when no tax is involved at all', noTax.showSenderTaxNumber, false);
const reverse = f.fieldsFor(baseDraft({
  client: { name: 'Beispiel GmbH', country: 'DE', taxNumber: 'DE123456789' },
  totals: { subtotal: 320, taxTotal: 0, total: 320, amountPaid: 0, balance: 320, taxLines: [], exempt: { reason: 'Reverse charge' } },
}), {});
ok('the client’s tax number is required on a reverse-charged invoice', reverse.showClientTaxNumber);

// Payment details belong on documents that ask for money, and nowhere else — printing bank details
// on a receipt invites a second payment.
ok('how to pay, on an invoice', f.fieldsFor(baseDraft(), { paymentDetails: 'Acc 1234' }).showPaymentDetails);
eq('but not on a receipt', f.fieldsFor(baseDraft({ kind: 'receipt' }), { paymentDetails: 'Acc 1234' }).showPaymentDetails, false);
eq('nor on a credit note', f.fieldsFor(baseDraft({ kind: 'credit_note' }), { paymentDetails: 'Acc 1234' }).showPaymentDetails, false);

// An explicit override always wins.
eq('an override can force a field on', f.fieldsFor(baseDraft(), {}, { showSignature: true }).showSignature, true);
eq('and off', f.fieldsFor(baseDraft(), {}, { showTotals: false }).showTotals, false);

// ---------------------------------------------------------------------------------------------
// The format object describes HOW money is written, not WHICH currency
// ---------------------------------------------------------------------------------------------
// A stored format that also carried a currency shadowed the real one when spread, so changing the
// currency setting visibly did nothing to the symbol on the document. Two copies of one fact will
// always eventually disagree; there is now only one.
const money = await import(pathToFileURL(_resolve(ROOT, 'src/money/currency.js')).href);
const fmtKeys = Object.keys(money.DEFAULT_FORMAT).filter((k) => k !== 'currency');
eq('a format is separators and position', fmtKeys.sort(), ['decimalSeparator', 'decimals', 'position', 'thousandSeparator']);
eq('changing only the currency changes only the symbol',
  [money.formatMoney(1234.5, { currency: 'GBP', position: 'left' }), money.formatMoney(1234.5, { currency: 'EUR', position: 'left' })],
  ['£1,234.50', '€1,234.50']);

// ---------------------------------------------------------------------------------------------
// Dates on a document
// ---------------------------------------------------------------------------------------------
const render = await import(pathToFileURL(_resolve(ROOT, 'src/doc/render.js')).href);

eq('a day string', render.docDate('2026-08-27'), '27 Aug 2026');
eq('with a time on it', render.docDate('2026-08-27T14:00:00Z'), '27 Aug 2026');
eq('nothing', render.docDate(''), '—');
eq('null', render.docDate(null), '—');

// Grist stores dates as epoch SECONDS. The provider normally converts on read — but any path that
// reaches the renderer without that conversion would otherwise print the raw number on the face of
// an invoice, which is what happened the first time a document was saved and read straight back.
eq('a raw epoch in seconds', render.docDate(Date.parse('2026-08-27T00:00:00Z') / 1000), '27 Aug 2026');
eq('a raw epoch in milliseconds', render.docDate(Date.parse('2026-08-27T00:00:00Z')), '27 Aug 2026');
eq('an epoch as a string', render.docDate(String(Date.parse('2026-08-27T00:00:00Z') / 1000)), '27 Aug 2026');
// Read in UTC, or a date west of Greenwich renders as the day before the one that was typed.
eq('the very start of a year does not slip back a day', render.docDate('2026-01-01'), '1 Jan 2026');
eq('anything else is passed through rather than mangled', render.docDate('on completion'), 'on completion');

// ---------------------------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------------------------
const blank = draftMod.emptyDraft('invoice', { sender: { name: 'Thornbury Works' }, money: { currency: 'GBP' } });
eq('a blank draft is an invoice', blank.kind, 'invoice');
eq('dated today', blank.issued, new Date().toISOString().slice(0, 10));
eq('starting as a draft', blank.status, 'Draft');
eq('already knowing who is sending it', blank.sender.name, 'Thornbury Works');
eq('with one empty line to type into', blank.lines.length, 1);

const messy = draftMod.normaliseDraft({ kind: 'bogus', layout: 'bogus', lines: [{ quantity: '3', unitPrice: '10.50' }] });
eq('a bad kind falls back', messy.kind, 'invoice');
eq('a bad layout falls back', messy.layout, 'classic');
eq('numeric strings become numbers', messy.lines[0].amount, 31.5);
eq('and every party field exists', typeof messy.client.email, 'string');
eq('with totals rather than undefined', messy.totals.total, 0);

const stored = draftMod.normaliseDraft({ lines: [{ quantity: 3, unitPrice: 10, amount: 25 }] });
eq('a stored line amount wins over the multiplication', stored.lines[0].amount, 25);

// Converting keeps the work and drops what belonged to the old document.
const quote = draftMod.normaliseDraft({ kind: 'quote', number: 'QUO-0007', rowId: 4, status: 'Sent', lines: [{ description: 'Survey', quantity: 1, unitPrice: 320 }] });
const converted = draftMod.convertDraft(quote, 'invoice');
eq('a quote converts to an invoice', converted.kind, 'invoice');
eq('keeping its lines', converted.lines[0].description, 'Survey');
// A number belongs to the document it was issued against, and one is never reused — see
// money/numbering.js. The invoice gets its own from the invoice sequence, on save.
eq('but not its number', converted.number, '');
eq('nor its row', converted.rowId, null);
eq('and it starts as a draft again', converted.status, 'Draft');

// ---------------------------------------------------------------------------------------------
// Line images. The rule that matters most: a document without pictures is EXACTLY the document
// it was before pictures existed.
// ---------------------------------------------------------------------------------------------
{
  const render = await import(pathToFileURL(_resolve(ROOT, 'src/doc/render.js')).href);
  const plain = draftMod.normaliseDraft({ kind: 'invoice', lines: [{ description: 'Work', quantity: 1, unitPrice: 10 }] });
  eq('no images means no image column', f.fieldsFor(plain, {}).showImages, false);
  const pictured = draftMod.normaliseDraft({ kind: 'invoice', lines: [
    { description: 'Mug', quantity: 1, unitPrice: 10, image: 'data:image/png;base64,AAAA' },
    { description: 'Bag', quantity: 1, unitPrice: 10 },
  ] });
  eq('one picture is enough to earn the column', f.fieldsFor(pictured, {}).showImages, true);
  eq('the raw cell survives normalisation', pictured.lines[0].image, 'data:image/png;base64,AAAA');

  // What an <img> may be given.
  eq('an https URL is trusted', render.imageSrc('https://example.com/a.jpg'), 'https://example.com/a.jpg');
  eq('a data URI is trusted', render.imageSrc('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
  eq('plain http is not — it would mix content', render.imageSrc('http://example.com/a.jpg'), null);
  eq('javascript: certainly is not', render.imageSrc('javascript:alert(1)'), null);
  // An Attachments cell holds ids, and ids mean nothing without the resolver main.js provides.
  eq('an attachment cell without a resolver is nothing', render.imageSrc(['L', 7]), null);
  eq('with one, the id is traded for a URL', render.imageSrc(['L', 7], (id) => 'url-for-' + id), 'url-for-7');
  eq('a bare id works the same way', render.imageSrc(7, (id) => 'url-for-' + id), 'url-for-7');
  eq('emptiness is nothing, not a crash', render.imageSrc(null), null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
