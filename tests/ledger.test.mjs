// The ledger layout: the shop invoice.
//
// Modelled on the invoice every online order arrives with — the client in the window-envelope
// position, a grid of dates and numbers, the document's word as a heading, numbered lines in a
// ruled table, the delivery address beside the totals, and the sender's registrations in a
// three-column foot. Guarded because it moves things the other eight layouts leave alone: the
// sender leaves the body for the foot, and a foot that forgot the tax number, or a PDF whose
// table gained a column its header did not, would be an invoice a reader cannot trust.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => import(pathToFileURL(_resolve(ROOT, p)).href);

const { LAYOUTS, isLayout, isLedger } = await load('src/doc/layouts.js');
const { normaliseDraft, recalc } = await load('src/model/draft.js');
const { fieldsFor, lineColumns, totalLabels } = await load('src/doc/fields.js');
const { labels, LANGUAGES } = await load('src/doc/lang.js');
const { invoiceToPdf, layoutInvoice } = await load('src/export/pdf/invoice.js');
const { settingsFrom } = await load('src/settings/runtime.js');
const { sanitise } = await load('src/settings/store.js');
const { documentToEmailHtml } = await load('src/send/email-document.js');
const { findTemplate } = await load('src/templates/index.js');

let pass = 0, fail = 0;
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };

// ---------------------------------------------------------------------------------------------
// It is a layout
// ---------------------------------------------------------------------------------------------
ok('ledger is one of the layouts', LAYOUTS.some((l) => l.id === 'ledger' && l.label === 'Ledger'));
ok('and the validator knows it', isLayout('ledger') && isLedger('ledger') && !isLedger('classic'));
eq('a draft keeps it', normaliseDraft({ layout: 'ledger' }).layout, 'ledger');
eq('the online shop template uses it', findTemplate('ecommerce').document.layout, 'ledger');

// ---------------------------------------------------------------------------------------------
// The words, in every language
// ---------------------------------------------------------------------------------------------
for (const lang of LANGUAGES) {
  const L = labels(lang.id);
  ok(`${lang.id} numbers its lines`, typeof L.columns.position === 'string' && L.columns.position.length > 0);
  ok(`${lang.id} has a word for the number cell`, typeof L.number === 'string' && L.number.length > 1);
  ok(`${lang.id} says net and gross`, typeof L.net === 'string' && typeof L.gross === 'string' && L.net !== L.gross);
}
eq('German counts positions', labels('de').columns.position, 'Pos.');
eq('French says HT and TTC', [labels('fr').net, labels('fr').gross], ['HT', 'TTC']);

// ---------------------------------------------------------------------------------------------
// What the fields say: numbered lines and net/gross only on the ledger, and only where they mean it
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
    kind: 'invoice', layout, number: 'INV-2026-0042', issued: '2026-09-12', due: '2026-10-12', reference: 'PO 5087',
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

{
  const { fields } = doc('ledger');
  ok('the ledger numbers its lines', fields.showPosition === true);
  eq('the running number is the first column', lineColumns(fields)[0].id, 'position');
  eq('with the language’s heading', lineColumns(fields)[0].label, '#');
  ok('tax is charged, so subtotal and total say net and gross', fields.showNetGross === true);
  const TL = totalLabels(fields, {});
  eq('the labels carry the words', [TL.subtotal, TL.total], ['Subtotal (net)', 'Total (gross)']);
}
{
  const { fields } = doc('classic');
  ok('the classic layout does not number its lines', !fields.showPosition && lineColumns(fields)[0].id === 'description');
  eq('nor qualify its totals', totalLabels(fields, {}).subtotal, 'Subtotal');
}
{
  const stored = sanitise({});
  stored.document.layout = 'ledger';
  stored.money.taxMode = 'none';
  const settings = settingsFrom(stored, 'invoice', null);
  const draft = normaliseDraft({ kind: 'invoice', layout: 'ledger', lines: [{ description: 'x', quantity: 1, unitPrice: 10 }] });
  recalc(draft, settings);
  const fields = fieldsFor(draft, settings);
  ok('without tax the ledger still numbers', fields.showPosition === true);
  ok('but does not claim net and gross', fields.showNetGross === false && totalLabels(fields, {}).total === 'Total');
}
{
  const { fields } = doc('ledger', { kind: 'delivery_note' });
  ok('a delivery note on the ledger is numbered too', fields.showPosition === true);
  ok('and shows no money, so no net or gross', fields.showNetGross === false);
}
{
  const { draft, settings } = doc('ledger');
  const de = { ...settings, language: 'de' };
  draft.client.language = 'de';
  const fields = fieldsFor(draft, de);
  const TL = totalLabels(fields, {});
  ok('a German ledger says netto and brutto', /\(netto\)$/.test(TL.subtotal) && /\(brutto\)$/.test(TL.total));
}

