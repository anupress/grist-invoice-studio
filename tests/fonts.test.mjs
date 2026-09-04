import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ttf = await import(pathToFileURL(_resolve(ROOT, 'src/export/pdf/ttf.js')).href);
const fonts = await import(pathToFileURL(_resolve(ROOT, 'src/export/pdf/fonts.js')).href);
const { EmbeddedFonts } = await import(pathToFileURL(_resolve(ROOT, 'src/export/pdf/embedded.js')).href);
const { PdfWriter, pdfString } = await import(pathToFileURL(_resolve(ROOT, 'src/export/pdf/writer.js')).href);
const { invoiceToPdf, invoiceNeedsEmbeddedFont } = await import(pathToFileURL(_resolve(ROOT, 'src/export/pdf/invoice.js')).href);
const { normaliseDraft } = await import(pathToFileURL(_resolve(ROOT, 'src/model/draft.js')).href);

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };
const near = (n, got, want, tol) => { if (Math.abs(got - want) <= tol) pass++; else { fail++; console.log(`  FAIL ${n}\n    got ${got}, want ~${want}`); } };
const latin1 = (bytes) => Buffer.from(bytes).toString('latin1');
const cp = (s) => [...s].map((c) => c.codePointAt(0));

// ---------------------------------------------------------------------------------------------
// Which text needs a real font. This is the whole reason the family exists: the standard fonts
// are WinAnsi, and a Polish client's name came out of the PDF with question marks in it.
// ---------------------------------------------------------------------------------------------
eq('plain Latin does not', fonts.needsEmbedding('Invoice INV-2026-0001'), false);
eq('nor Latin-1 accents', fonts.needsEmbedding('Müller & Frère, São Paulo'), false);
eq('nor our own typographic characters', fonts.needsEmbedding('client’s “quote” — done…'), false);
eq('nor the currency signs WinAnsi has', fonts.needsEmbedding('£1,234 €5 ¥6'), false);
eq('Polish does', fonts.needsEmbedding('Zażółć gęślą jaźń'), true);
eq('Czech does', fonts.needsEmbedding('Dvořák'), true);
eq('Hungarian does', fonts.needsEmbedding('Erdős'), true);
eq('Greek does', fonts.needsEmbedding('Αθήνα'), true);
eq('Cyrillic does', fonts.needsEmbedding('Москва'), true);
eq('a rupee sign does — it would otherwise be "Rs."', fonts.needsEmbedding('₹1,400'), true);
eq('nothing needs nothing', fonts.needsEmbedding(''), false);

// ---------------------------------------------------------------------------------------------
// The shipped fonts. They are committed, so the tests read the real files rather than a fixture,
// and a broken subset script would fail here before it shipped.
// ---------------------------------------------------------------------------------------------
const regularBytes = new Uint8Array(readFileSync(_resolve(ROOT, 'fonts/DejaVuSans-Regular.ttf')));
const boldBytes = new Uint8Array(readFileSync(_resolve(ROOT, 'fonts/DejaVuSans-Bold.ttf')));
ok('the regular face is a sensible size', regularBytes.length > 100000 && regularBytes.length < 400000);
ok('so is the bold', boldBytes.length > 100000 && boldBytes.length < 400000);

const regular = ttf.parse(regularBytes);
const bold = ttf.parse(boldBytes);
eq('2048 units to the em, as DejaVu is', regular.unitsPerEm, 2048);
ok('a couple of thousand glyphs — the repertoire, not the whole font', regular.numGlyphs > 1500 && regular.numGlyphs < 3000);
for (const ch of ['A', 'ł', 'ż', 'č', 'ř', 'ő', 'ű', 'ğ', 'ș', 'ț', 'Ω', 'Я', 'ệ', '€', '₹', '₺', '₽', '฿', '—', '“', '№', '✓']) {
  ok(`the shipped font has ${ch}`, regular.glyphFor(ch.codePointAt(0)) > 0 && bold.glyphFor(ch.codePointAt(0)) > 0);
}
eq('and honestly lacks CJK', regular.glyphFor('請'.codePointAt(0)), 0);
eq('and Devanagari', regular.glyphFor('न'.codePointAt(0)), 0);
// DejaVu has no taka sign, so that one stays transliterated to "Tk." whichever family is in use.
eq('and the taka sign, which stays "Tk."', regular.glyphFor('৳'.codePointAt(0)), 0);
ok('an advance width is in font units', regular.advanceOf('A'.codePointAt(0)) > 1000);
ok('and .notdef has one too', regular.advanceOf(0x9999) > 0);

