import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fonts = await import(pathToFileURL(_resolve(ROOT, 'src/export/pdf/fonts.js')).href);
const { PdfWriter, rgb } = await import(pathToFileURL(_resolve(ROOT, 'src/export/pdf/writer.js')).href);
const { invoiceToPdf } = await import(pathToFileURL(_resolve(ROOT, 'src/export/pdf/invoice.js')).href);
const { normaliseDraft } = await import(pathToFileURL(_resolve(ROOT, 'src/model/draft.js')).href);

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };
const near = (n, got, want, tol) => { if (Math.abs(got - want) <= tol) pass++; else { fail++; console.log(`  FAIL ${n}\n    got ${got}, want ~${want}`); } };

const latin1 = (bytes) => Buffer.from(bytes).toString('latin1');

// ---------------------------------------------------------------------------------------------
// Metrics. A right-aligned total is right-aligned only if the width was measured correctly.
// ---------------------------------------------------------------------------------------------
near('a space at 10pt', fonts.measure(' ', 10), 2.78, 0.01);
near('"Total" at 10pt', fonts.measure('Total', 10), 22.23, 0.01);   // T611+o556+t278+a556+l222
near('bold is wider', fonts.measure('Total', 10, true), 23.89, 0.01);   // T611+o611+t333+a556+l278
ok('bold really is wider than regular', fonts.measure('Invoice', 10, true) > fonts.measure('Invoice', 10));
// Digits are all one width in Helvetica, which is why a column of figures lines up at all.
eq('every digit is the same width', new Set('0123456789'.split('').map((d) => fonts.measure(d, 10))).size, 1);
near('a ten-digit figure', fonts.measure('1234567890', 10), 55.6, 0.01);
eq('nothing measures nothing', fonts.measure('', 10), 0);
near('scaling is linear', fonts.measure('Total', 20), fonts.measure('Total', 10) * 2, 0.001);

// ---------------------------------------------------------------------------------------------
// The alphabet the standard fonts can actually write
// ---------------------------------------------------------------------------------------------
eq('plain text is untouched', fonts.ascii('Invoice INV-2026-0001'), 'Invoice INV-2026-0001');
// Our own templates are full of typographic characters; replacing them is invisible.
eq('curly quotes become straight', fonts.ascii('client’s “quote”'), "client's \"quote\"");
eq('an em dash becomes a hyphen', fonts.ascii('a — b'), 'a - b');
eq('an ellipsis is spelled out', fonts.ascii('wait…'), 'wait...');
// Latin-1 letters ARE in WinAnsi, so an accented name survives intact.
eq('accented names survive', fonts.ascii('Müller & Frère'), 'Müller & Frère');
eq('so do the currency symbols the fonts have', fonts.ascii('£1,234 €5 ¥6'), '£1,234 €5 ¥6');

// The real limitation of standard fonts, handled rather than hidden: a rupee sign cannot be drawn,
// and an invoice with a hole where the amount should be is far worse than one that reads "Rs."
eq('a rupee sign is transliterated, not lost', fonts.ascii('₹1,400.00'), 'Rs.1,400.00');
eq('and a taka', fonts.ascii('৳500'), 'Tk.500');
// Anything genuinely unrepresentable becomes a visible question mark rather than nothing at all.
eq('an unwritable script is visible as missing', fonts.ascii('請'), '?');
ok('a rupee amount still measures sensibly', fonts.measure('₹1,400.00', 10) > 0);

// Wrapping
eq('short text is one line', fonts.wrap('Site survey', 200, 10), ['Site survey']);
ok('long text wraps', fonts.wrap('Extraction ductwork, supply and fit throughout the premises', 100, 10).length > 1);
eq('newlines are respected', fonts.wrap('a\nb', 200, 10), ['a', 'b']);
// A URL or an account number has no spaces to break on and would otherwise run off the page.
ok('an unbreakable word is hard-broken', fonts.wrap('x'.repeat(200), 60, 10).length > 1);
ok('and every piece fits', fonts.wrap('x'.repeat(200), 60, 10).every((l) => fonts.measure(l, 10) <= 60));

eq('a hex colour', rgb('#ffffff'), [1, 1, 1]);
eq('shorthand hex', rgb('#000'), [0, 0, 0]);
eq('nonsense is black', rgb('nope'), [0, 0, 0]);

