// The foot of the Ledger and DIN 5008 sheets, and the DIN remark zone.
//
// From a German user's second round: the foot has to carry the register court and the managing
// director, sit at the bottom of the paper rather than under the last line, keep its three columns
// on every printer, and not draw its column bars heavier than every other rule; and the remark zone
// above the address, which the sheet drew empty, should hold something.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => import(pathToFileURL(_resolve(ROOT, p)).href);

const F = await load('src/doc/footer.js');
const { sanitise } = await load('src/settings/store.js');
const { settingsFrom } = await load('src/settings/runtime.js');
const { normaliseDraft, recalc } = await load('src/model/draft.js');
const { layoutInvoice } = await load('src/export/pdf/invoice.js');
const { MM } = await load('src/export/pdf/writer.js');
const W = await load('src/model/write.js');
const S = await load('src/model/schema.js');
const { buildUpgradePlan } = await load('src/model/migrate.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

const SENDER = {
  name: 'Muster GmbH', street1: 'Hauptstr. 1', postcode: '10115', city: 'Berlin', country: 'DE',
  taxNumber: 'DE123456789', legalText: 'HRB 1234, AG Berlin\nGeschäftsführer: A. Muster',
  email: 'rechnung@muster.example', phone: '+49 30 1234', website: 'muster.example',
  iban: 'DE89370400440532013000', bic: '', bankName: 'Musterbank',
};
const texts = (col) => col.map((l) => l.text);

// ---------------------------------------------------------------------------------------------
// The three columns
// ---------------------------------------------------------------------------------------------
{
  const cols = F.footerColumns(SENDER, {}, { taxIdLabel: 'USt-IdNr.', lang: 'de' });
  eq('by itself, column one is the name and the address in the country’s order', texts(cols[0]), ['Muster GmbH', 'Hauptstr. 1', '10115 Berlin', 'DE']);
  ok('the name in the name’s weight', cols[0][0].strong === true);
  eq('column two is the tax number and the legal line, a line each', texts(cols[1]), ['USt-IdNr.: DE123456789', 'HRB 1234, AG Berlin', 'Geschäftsführer: A. Muster']);
  eq('column three is how to reach them', texts(cols[2]), ['rechnung@muster.example', '+49 30 1234', 'muster.example']);
}
{
  const custom = ['', '**Bank**\n{bank}\nIBAN: {iban}\nBIC: {bic}\nKontoinhaber: {accountHolder}', 'Registergericht: AG Berlin\nGeschäftsführer: A. Muster\n{oops}'];
  const cols = F.footerColumns(SENDER, { footer: custom }, { lang: 'de' });
  eq('a blank column keeps its own content', texts(cols[0])[0], 'Muster GmbH');
  eq('a typed column says what was typed, placeholders filled', texts(cols[1]), ['Bank', 'Musterbank', 'IBAN: DE89 3704 0044 0532 0130 00', 'Kontoinhaber: Muster GmbH']);
  ok('a line in double stars is bold', cols[1][0].strong === true && !cols[1][1].strong);
  ok('a line whose placeholders are all empty is left out', !texts(cols[1]).some((t) => /^BIC/.test(t)));
  eq('an unknown placeholder stays visible', texts(cols[2])[2], '{oops}');
  eq('{address} is the whole address, a line each', texts(F.fillFooter('{address}', SENDER, 'de')), ['Hauptstr. 1', '10115 Berlin', 'DE']);
  eq('{legal} keeps its lines', texts(F.fillFooter('{legal}', SENDER, 'de')), ['HRB 1234, AG Berlin', 'Geschäftsführer: A. Muster']);
}
ok('every placeholder the settings list is one the footer knows', F.FOOTER_PLACEHOLDERS.every((p) => !/\{/.test(F.fillFooter(`{${p}}`, SENDER).map((l) => l.text).join(''))));
ok('the height estimate grows with the lines', F.footerHeightEstimate([[{ text: 'a' }], [], []]) < F.footerHeightEstimate([[{ text: 'a' }, { text: 'b' }, { text: 'c' }], [], []]));
eq('and is nothing for nothing', F.footerHeightEstimate([[], [], []]), 0);

// ---------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------
eq('three empty columns by default', sanitise({}).document.footer, ['', '', '']);
eq('kept as strings, three of them', sanitise({ document: { footer: ['a', 5, 'c', 'd'] } }).document.footer, ['a', '', 'c']);
eq('capped', sanitise({ document: { footer: ['x'.repeat(2000)] } }).document.footer[0].length, 800);
const panel = readFileSync(_resolve(ROOT, 'src/settings/panel.js'), 'utf8');
ok('Settings → Document has the three boxes', /Footer \(Ledger and DIN 5008\)/.test(panel) && /document: \[documentSection, footerSection\]/.test(panel));

// ---------------------------------------------------------------------------------------------
// The PDF: the typed foot, hairline bars, the remark zone
// ---------------------------------------------------------------------------------------------
function doc(over = {}, footer = ['', '', '']) {
  const stored = sanitise({});
  Object.assign(stored.business, SENDER);
  stored.document.layout = 'din5008b';
  stored.document.footer = footer;
  stored.money.currency = 'EUR';
  const settings = settingsFrom(stored, 'invoice', null);
  const draft = recalc(normaliseDraft({
    kind: 'invoice', layout: 'din5008b', number: 'RE-1', issued: '2026-10-15', sender: stored.business,
    client: { name: 'Kunde AG', street1: 'Weg 2', postcode: '20457', city: 'Hamburg', country: 'DE' },
    lines: [{ description: 'Beratung', quantity: 1, unitPrice: 100 }],
    ...over,
  }), settings);
  return { draft, settings };
}
const drawn = (pdf) => pdf.pages[0].filter((o) => typeof o !== 'string');
const topOf = (pdf, o) => pdf.height - (o.y + o.size * 0.78);
{
  const { draft, settings } = doc({}, ['', 'Registergericht: AG Berlin\nGeschäftsführer: A. Muster', '']);
  const pdf = layoutInvoice(draft, settings);
  const T = drawn(pdf).map((o) => o.text);
  ok('the PDF prints the typed column', T.includes('Registergericht: AG Berlin') && T.includes('Geschäftsführer: A. Muster'));
  ok('and the automatic ones beside it', T.includes('Muster GmbH') && T.includes('rechnung@muster.example'));
  const bars = pdf.pages[0].filter((o) => typeof o === 'string' && / RG$/.test(o));
  ok('no column bar is drawn in heavy ink any more', !pdf.pages[0].some((o, i, a) => typeof o === 'string' && o === '1.2 w' && /0\.086 0\.129 0\.173 RG/.test(a[i - 1] || '')));
  ok('the bars are hairlines', pdf.pages[0].filter((o) => o === '0.6 w').length >= 3 && bars.length > 0);
}
{
  const { draft, settings } = doc({ addressNote: 'Einschreiben\n\nPersönlich\nVertraulich\nzu viel' });
  eq('the remark keeps three lines and drops the blank', draft.addressNote, 'Einschreiben\nPersönlich\nVertraulich');
  const pdf = layoutInvoice(draft, settings);
  const D = drawn(pdf);
  const lines = ['Einschreiben', 'Persönlich', 'Vertraulich'].map((t) => D.find((o) => o.text === t));
  ok('all three are drawn', lines.every(Boolean));
  const zoneTop = (45 + 5) * MM;
  const zoneEnd = (45 + 17.7) * MM;
  ok('inside the remark zone, between the return line and the address', lines.every((o) => topOf(pdf, o) >= zoneTop - 0.5 && topOf(pdf, o) + o.size <= zoneEnd + 0.5));
  ok('set against the bottom of the zone', zoneEnd - (topOf(pdf, lines[2]) + lines[2].size) < 4.23 * MM);
  ok('at the address’s left edge', lines.every((o) => Math.abs(o.x - 20 * MM) < 0.5));
  const name = D.find((o) => o.text === 'Kunde AG');
  ok('and the address has not moved', Math.abs(topOf(pdf, name) - zoneEnd) < 0.6);
}
{
  const { draft, settings } = doc({ addressNote: 'Einschreiben', layout: 'classic' });
  ok('only the DIN sheets have the zone', !drawn(layoutInvoice(draft, settings)).some((o) => o.text === 'Einschreiben'));
}

// ---------------------------------------------------------------------------------------------
// Kept with the invoice
// ---------------------------------------------------------------------------------------------
eq('a "Vermerk" column is the remark', S.mapRoles([{ id: 'Vermerk', type: 'Text' }], { addressNote: [/^address_?note$/i, /^(post_?)?vermerk$/i] }), { addressNote: 'Vermerk' });
{
  const schema = { invoice: { table: 'T', roles: { number: 'N', addressNote: 'AN' } } };
  const plan = W.buildWritePlan({ number: 'RE-1', addressNote: 'Einschreiben', totals: {}, lines: [] }, schema, { invoiceColumns: [{ id: 'N', type: 'Text' }, { id: 'AN', type: 'Text' }] });
  eq('it is written to its column', plan.invoice.fields.AN, 'Einschreiben');
}
{
  const schema = S.detectSchema([{ id: 'Invoices', columns: [{ id: 'InvoiceNumber', type: 'Text' }, { id: 'Client', type: 'Text' }, { id: 'Issued', type: 'Date' }] }]);
  ok('the column is not pushed on every document', !S.upgradeChecklist(schema).invoice.some((i) => i.id === 'AddressNote'));
  const plan = buildUpgradePlan(schema, { Invoices: [] }, ['AddressNote']);
  ok('but is added when asked for by name', plan.ok && plan.columns.some((c) => c.id === 'AddressNote' && c.def.type === 'Text'));
}
const composer = readFileSync(_resolve(ROOT, 'src/compose/composer.js'), 'utf8');
ok('the composer offers the field on a DIN sheet, with a button for the column', /isDin\(draft\.layout\) \? field\('Above the address'/.test(composer) && /actions\.addColumn\('AddressNote'\)/.test(composer));

// ---------------------------------------------------------------------------------------------
// The stylesheets: on screen, on paper, in the file
// ---------------------------------------------------------------------------------------------
const docCss = readFileSync(_resolve(ROOT, 'src/styles/document.css'), 'utf8');
const studio = readFileSync(_resolve(ROOT, 'src/styles/studio.css'), 'utf8');
const file = readFileSync(_resolve(ROOT, 'src/export/html-file.js'), 'utf8');
ok('small-screen rules are for screens only, so paper keeps three columns', !/@media \(max-width: 700px\)/.test(docCss) && (docCss.match(/@media screen and \(max-width: 700px\)/g) || []).length === 2);
ok('the file’s too', !/@media \(max-width: 700px\)/.test(file) && (file.match(/@media screen and \(max-width: 700px\)/g) || []).length === 2);
ok('the column bars are hairlines on screen', /\.inv-colophon__col \{ border-left: 1px solid var\(--doc-rule\)/.test(docCss));
ok('and in the file', /\.inv-colophon__col \{ border-left: 1px solid #dfe5ec/.test(file));
ok('on screen the DIN sheet is A4-shaped, its foot at the bottom', /aspect-ratio: 210 \/ 297/.test(docCss) && /> \.inv-colophon \{ margin-top: auto; \}/.test(docCss));
ok('on paper the foot is pinned to the bottom of every page', /\[data-colophon\] \.inv-colophon \{\s*position: fixed;/.test(studio));
ok('with room kept for it on every page', /tfoot \.studio-printframe__gap \{ height: calc\(var\(--foot-bottom\) \+ var\(--colophon-h/.test(studio));
ok('the DIN foot keeps the letter’s margins', /\[data-colophon="din"\] \.inv-colophon \{ left: 25mm; right: 20mm; \}/.test(studio));
const main = readFileSync(_resolve(ROOT, 'src/main.js'), 'utf8');
ok('the shell measures the foot and says which sheet it is', /setAttribute\('data-colophon', isDin\(draft\.layout\) \? 'din' : 'ledger'\)/.test(main) && /--colophon-h/.test(main));
ok('the remark zone is styled in both', /\.inv-din__remark \{/.test(docCss) && /\.inv-din__remark \{/.test(file));
ok('the Ledger and DIN files print in a frame, the foot pinned', /class="pf/.test(file) && /\.pf \.inv-colophon \{ position: fixed;/.test(file));
ok('their mastheads stretch, with no stray rule', /\.inv-head\.is-ledger \{[^}]*align-items: stretch; border-bottom: 0/.test(file) && /\.inv-head\.is-din \{[^}]*align-items: stretch/.test(file));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