// ---------------------------------------------------------------------------------------------
// Subsetting the subset, which is what every PDF does
// ---------------------------------------------------------------------------------------------
const cut = ttf.subset(regular, cp('Zażółć — ₹ 1,400.00'));
ok('a document subset is small', cut.bytes.length < 40000);
const back = ttf.parse(cut.bytes);
eq('it re-parses with the glyphs it kept', back.numGlyphs, cut.glyphCount);
eq('glyph 0 is still .notdef', cut.glyphMap.has(0), false);
for (const ch of 'Zażółć—₹') {
  const c = ch.codePointAt(0);
  ok(`${ch} maps to a glyph in the subset`, cut.glyphMap.get(c) > 0);
  eq(`${ch} keeps its advance`, back.advanceOf(c), regular.advanceOf(c));
  eq(`the /W array agrees for ${ch}`, cut.advances[cut.glyphMap.get(c)], regular.advanceOf(c));
}
ok('a character not asked for is not there', !cut.glyphMap.has('Q'.codePointAt(0)) && back.glyphFor('Q'.codePointAt(0)) === 0);
// An accented letter is a composite of a base and a mark; both have to come along.
ok('composites bring their components', cut.glyphCount > cp('Zażółć — ₹ 1,400.00').length / 2);
// The subset is renumbered from zero and contiguous, which is what lets /W be one run.
eq('glyph ids are contiguous', [...cut.glyphMap.values()].every((g) => g < cut.glyphCount), true);

// A composite cut without its base would draw nothing: check a known composite round-trips.
{
  const only = ttf.subset(regular, cp('é'));
  const p = ttf.parse(only.bytes);
  ok('é alone still carries its e and its accent', only.glyphCount >= 3 && p.glyphFor('é'.codePointAt(0)) > 0);
}

// ---------------------------------------------------------------------------------------------
// The family, measured and encoded
// ---------------------------------------------------------------------------------------------
const family = new EmbeddedFonts({ regular, bold });
near('an A at 2048 units per em measures against the font', family.measure('A', 10), regular.advanceOf(65) * 10 / 2048, 0.001);
ok('bold is wider than regular, as it should be', family.measure('Invoice', 10, true) > family.measure('Invoice', 10));
eq('every digit is one width, so figures line up', new Set('0123456789'.split('').map((d) => family.measure(d, 10))).size, 1);
near('scaling is linear', family.measure('Total', 20), family.measure('Total', 10) * 2, 0.0001);
ok('a non-breaking space measures as a space', family.measure(' ', 10) === family.measure(' ', 10));

family.prepare({ regular: ['Zażółć'], bold: ['Total'] });
const enc = family.encode('Zażółć');
eq('encoding is hex', enc.hex, true);
eq('two bytes a glyph', enc.raw.length, 6 * 4);
ok('and none of them is .notdef', !/0000/.test(enc.raw));
eq('a character outside the subset encodes as .notdef', family.encode('Q').raw, '0000');
eq('ten objects: five per face', family.objectCount(), 10);
ok('italic is the regular face sheared', family.resourceEntries(5).includes('/F3 5 0 R') && family.italicSkew === true);

const objs = family.objects(5);
eq('five objects per face', objs.length, 10);
ok('a Type 0 font over Identity-H', objs[0].dict.includes('/Subtype /Type0') && objs[0].dict.includes('/Encoding /Identity-H'));
ok('a CIDFontType2 with identity glyph mapping', objs[1].dict.includes('/CIDFontType2') && objs[1].dict.includes('/CIDToGIDMap /Identity'));
ok('a /W array of every glyph', /\/W \[ 0 \[ [\d ]+\] \]/.test(objs[1].dict));
ok('a descriptor pointing at the font file', objs[2].dict.includes('/FontFile2 9 0 R'));
ok('a ToUnicode map, so the text can be searched and copied', latin1(objs[3].stream).includes('beginbfchar'));
ok('the font program with its length', objs[4].dict.includes('/Length1'));
ok('bold is flagged bold', objs[7].dict.includes('/Flags ' + (32 | (1 << 18))));

// ---------------------------------------------------------------------------------------------
// A whole PDF with the family in it
// ---------------------------------------------------------------------------------------------
const polish = normaliseDraft({
  kind: 'invoice', number: 'FV-2026-0007', issued: '2026-09-01', due: '2026-09-15', status: 'Sent',
  currency: 'PLN', format: { currency: 'PLN' },
  sender: { name: 'Zakład Stolarski Różycki', city: 'Łódź', country: 'PL' },
  client: { name: 'Piekarnia „Złoty Kłos” Sp. z o.o.', street1: 'ul. Świętokrzyska 12', city: 'Kraków', country: 'PL' },
  lines: [{ description: 'Stół dębowy, 180 × 90 cm', quantity: 1, unitPrice: 3200 }],
  totals: { subtotal: 3200, taxTotal: 736, total: 3936, amountPaid: 0, balance: 3936, taxLines: [{ name: 'VAT', rate: 23, amount: 736 }], discounts: [], shipping: { amount: 0 } },
});

