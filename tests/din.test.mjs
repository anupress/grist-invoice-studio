// The DIN 5008 sheets: the German business letter.
//
// What matters about them is where things are, in millimetres from the paper's edges, because
// the envelope is a fact: fold the sheet at its marks, put it in a DIN lang window envelope, and
// the address field — all of it and nothing else — shows through the window. So the PDF is
// measured here position by position against the standard's numbers, and the screen and the
// file are checked for carrying the same numbers in their stylesheets. The address order is
// checked too, because "Berlin 10115" on the line a sorting machine reads is the one line on the
// sheet that must not be in the English order.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => import(pathToFileURL(_resolve(ROOT, p)).href);

const { LAYOUTS, isLayout, isLedger, isDin, isWindowed, DIN, DIN_FORMS, returnLine } = await load('src/doc/layouts.js');
const { addressLines, placeLine, postcodeFirst, countryCode } = await load('src/doc/address.js');
const { normaliseDraft, recalc } = await load('src/model/draft.js');
const { fieldsFor, lineColumns, totalLabels } = await load('src/doc/fields.js');
const { layoutInvoice } = await load('src/export/pdf/invoice.js');
const { MM } = await load('src/export/pdf/writer.js');
const { settingsFrom } = await load('src/settings/runtime.js');
const { sanitise } = await load('src/settings/store.js');
const { documentToHtml } = await load('src/export/html-file.js');
const { documentToEmailHtml } = await load('src/send/email-document.js');

let pass = 0, fail = 0;
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const near = (n, got, want, tol) => { if (Math.abs(got - want) <= tol) pass++; else { fail++; console.log(`  FAIL ${n}\n    got ${got}, want ~${want} (±${tol})`); } };