// ---------------------------------------------------------------------------------------------
// The file itself
// ---------------------------------------------------------------------------------------------
const draft = normaliseDraft({
  kind: 'invoice', number: 'INV-2026-0001', issued: '2026-07-20', due: '2026-08-19', status: 'Sent',
  currency: 'GBP', format: { currency: 'GBP' }, terms: 'Net 30',
  note: 'Thanks for a straightforward job — the new oven went in ahead of schedule.',
  sender: { name: 'Thornbury Works', country: 'GB', email: 'accounts@thornburyworks.example', taxNumber: 'GB 481 2739 55', website: 'thornburyworks.example' },
  client: { name: 'Harbour Lane Bakery (Ltd)', street1: '12 Harbour Lane', city: 'Bristol', postcode: 'BS1 4QA', country: 'GB' },
  lines: [
    { description: 'Site survey and measurement', quantity: 1, unitPrice: 320 },
    { description: 'Extraction ductwork, supply and fit', quantity: 6, unitPrice: 145 },
    { description: 'Electrical certification', quantity: 1, unitPrice: 210 },
  ],
  totals: {
    subtotal: 1400, taxTotal: 280, total: 1680, amountPaid: 0, balance: 1680,
    taxLines: [{ name: 'VAT', rate: 20, amount: 280 }], discounts: [], shipping: { amount: 0 },
  },
});

const bytes = invoiceToPdf(draft, { paymentDetails: 'Acc 12345678, sort 01-02-03', accent: '#14509b' });
const text = latin1(bytes);

ok('it is a PDF', text.startsWith('%PDF-1.4'));
ok('and it ends properly', text.trimEnd().endsWith('%%EOF'));
// The binary comment is what stops a well-meaning transfer program treating it as text and
// "helpfully" converting the line endings, which corrupts every byte offset in the file.
eq('with the binary marker', [...bytes.slice(10, 14)], [0xE2, 0xE3, 0xCF, 0xD3]);
ok('it is a sensible size', bytes.length > 2000 && bytes.length < 60000);

// ---- the cross-reference table, which is what a viewer reads first --------------------------
const xrefAt = Number(/startxref\s+(\d+)/.exec(text)[1]);
ok('startxref points inside the file', xrefAt > 0 && xrefAt < bytes.length);
ok('and lands on the xref keyword', text.slice(xrefAt, xrefAt + 4) === 'xref');

const xrefBlock = text.slice(xrefAt);
const [, countStr] = /xref\s+0\s+(\d+)/.exec(xrefBlock);
const objectCount = Number(countStr);
ok('there are objects', objectCount > 5);

const entries = xrefBlock.slice(xrefBlock.indexOf('\n', xrefBlock.indexOf('0 ' + objectCount)) + 1);
// Every entry is exactly twenty bytes. A viewer that counts nineteen rejects the whole document,
// and this is the single easiest thing to get wrong when writing a PDF by hand.
for (let i = 0; i < objectCount; i++) {
  const entry = entries.slice(i * 20, i * 20 + 20);
  ok(`entry ${i} is twenty bytes`, entry.length === 20);
  // Ten digits, a space, five digits, a space, the type letter, a space, then the line ending —
  // twenty bytes exactly. JS's `$` does not match before a trailing newline, so it is matched.
  ok(`entry ${i} is well formed`, /^\d{10} \d{5} [nf] \n$/.test(entry));
}

// Every offset must actually point at the object it claims. A file whose xref is out by even one
// byte opens as blank in some viewers and not at all in others.
for (let i = 1; i < objectCount; i++) {
  const offset = Number(entries.slice(i * 20, i * 20 + 10));
  const at = text.slice(offset, offset + 20);
  ok(`object ${i} is where the table says`, at.startsWith(`${i} 0 obj`));
}

// ---- content streams -------------------------------------------------------------------------
// A wrong /Length is the classic reason a hand-written PDF opens blank.
const streams = [...text.matchAll(/<< \/Length (\d+) >>\nstream\n/g)];
ok('there is at least one content stream', streams.length >= 1);
for (const m of streams) {
  const declared = Number(m[1]);
  const start = m.index + m[0].length;
  const end = text.indexOf('\nendstream', start);
  eq('the declared stream length is the real one', end - start, declared);
}

ok('the catalogue points at the page tree', /\/Type \/Catalog \/Pages 2 0 R/.test(text));
ok('the trailer names the root', /\/Root 1 0 R/.test(text));
ok('fonts are the standard ones, so nothing is embedded', /\/BaseFont \/Helvetica /.test(text));
ok('encoded for Latin text', /\/Encoding \/WinAnsiEncoding/.test(text));
ok('A4 by default', /\/MediaBox \[ 0 0 595.28 841.89 \]/.test(text));

// ---- what it actually says ----------------------------------------------------------------------
ok('the business name is on it', text.includes('Thornbury Works'));
ok('the document kind', text.includes('INVOICE'));
ok('the number', text.includes('INV-2026-0001'));
ok('the client', text.includes('Harbour Lane Bakery'));
ok('a line item', text.includes('Site survey and measurement'));
ok('the tax line names its rate', text.includes('VAT 20%'));
ok('the payment details', text.includes('Acc 12345678'));
// Brackets in a client's name end a PDF string early unless escaped, producing a file no viewer
// can open at all.
ok('brackets in a name are escaped', text.includes('Harbour Lane Bakery \\(Ltd\\)'));