eq('a Polish document needs the family', invoiceNeedsEmbeddedFont(polish, {}), true);
const plain = normaliseDraft({ kind: 'invoice', number: 'INV-1', sender: { name: 'Thornbury Works' }, client: { name: 'Harbour Lane Bakery' }, lines: [{ description: 'Work', quantity: 1, unitPrice: 100 }] });
eq('an English one does not', invoiceNeedsEmbeddedFont(plain, {}), false);
// A rupee amount is the case that used to be transliterated. Now it is a reason to embed.
const rupee = normaliseDraft({ ...plain, currency: 'INR', format: { currency: 'INR' } });
eq('a rupee document does', invoiceNeedsEmbeddedFont(rupee, {}), true);

const withFamily = invoiceToPdf(polish, {}, { fonts: new EmbeddedFonts({ regular, bold }) });
const text = latin1(withFamily);
ok('it is a PDF', text.startsWith('%PDF-1.4') && text.trimEnd().endsWith('%%EOF'));
ok('with an embedded font program', text.includes('/FontFile2') && text.includes('/Length1'));
ok('drawn through Identity-H', text.includes('/Identity-H'));
ok('as hex glyph runs', /<[0-9A-F]{4,}> Tj/.test(text));
ok('and never as a question mark', !/\(\?/.test(text));
ok('a Polish invoice is under 80KB', withFamily.length < 80000);
ok('the standard fonts are not also in it', !text.includes('/BaseFont /Helvetica'));
ok('the ToUnicode map carries ł', text.includes('<' + 'ł'.codePointAt(0).toString(16).toUpperCase().padStart(4, '0') + '>'));

// The cross-reference table has to be exact with ten more objects in the file.
{
  const xrefAt = Number(/startxref\s+(\d+)/.exec(text)[1]);
  ok('startxref lands on the table', text.slice(xrefAt, xrefAt + 4) === 'xref');
  const block = text.slice(xrefAt);
  const count = Number(/xref\s+0\s+(\d+)/.exec(block)[1]);
  const entries = block.slice(block.indexOf('\n', block.indexOf('0 ' + count)) + 1);
  let exact = true;
  for (let i = 1; i < count; i++) {
    const offset = Number(entries.slice(i * 20, i * 20 + 10));
    if (!text.slice(offset, offset + 20).startsWith(`${i} 0 obj`)) exact = false;
  }
  ok('every object is where the table says', exact);
  // Every stream's declared length must be its real length — the font program included.
  let lengths = true;
  for (const m of text.matchAll(/<< \/Length (\d+)( \/Length1 \d+)? >>\nstream\n/g)) {
    const start = m.index + m[0].length;
    const end = text.indexOf('\nendstream', start);
    if (end - start !== Number(m[1])) lengths = false;
  }
  ok('every stream length is exact', lengths);
}

// The promise that matters most: a document that never needed the family is the document it
// always was, byte for byte, when rendered the same second.
{
  const a = latin1(invoiceToPdf(plain, {}));
  const b = latin1(invoiceToPdf(plain, {}, { fonts: null }));
  eq('no family, no change', a.replace(/CreationDate \(D:\d+\)/, ''), b.replace(/CreationDate \(D:\d+\)/, ''));
  ok('and it embeds nothing', !a.includes('/FontFile2'));
}

// Italic in the family is a sheared text matrix rather than a third face.
{
  const quote = normaliseDraft({ ...polish, kind: 'quote' });
  const q = latin1(invoiceToPdf(quote, {}, { fonts: new EmbeddedFonts({ regular, bold }) }));
  ok('the legend is drawn sheared', /1 0 0\.2 1 [\d.]+ [\d.]+ Tm/.test(q));
}

// The title of a non-Latin document goes into the Info dictionary as UTF-16, not as garbage.
eq('an ASCII title is a literal', pdfString('Invoice INV-1'), '(Invoice INV-1)');
ok('a non-Latin title is UTF-16 with a byte-order mark', pdfString('Faktura Łódź').startsWith('<FEFF'));
ok('and the document carries it', text.includes('/Title <FEFF') || text.includes('/Title (Invoice'));

// A writer given only a regular face still works — bold falls back to regular.
{
  const one = new EmbeddedFonts({ regular });
  const w = new PdfWriter({ fonts: one });
  w.text(40, 40, 'Zażółć', { bold: true });
  const out = latin1(w.bytes());
  ok('a family with one face still produces a file', out.startsWith('%PDF') && out.includes('/FontFile2'));
}

// A QR code drawn as vector squares.
{
  const w = new PdfWriter({});
  w.qr(40, 40, 60, { size: 3, modules: [[true, false, true], [false, true, false], [true, false, true]] });
  const out = latin1(w.bytes());
  eq('one rectangle per dark module', (out.match(/ re\n/g) || []).length, 5);
  ok('filled once', /re\nf\n/.test(out));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