// Enough of a document for core/util.js's el() to build the page under Node, so the HTML file
// can be produced and read as text. Attributes, text, children and inline style serialise; the
// rest of the DOM is not pretended.
class FakeNode {
  constructor(tag) { this.tag = tag.toLowerCase(); this.nodeType = 1; this.attrs = {}; this.kids = []; this.dataset = {}; this.style = { setProperty(k, v) { this[k] = v; } }; }
  get className() { return this.attrs.class || ''; }
  set className(v) { this.attrs.class = v; }
  set textContent(v) { this.kids = [String(v)]; }
  set innerHTML(v) { this.kids = [String(v)]; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  append(...cs) { this.kids.push(...cs); }
  get outerHTML() {
    const style = Object.keys(this.style).filter((k) => typeof this.style[k] !== 'function').map((k) => `${k}: ${this.style[k]}`).join('; ');
    const attrs = Object.entries(this.attrs).map(([k, v]) => ` ${k}="${v}"`).join('') + (style ? ` style="${style}"` : '');
    return `<${this.tag}${attrs}>${this.kids.map((c) => (typeof c === 'string' ? c : c.outerHTML)).join('')}</${this.tag}>`;
  }
}
globalThis.document = { createElement: (t) => new FakeNode(t), createTextNode: (s) => String(s) };

// ---------------------------------------------------------------------------------------------
// They are layouts, and they are the standard's numbers
// ---------------------------------------------------------------------------------------------
for (const id of ['din5008b', 'din5008a']) {
  ok(`${id} is a layout`, LAYOUTS.some((l) => l.id === id && /DIN 5008/.test(l.label)) && isLayout(id));
  ok(`${id} is a DIN sheet, windowed, and not the ledger`, isDin(id) && isWindowed(id) && !isLedger(id));
  eq(`a draft keeps ${id}`, normaliseDraft({ layout: id }).layout, id);
}
ok('the ledger is windowed but not DIN', isWindowed('ledger') && !isDin('ledger'));
ok('classic is neither', !isWindowed('classic') && !isDin('classic') && !isDin(undefined));
eq('Form B comes first in the chooser, being the usual sheet', LAYOUTS.findIndex((l) => l.id === 'din5008b') < LAYOUTS.findIndex((l) => l.id === 'din5008a'), true);

eq('the address field: 20mm in, 85 wide, 45 high', [DIN.addrLeft, DIN.addrWidth, DIN.addrHeight], [20, 85, 45]);
eq('its return line and remark zones', [DIN.returnZone, DIN.remarkZone], [5, 12.7]);
near('which leave 27.3mm — six lines of 12pt — for the address', DIN.addrHeight - DIN.returnZone - DIN.remarkZone, 27.3, 0.001);
near('a line is 12pt', DIN.line * MM, 12, 0.01);
eq('the information block: 125mm in, at most 75 wide', [DIN.infoLeft, DIN.infoWidth], [125, 75]);
eq('the text margins: 25mm left, 20mm right', [DIN.textLeft, DIN.textRight], [25, 20]);
near('the subject two lines below the field', DIN.subjectGap, 2 * DIN.line, 0.01);
eq('Form B: field at 45, block at 50, folds at 105 and 210, punch at 148.5',
  [DIN_FORMS.din5008b.addrTop, DIN_FORMS.din5008b.infoTop, ...DIN_FORMS.din5008b.fold, DIN_FORMS.din5008b.punch], [45, 50, 105, 210, 148.5]);
eq('Form A: everything 18mm higher but the punch mark',
  [DIN_FORMS.din5008a.addrTop, DIN_FORMS.din5008a.infoTop, ...DIN_FORMS.din5008a.fold, DIN_FORMS.din5008a.punch], [27, 32, 87, 192, 148.5]);

// ---------------------------------------------------------------------------------------------
// Where the postcode goes
// ---------------------------------------------------------------------------------------------
eq('a code is a code', countryCode('de'), 'DE');
eq('a name in English', countryCode('Germany'), 'DE');
eq('a name in German', countryCode('Deutschland'), 'DE');
eq('something unknown is nothing', countryCode('Ruritania'), '');
eq('Germany writes the postcode first', placeLine({ country: 'DE', postcode: '10115', city: 'Berlin' }), '10115 Berlin');
eq('and never the town twice', placeLine({ country: 'DE', postcode: '10115', city: 'Berlin', state: 'Berlin' }), '10115 Berlin');
eq('Italy keeps its province after the town', placeLine({ country: 'IT', postcode: '20121', city: 'Milano', state: 'MI' }), '20121 Milano MI');
eq('Britain writes the town first', placeLine({ country: 'GB', postcode: 'BS1 4QA', city: 'Bristol', state: 'Somerset' }), 'Bristol Somerset BS1 4QA');
eq('the United States too', placeLine({ country: 'United States', postcode: '10001', city: 'New York', state: 'NY' }), 'New York NY 10001');
eq('no country: the document’s language decides, German', placeLine({ postcode: '1010', city: 'Wien' }, 'de'), '1010 Wien');
eq('no country: the document’s language decides, English', placeLine({ postcode: 'BS1 4QA', city: 'Bristol' }, 'en'), 'Bristol BS1 4QA');
ok('a British client in a German document is still British', !postcodeFirst({ country: 'GB' }, 'de'));
eq('the lines, in order', addressLines({ street1: 'Unter den Linden 1', street2: '', city: 'Berlin', postcode: '10115', country: 'DE' }, 'de'), ['Unter den Linden 1', '10115 Berlin', 'DE']);
eq('the return line: name, street, postcode and town', returnLine({ name: 'Muster GmbH', street1: 'Hauptstr. 1', postcode: '10115', city: 'Berlin' }, 'de'), 'Muster GmbH · Hauptstr. 1 · 10115 Berlin');
eq('in English, town then postcode', returnLine({ name: 'ANUPRESS Works', street1: '4 Quarry Street', postcode: 'BS1 5TF', city: 'Bristol' }, 'en'), 'ANUPRESS Works · 4 Quarry Street · Bristol BS1 5TF');
eq('missing parts are left out, not dotted', returnLine({ name: 'Solo', city: 'Bristol' }, 'en'), 'Solo · Bristol');

// ---------------------------------------------------------------------------------------------
// A document to measure
// ---------------------------------------------------------------------------------------------
function doc(layout, over = {}, biz = {}) {
  const stored = sanitise({});
  Object.assign(stored.business, {
    name: 'ANUPRESS Works', street1: '4 Quarry Street', city: 'Bristol', postcode: 'BS1 5TF', country: 'GB',
    email: 'accounts@anupress.example', phone: '+44 117 496 0102', website: 'anupress.com',
    taxNumber: 'GB 481 2739 55', legalText: 'Registered in England 12345678\nDirector: A. Mustermann',
  }, biz);
  stored.document.layout = layout;
  stored.money.currency = 'GBP';
  const settings = settingsFrom(stored, over.kind || 'invoice', null);
  const draft = normaliseDraft({
    kind: 'invoice', layout, number: 'INV-2026-0042', issued: '2026-09-12', due: '2026-10-12', reference: 'PO 5087', status: 'Sent',
    sender: stored.business,
    client: { name: 'Harbour Lane Bakery', street1: '12 Harbour Lane', city: 'Bristol', postcode: 'BS1 4QA', country: 'GB', email: 'accounts@harbourlane.example' },
    lines: [
      { description: 'Consultancy, day rate', quantity: 3, unitPrice: 550 },
      { description: 'Travel and expenses', quantity: 84, unitPrice: 0.45, unit: 'mile' },
    ],
    ...over,
  });
  recalc(draft, settings);
  return { draft, settings, fields: fieldsFor(draft, settings) };
}

const texts = (pdf, page = 0) => pdf.pages[page].filter((o) => typeof o !== 'string');
const topOf = (pdf, o) => pdf.height - (o.y + o.size * 0.78);   // the writer puts the baseline 0.78em below `top`
const fmt3 = (n) => { const s = (Math.round(n * 1000) / 1000).toString(); return s === '-0' ? '0' : s; };
const markAt = (pdf, page, mmY, mmLen) => {
  const y = fmt3(pdf.height - mmY * MM);
  return pdf.pages[page].some((o) => typeof o === 'string' && o === `0 ${y} m ${fmt3(mmLen * MM)} ${y} l S`);
};

{
  const { fields } = doc('din5008b');
  ok('a DIN sheet numbers its positions', fields.showPosition === true && lineColumns(fields)[0].id === 'position');
  ok('and says net and gross while tax is charged', fields.showNetGross === true && totalLabels(fields, {}).total === 'Total (gross)');
}

// ---------------------------------------------------------------------------------------------
// The PDF, Form B: every position the standard fixes, measured
// ---------------------------------------------------------------------------------------------
{
  const { draft, settings } = doc('din5008b');
  const pdf = layoutInvoice(draft, settings);
  const T = texts(pdf);
  ok('one page', pdf.pageCount === 1);

  const name = T.find((o) => o.text === 'Harbour Lane Bakery');
  ok('the client is on the sheet', !!name);
  near('20mm from the left edge', name.x, 20 * MM, 0.5);
  near('17.7mm into a field whose top is 45mm from the paper’s edge', topOf(pdf, name), (45 + 17.7) * MM, 0.6);
  const street = T.find((o) => o.text === '12 Harbour Lane');
  near('the next line is one standard line below', topOf(pdf, street) - topOf(pdf, name), 4.23 * MM, 0.05);
  const place = T.find((o) => o.text === 'Bristol BS1 4QA');
  ok('a British address keeps its town first', !!place);
  ok('nothing but the postal address is in the window', !T.some((o) => o.text === 'accounts@harbourlane.example'));

  const ret = T.find((o) => /^ANUPRESS Works · 4 Quarry Street · Bristol BS1 5TF$/.test(o.text));
  ok('the return line names the sender, small', !!ret && ret.size < 8);
  ok('inside the 5mm return zone above the address', topOf(pdf, ret) >= 45 * MM && topOf(pdf, ret) + ret.size <= 50 * MM + 0.5);
  ok('with a rule under the zone', pdf.pages[0].some((o) => typeof o === 'string' && o.startsWith(`${fmt3(20 * MM)} ${fmt3(pdf.height - 50 * MM)} m ${fmt3(105 * MM)} ${fmt3(pdf.height - 50 * MM)} l`)));

  const label = T.find((o) => o.text === 'Number');
  near('the information block starts 125mm from the left edge', label.x, 125 * MM, 0.5);
  near('and 50mm from the top', topOf(pdf, label), 50 * MM, 0.6);
  const value = T.find((o) => o.text === 'INV-2026-0042' && o.x > 125 * MM);
  ok('with the number on the same line', !!value && Math.abs(topOf(pdf, value) - topOf(pdf, label)) < 0.01);
  near('ranged against the 20mm right margin', value.x + pdf.measure(value.text, value.size, value.bold), pdf.width - 20 * MM, 0.5);
  ok('the block has the dates and the reference', ['Issued', 'Due', 'Your reference', 'PO 5087'].every((t) => T.some((o) => o.text === t)));
  ok('and nothing is drawn right of the block’s own margin', T.every((o) => o.x + pdf.measure(o.text, o.size, o.bold) <= pdf.width - 20 * MM + 0.5));

  const subject = T.find((o) => o.text === 'Invoice INV-2026-0042');
  ok('the subject is the word and the number, bold', !!subject && subject.bold);
  near('at the text margin, 25mm', subject.x, 25 * MM, 0.5);
  near('98.46mm from the top: two lines below the field', topOf(pdf, subject), 98.46 * MM, 0.6);
  ok('the status sits on the subject line', T.some((o) => o.text === 'SENT' && Math.abs(topOf(pdf, o) - topOf(pdf, subject)) < 3));
  const first = T.find((o) => o.text === 'Consultancy, day rate');
  ok('the body begins two blank lines below the subject', topOf(pdf, first) >= topOf(pdf, subject) + 3 * 4.23 * MM - 0.5);
  // The running number is the first column, so it is what sits on the margin.
  near('and the body keeps the text margin', T.find((o) => o.text === '1').x, 25 * MM, 0.5);

  ok('fold marks at 105 and 210mm, 5mm long', markAt(pdf, 0, 105, 5) && markAt(pdf, 0, 210, 5));
  ok('the punch mark at 148.5mm, longer', markAt(pdf, 0, 148.5, 8));

  ok('the lines are numbered', T.some((o) => o.text === '#') && T.some((o) => o.text === '1') && T.some((o) => o.text === '2'));
  ok('the totals say net and gross', T.some((o) => o.text === 'Subtotal (net)') && T.some((o) => o.text === 'Total (gross)'));
  ok('there is no From block', !T.some((o) => o.text === 'FROM'));
  ok('the sender is in the foot', ['accounts@anupress.example', 'Tax ID: GB 481 2739 55', '4 Quarry Street'].every((t) => T.some((o) => o.text === t)));
  ok('the legal line is printed once', T.filter((o) => o.text === 'Registered in England 12345678').length === 1);
  ok('the letterhead names the business, ranged right', T.some((o) => o.text === 'ANUPRESS Works' && o.bold && o.x > pdf.width / 2 && topOf(pdf, o) < 45 * MM));
}

// ---------------------------------------------------------------------------------------------
// Form A: the same sheet, 18mm higher
// ---------------------------------------------------------------------------------------------
{
  const { draft, settings } = doc('din5008a');
  const pdf = layoutInvoice(draft, settings);
  const T = texts(pdf);
  const name = T.find((o) => o.text === 'Harbour Lane Bakery');
  near('the address field starts at 27mm', topOf(pdf, name), (27 + 17.7) * MM, 0.6);
  near('the block at 32mm', topOf(pdf, T.find((o) => o.text === 'Number')), 32 * MM, 0.6);
  near('the subject at 80.46mm', topOf(pdf, T.find((o) => o.text === 'Invoice INV-2026-0042')), 80.46 * MM, 0.6);
  ok('fold marks at 87 and 192mm', markAt(pdf, 0, 87, 5) && markAt(pdf, 0, 192, 5) && !markAt(pdf, 0, 105, 5));
  ok('the punch mark stays at 148.5mm', markAt(pdf, 0, 148.5, 8));
  ok('the letterhead fits above the field', T.filter((o) => topOf(pdf, o) < 27 * MM).every((o) => topOf(pdf, o) + o.size <= 27 * MM));
}

// ---------------------------------------------------------------------------------------------
// A German document: the words, and the address in the German order
// ---------------------------------------------------------------------------------------------
{
  const { draft, settings } = doc('din5008b', {
    client: { name: 'Muster GmbH', street1: 'Unter den Linden 1', city: 'Berlin', postcode: '10115', country: 'DE', language: 'de', taxNumber: 'DE123456789' },
  });
  const pdf = layoutInvoice(draft, settings);
  const T = texts(pdf);
  ok('the window writes the postcode first', T.some((o) => o.text === '10115 Berlin') && !T.some((o) => o.text === 'Berlin 10115'));
  ok('the subject says Rechnung', T.some((o) => o.text === 'Rechnung INV-2026-0042'));
  ok('the block says Nummer and Rechnungsdatum', T.some((o) => o.text === 'Nummer') && T.some((o) => o.text === 'Rechnungsdatum'));
  ok('the client’s VAT number is in the block, not the window', T.some((o) => o.text === 'DE123456789' && o.x > 125 * MM));
  ok('the British sender’s return line keeps its own order', T.some((o) => /Bristol BS1 5TF$/.test(o.text)));
  ok('the totals say netto and brutto', T.some((o) => /\(netto\)$/.test(o.text)) && T.some((o) => /\(brutto\)$/.test(o.text)));
  const email = documentToEmailHtml(draft, settings);
  ok('the email writes the German address the German way too', email.includes('10115 Berlin') && !email.includes('Berlin 10115'));
}

// ---------------------------------------------------------------------------------------------
// Long documents, logos, till rolls
// ---------------------------------------------------------------------------------------------
{
  const lines = Array.from({ length: 60 }, (_, i) => ({ description: `Item ${i + 1}`, quantity: 1, unitPrice: 10 }));
  const { draft, settings } = doc('din5008b', { lines });
  const pdf = layoutInvoice(draft, settings);
  ok('sixty lines run to a second page', pdf.pageCount >= 2);
  ok('the marks are on the first page only', markAt(pdf, 0, 105, 5) && !markAt(pdf, 1, 105, 5) && !markAt(pdf, 1, 148.5, 8));
  ok('the foot is on every page', pdf.pages.every((ops) => ops.some((o) => typeof o !== 'string' && o.text === 'accounts@anupress.example')));
  ok('the second page keeps the text margin', texts(pdf, 1).some((o) => o.text === '#' && Math.abs(o.x - 25 * MM) < 0.5));
}
{
  const sof = [0xFF, 0xC0, 0x00, 0x11, 8, 0, 40, 0, 120, 3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0];
  const jpeg = Buffer.from(Uint8Array.from([0xFF, 0xD8, ...sof, 0xFF, 0xD9])).toString('base64');
  const { draft, settings } = doc('din5008a', {}, { logoJpeg: `data:image/jpeg;base64,${jpeg}`, logoData: `data:image/jpeg;base64,${jpeg}` });
  const pdf = layoutInvoice(draft, { ...settings, logoSize: 'large' });
  ok('the logo is drawn', pdf.images.length === 1);
  const im = pdf.pages[0].find((o) => typeof o === 'string' && / cm \/Im1 Do/.test(o));
  const h = Number(im.split(' ')[4]);
  const topPt = pdf.height - Number(im.split(' ')[6]) - h;
  ok('and even a large one stops above Form A’s address field', topPt + h <= 27 * MM + 0.01);
}
{
  const { draft, settings } = doc('din5008b');
  const pdf = layoutInvoice(draft, { ...settings, paperSize: 'receipt80' });
  const T = texts(pdf);
  ok('a till roll ignores the sheet', !T.some((o) => o.text === 'Number') && T.some((o) => o.text === 'ANUPRESS Works') && !markAt(pdf, 0, 105, 5));
}

// ---------------------------------------------------------------------------------------------
// The file and the screen carry the same numbers
// ---------------------------------------------------------------------------------------------
{
  const { draft, settings } = doc('din5008b');
  const html = documentToHtml(draft, settings);
  ok('the file is a DIN sheet', html.includes('inv-doc is-din5008b') && html.includes('inv-din__window') && html.includes('inv-din__info'));
  ok('with no page margin of its own', /@page \{ margin: 0; \}/.test(html));
  ok('the marks are placed from the paper’s top', html.includes('calc(105 * var(--mm) - var(--din-y0, 0px))') && html.includes('calc(148.5 * var(--mm)'));
  const classic = documentToHtml(doc('classic').draft, settings);
  ok('an ordinary file keeps its 14mm', /@page \{ margin: 14mm; \}/.test(classic));
}
for (const [name, path] of [['document.css', 'src/styles/document.css'], ['the HTML file', 'src/export/html-file.js']]) {
  const css = readFileSync(_resolve(ROOT, path), 'utf8');
  for (const sel of ['.inv-head.is-din', '.inv-din__top', '.inv-din__window', '.inv-din__return', '.inv-din__remarks', '.inv-din__recipient', '.inv-din__info', '.inv-din__subject', '.inv-din__mark', '.inv-din__mark--punch']) {
    ok(`${name} styles ${sel}`, css.includes(sel));
  }
  ok(`${name} measures in 210ths of the width`, css.includes('--mm: calc(100cqw / 210)'));
  ok(`${name} prints in real millimetres`, /container-type: normal; --mm: 1mm/.test(css));
  ok(`${name} knows both forms`, css.includes('--din-top: 45;') && css.includes('--din-top: 27;') && css.includes('--din-fold-1: 105;') && css.includes('--din-fold-1: 87;'));
  ok(`${name} draws the field 85 × 45`, css.includes('width: calc(85 * var(--mm)); height: calc(45 * var(--mm))'));
  ok(`${name} keeps the zones`, css.includes('height: calc(5 * var(--mm))') && css.includes('height: calc(12.7 * var(--mm))'));
  ok(`${name} sets the subject two lines down`, css.includes('margin-top: calc(8.46 * var(--mm))'));
  ok(`${name} keeps the text margins`, css.includes('margin-left: calc(25 * var(--mm)); margin-right: calc(20 * var(--mm))'));
  ok(`${name} starts the block 125mm in`, css.includes('margin-left: calc(-5 * var(--mm))') && css.includes('width: calc(65 * var(--mm))'));
}
const studio = readFileSync(_resolve(ROOT, 'src/styles/studio.css'), 'utf8');
ok('on paper the frame gives the sheet the whole width', /\[data-din\] \.studio-body \{ padding-left: 0; padding-right: 0; \}/.test(studio));
// The frame fills the iframe only if its mount point has a height — without it the whole page
// scrolled, list and document together — and a body with a height must not shrink its children.
ok('the mount point carries the frame’s height', /#studio-root \{ height: 100%; \}/.test(studio));
ok('and nothing in the body shrinks to fit it', /\.studio-body > \* \{ flex-shrink: 0; \}/.test(studio));
ok('while paper lets the frame grow again', /#studio-root, \.studio, \.studio-main \{ display: block; height: auto; \}/.test(studio));
const main = readFileSync(_resolve(ROOT, 'src/main.js'), 'utf8');
ok('and the shell says when a sheet is shown', /toggleAttribute\('data-din', isDin\(draft\.layout\)\)/.test(main));
const render = readFileSync(_resolve(ROOT, 'src/doc/render.js'), 'utf8');
ok('the renderer treats the sheet as windowed', /const windowed = isWindowed\(draft\.layout\)/.test(render) && !/isLedger/.test(render));
const layouts = readFileSync(_resolve(ROOT, 'src/doc/layouts.js'), 'utf8');
ok('the masthead builds the three zones', /inv-din__return/.test(layouts) && /inv-din__remarks/.test(layouts) && /inv-din__recipient/.test(layouts));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