// ---------------------------------------------------------------------------------------------
// The PDF: the masthead, the numbered table, the foot on every page
// ---------------------------------------------------------------------------------------------
const drawn = (pdf) => pdf.pages.map((ops) => ops.filter((o) => typeof o !== 'string').map((o) => o.text));

{
  const { draft, settings } = doc('ledger');
  const pdf = layoutInvoice(draft, settings);
  const page = drawn(pdf)[0];
  ok('one page', pdf.pageCount === 1);
  ok('the client is in the window', page.includes('Harbour Lane Bakery') && page.includes('12 Harbour Lane'));
  ok('the number is a cell of the grid', page.includes('NUMBER') && page.includes('INV-2026-0042'));
  ok('the reference is in the grid', page.includes('YOUR REFERENCE') && page.includes('PO 5087'));
  ok('the word is a heading', page.includes('Invoice'));
  ok('the lines are numbered', page.includes('1') && page.includes('2') && page.includes('#'));
  ok('the totals say net and gross', page.includes('Subtotal (net)') && page.includes('Total (gross)'));
  ok('the foot names the sender', page.includes('ANUPRESS Works') && page.includes('4 Quarry Street'));
  ok('and the registrations', page.includes('Tax ID: GB 481 2739 55') && page.includes('Registered in England 12345678') && page.includes('Director: A. Mustermann'));
  ok('and how to reach them', page.includes('accounts@anupress.example') && page.includes('+44 117 496 0102') && page.includes('anupress.com'));
  ok('the legal line is not printed twice', page.filter((t) => t === 'Registered in England 12345678').length === 1);
  ok('without a logo the name is the mark, and the foot says it again', page.filter((t) => t === 'ANUPRESS Works').length === 2);
  ok('there is no From block', !page.includes('FROM'));
  const bytes = Buffer.from(invoiceToPdf(draft, settings)).toString('latin1');
  ok('the file is a PDF', bytes.startsWith('%PDF-') && bytes.trimEnd().endsWith('%%EOF'));
}
{
  // With a logo the mark stands alone in the corner and the name is said once, in the foot.
  const sof = [0xFF, 0xC0, 0x00, 0x11, 8, 0, 40, 0, 120, 3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0];
  const jpeg = Buffer.from(Uint8Array.from([0xFF, 0xD8, ...sof, 0xFF, 0xD9])).toString('base64');
  const { draft, settings } = doc('ledger', {}, { logoJpeg: `data:image/jpeg;base64,${jpeg}`, logoData: `data:image/jpeg;base64,${jpeg}` });
  const pdf = layoutInvoice(draft, settings);
  const page = drawn(pdf)[0];
  ok('the logo is drawn', pdf.images.length === 1);
  ok('and the name appears once, in the foot', page.filter((t) => t === 'ANUPRESS Works').length === 1);
}
{
  const { draft, settings } = doc('classic');
  const page = drawn(layoutInvoice(draft, settings))[0];
  ok('the classic PDF has no position column', !page.includes('#'));
  ok('and keeps its From block', page.includes('FROM'));
  ok('and its legal line', page.includes('Registered in England 12345678'));
}
{
  // Sixty lines run onto a second page: the foot is on both, and the body stopped above it.
  const lines = Array.from({ length: 60 }, (_, i) => ({ description: `Item ${i + 1}`, quantity: 1, unitPrice: 10 }));
  const { draft, settings } = doc('ledger', { lines });
  const pdf = layoutInvoice(draft, settings);
  const pages = drawn(pdf);
  const n = pdf.pageCount;
  ok('more than one page', n >= 2);
  ok('the foot is on every page', pages.every((p) => p.includes('accounts@anupress.example') && p.includes('Tax ID: GB 481 2739 55')));
  ok('the header repeats with its running-number column', pages[1].includes('#') && pages[1].includes('DESCRIPTION'));
  ok('the numbers run on to the last page', pages[n - 1].includes('60') && !pages[0].includes('60'));
  ok('page numbers are drawn', pages[n - 1].some((t) => t === `Page ${n} of ${n}`));
  // The foot's top edge, measured from what was drawn; every other string on every page ends
  // above it. (`o.y` is a baseline in PDF space, so `height - y` is a top-down baseline.)
  const inFoot = /accounts@|Tax ID|ANUPRESS Works|4 Quarry Street|Bristol BS1 5TF|^GB$|Registered|Director|\+44|^anupress\.com$/;
  const pageNo = /^Page \d+ of \d+$/;
  const texts = pdf.pages.flatMap((ops) => ops.filter((o) => typeof o !== 'string'));
  // The sender's email is drawn nowhere but the foot (the name is also the masthead's wordmark).
  const footTop = Math.min(...texts.filter((o) => /^accounts@anupress\.example$/.test(o.text)).map((o) => pdf.height - o.y));
  const lowest = Math.max(...texts.filter((o) => !inFoot.test(o.text) && !pageNo.test(o.text)).map((o) => pdf.height - o.y));
  ok('the body never reaches the foot', lowest < footTop - 12);
}
{
  // A long registration sentence wraps inside its column and makes the foot taller, rather than
  // being cut at the column's edge — every word of it is drawn.
  const legalText = 'Registered in England and Wales under company number 12345678, registered office as above, VAT registration GB 481 2739 55. Managing director: Alex Mustermann.';
  const { draft, settings } = doc('ledger', {}, { legalText });
  const page = drawn(layoutInvoice(draft, settings))[0];
  const words = legalText.split(/\s+/);
  ok('every word of a long legal line is drawn', words.every((w) => page.some((t) => t.includes(w))));
  ok('across several lines', page.filter((t) => /Registered in England|company number|registered office|VAT registration|Managing director/.test(t)).length >= 3);
}
{
  const { draft, settings } = doc('ledger', { shipTo: { name: 'Harbour Lane Bakery, Goods In', street1: 'Unit 4, Mill Road', city: 'Bristol', postcode: 'BS5 9RG', country: 'GB' } });
  const page = drawn(layoutInvoice(draft, settings))[0];
  ok('the delivery address is printed beside the totals', page.includes('SHIP TO') && page.includes('Unit 4, Mill Road'));
}
{
  const { draft, settings } = doc('ledger');
  draft.status = 'paid';
  const page = drawn(layoutInvoice(draft, settings))[0];
  ok('the status sits on the heading row', page.includes('PAID'));
}
{
  // A till roll keeps its own single column: the ledger is a sheet's layout.
  const { draft, settings } = doc('ledger');
  const pdf = layoutInvoice(draft, { ...settings, paperSize: 'receipt80' });
  const page = drawn(pdf)[0];
  ok('a till roll ignores the ledger masthead', !page.includes('NUMBER') && page.includes('ANUPRESS Works'));
}