// ---- kinds behave the same as they do on screen -----------------------------------------------
const deliveryNote = invoiceToPdf(normaliseDraft({ ...draft, kind: 'delivery_note' }), {});
const dnText = latin1(deliveryNote);
ok('a delivery note says what it is', dnText.includes('DELIVERY NOTE'));
ok('and lists the goods', dnText.includes('Site survey and measurement'));
// The whole point of a delivery note: it travels in the box, and the person unpacking it is not the
// person who agreed the price.
ok('and carries no prices at all', !dnText.includes('320.00') && !dnText.includes('1,680.00'));
ok('nor a total', !dnText.includes('Subtotal'));

const quote = latin1(invoiceToPdf(normaliseDraft({ ...draft, kind: 'quote' }), {}));
ok('a quote says it is a quote', quote.includes('QUOTE'));
ok('and says it is not a request for payment', quote.includes('not a request for payment'));

// ---- long documents break onto more pages ---------------------------------------------------------
const many = normaliseDraft({
  ...draft,
  lines: Array.from({ length: 60 }, (_, i) => ({ description: `Item number ${i + 1}, described at some length so the row is not trivial`, quantity: i + 1, unitPrice: 12.5 })),
});
const manyText = latin1(invoiceToPdf(many, {}));
const pageCount = Number(/\/Count (\d+)/.exec(manyText)[1]);
ok('sixty lines need more than one page', pageCount > 1);
ok('the pages array matches the count', (manyText.match(/\/Type \/Page[^s]/g) || []).length === pageCount);
// A second page that does not say what it belongs to is a loose sheet of paper.
ok('a continued page says what it continues', manyText.includes('continued'));
ok('and pages are numbered once there is more than one', manyText.includes('Page 1 of'));
ok('a single-page invoice is not numbered', !text.includes('Page 1 of'));

// ---- an empty-ish document must not throw --------------------------------------------------------
const bare = invoiceToPdf(normaliseDraft({ kind: 'invoice' }), {});
ok('a blank draft still produces a valid file', latin1(bare).startsWith('%PDF') && bare.length > 800);

// ---- paper sizes ------------------------------------------------------------------------------------
ok('US Letter', latin1(invoiceToPdf(draft, {}, { size: 'letter' })).includes('/MediaBox [ 0 0 612 792 ]'));
ok('US Legal', latin1(invoiceToPdf(draft, {}, { size: 'legal' })).includes('/MediaBox [ 0 0 612 1008 ]'));
ok('A5', latin1(invoiceToPdf(draft, {}, { size: 'a5' })).includes('/MediaBox [ 0 0 419.53 595.28 ]'));
ok('the paper can come from settings rather than a call', latin1(invoiceToPdf(draft, { paperSize: 'letter' })).includes('612 792'));

// A till roll is a different SHAPE, not a smaller sheet. 72mm of printable width on 80mm paper,
// because a thermal mechanism does not reach the edge of its own roll.
const roll = latin1(invoiceToPdf(draft, { paperSize: 'receipt80' }));
ok('an 80mm roll prints 72mm wide', roll.includes('/MediaBox [ 0 0 204.09 841.89 ]'));
ok('a 58mm roll prints 48mm wide', latin1(invoiceToPdf(draft, { paperSize: 'receipt58' })).includes('/MediaBox [ 0 0 136.06 841.89 ]'));
ok('and it is still a valid file', roll.startsWith('%PDF') && roll.trimEnd().endsWith('%%EOF'));
// The description is WRAPPED to the narrow column rather than running off the roll, so it is on the
// page in pieces rather than as one string — which is exactly the behaviour being checked.
ok('the lines are still on it', roll.includes('Site survey') && roll.includes('measurement'));
ok('but wrapped, not run off the edge', !roll.includes('Site survey and measurement'));
ok('and the A4 version does not need to wrap it', text.includes('Site survey and measurement'));
ok('and the total is there', roll.includes('1,680.00'));
// The From/Bill-to spread does not fit and does not belong: anyone holding a receipt is standing in
// front of the business already.
ok('a receipt has no From block', !roll.includes('FROM'));
ok('nor a Bill-to block', !roll.includes('BILL TO'));
// But an A4 invoice of the same document does.
ok('an A4 invoice still has both', text.includes('FROM') && text.includes('BILL TO'));

// ---- density -----------------------------------------------------------------------------------------
const compact = invoiceToPdf(draft, { density: 'compact' });
const roomy = invoiceToPdf(draft, { density: 'roomy' });
// Same content, set tighter or looser. The type and the leading scale together, so it stays in tune.
ok('compact and roomy both render', latin1(compact).includes('Site survey') && latin1(roomy).includes('Site survey'));
const sizeOf = (b) => Number(/\/F1 ([\d.]+) Tf/.exec(latin1(b))[1]);
ok('compact sets smaller type than roomy', sizeOf(compact) < sizeOf(roomy));
ok('and normal sits between them', sizeOf(bytes) > sizeOf(compact) && sizeOf(bytes) < sizeOf(roomy));
// A roll is set smaller again, because it is 72mm wide.
ok('a till roll is smaller still', sizeOf(invoiceToPdf(draft, { paperSize: 'receipt80' })) < sizeOf(bytes));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