// ---------------------------------------------------------------------------------------------
// The email: the same columns, numbered
// ---------------------------------------------------------------------------------------------
{
  const { draft, settings } = doc('ledger');
  const html = documentToEmailHtml(draft, settings);
  ok('the email numbers its lines', /<th[^>]*>#<\/th>/.test(html) && /<td[^>]*>1<\/td>/.test(html) && /<td[^>]*>2<\/td>/.test(html));
  ok('and qualifies its totals', html.includes('Subtotal (net)') && html.includes('Total (gross)'));
}

// ---------------------------------------------------------------------------------------------
// The screen and the file: the renderer and both stylesheets know the pieces
// ---------------------------------------------------------------------------------------------
const render = readFileSync(_resolve(ROOT, 'src/doc/render.js'), 'utf8');
ok('the renderer moves the sender to a foot on the ledger', /inv-colophon/.test(render) && /windowed \? null : el\('section', \{ class: 'inv-parties'/.test(render));
ok('and puts the number into the grid', /L\.number/.test(render));
ok('and the delivery address beside the totals', /inv-ledger__close/.test(render));
ok('the legal line is not printed twice on screen either', /text\(sender\.legalText\) && !windowed/.test(render));

const layouts = readFileSync(_resolve(ROOT, 'src/doc/layouts.js'), 'utf8');
ok('the masthead builds the window from the client', /inv-ledger__window/.test(layouts) && /clientLines/.test(layouts));

for (const [name, path] of [['document.css', 'src/styles/document.css'], ['the HTML file', 'src/export/html-file.js']]) {
  const css = readFileSync(_resolve(ROOT, path), 'utf8');
  for (const sel of ['.inv-head.is-ledger', '.inv-ledger__top', '.inv-ledger__meta', '.inv-ledger__word', '.inv-ledger__close', '.inv-colophon', '.inv-colophon__col', '.inv-lines th.is-pos']) {
    ok(`${name} styles ${sel}`, css.includes(sel));
  }
  ok(`${name} rules the ledger's table heavily`, /is-ledger \.inv-lines th \{[^}]*border-top: 2px solid/.test(css));
  ok(`${name} stacks the foot on a phone`, /\.inv-colophon \{ grid-template-columns: 1fr; \}/.test(css));
}
const web = readFileSync(_resolve(ROOT, 'src/styles/web.css'), 'utf8');
ok('the fitted phone preview keeps the ledger’s desk layout', /is-fitted \.inv-colophon \{ grid-template-columns: repeat\(3/.test(web) && /is-fitted \.inv-ledger__top \{ flex-direction: row/.test(web));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
