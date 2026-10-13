// The line at the foot that says where the document was made.
//
// This is guarded because it is load-bearing commercially rather than technically: it is what the
// free web version is paid in, and it is the reason that tool can stay unlimited and unwatermarked.
// Two things have to stay true forever. It must appear when asked for, in the language the
// document is written in — an English sentence at the foot of a German invoice is somebody else's
// brand showing through. And it must vanish completely when unticked, because a credit that
// survives being turned off is a watermark, which is the thing we said we would never do.
//
// The widget's default is OFF and the web version turns it on. Somebody who installed the widget
// on their own document is not paying us in space on their invoices.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => import(pathToFileURL(_resolve(ROOT, p)).href);

const { normaliseDraft, recalc } = await load('src/model/draft.js');
const { invoiceToPdf } = await load('src/export/pdf/invoice.js');
const { settingsFrom } = await load('src/settings/runtime.js');
const { sanitise } = await load('src/settings/store.js');
const { labels, LANGUAGES } = await load('src/doc/lang.js');
const { DEFAULT_DOCUMENT } = await load('src/settings/defaults.js');

let pass = 0, fail = 0;
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };

/** The drawn strings, readable because the writer emits uncompressed content streams. */
function pdfFor({ creditLine, language }) {
  const stored = sanitise({});
  stored.business.name = 'ANUPRESS Werke';
  stored.document.creditLine = creditLine;
  stored.document.language = language;
  const settings = settingsFrom(stored, 'invoice', null);
  const draft = normaliseDraft({
    kind: 'invoice', issued: '2026-09-07', due: '2026-10-07',
    sender: stored.business,
    client: { name: 'Baeckerei Schmidt GmbH', country: 'DE' },
    lines: [{ description: 'Beratung', quantity: 1, unitPrice: 100 }],
  });
  recalc(draft, settings);
  return Buffer.from(invoiceToPdf(draft, settings)).toString('latin1');
}

// ---------------------------------------------------------------------------------------------
// Every language has its own wording
// ---------------------------------------------------------------------------------------------
for (const l of LANGUAGES) {
  const line = labels(l.id).madeWith;
  ok(`${l.id}: there is a credit line`, typeof line === 'string' && line.length > 10);
  ok(`${l.id}: it names where to find the tool`, String(line).includes('anupress.com'));
}
ok('the languages do not all share the English sentence',
  new Set(LANGUAGES.map((l) => labels(l.id).madeWith)).size === LANGUAGES.length);

// ---------------------------------------------------------------------------------------------
// The setting decides, and the widget does not opt anyone in
// ---------------------------------------------------------------------------------------------
eq('a document carries no credit unless asked', DEFAULT_DOCUMENT.creditLine, false);
eq('and the stored shape keeps it that way', sanitise({}).document.creditLine, false);

// ---------------------------------------------------------------------------------------------
// The PDF
// ---------------------------------------------------------------------------------------------
const onDe = pdfFor({ creditLine: true, language: 'de' });
const offDe = pdfFor({ creditLine: false, language: 'de' });
const onEn = pdfFor({ creditLine: true, language: 'en' });

ok('the German PDF carries the German line', onDe.includes('Rechnungsgenerator'));
ok('the English PDF carries the English line', onEn.includes('free invoice generator'));
ok('a German document is not credited in English', !onDe.includes('free invoice generator'));
ok('turning it off removes the sentence', !offDe.includes('Rechnungsgenerator'));
ok('turning it off removes the address too', !offDe.includes('anupress.com'));
ok('the file is still a PDF', onDe.startsWith('%PDF-') && onDe.trimEnd().endsWith('%%EOF'));

// ---------------------------------------------------------------------------------------------
// On screen, and in the stylesheet: last, smallest, and never louder than the legal line
// ---------------------------------------------------------------------------------------------
const render = readFileSync(_resolve(ROOT, 'src/doc/render.js'), 'utf8');
ok('the renderer only draws it when the setting says so', /settings\.creditLine \?/.test(render));
// After the legal line and after the ledger's foot: nothing of the sender's comes after the credit.
ok('it is the last thing in the document', /legal,\s*\n\s*colophon,\s*\n\s*credit,\s*\n\s*\]\)/.test(render));

const css = readFileSync(_resolve(ROOT, 'src/styles/document.css'), 'utf8');
const size = (sel) => {
  const m = new RegExp(`\\${sel}\\s*\\{[^}]*font-size:\\s*([\\d.]+)px`).exec(css);
  return m ? parseFloat(m[1]) : null;
};
ok('the credit is styled', size('.inv-credit') != null);
ok('smaller than the legal line', size('.inv-credit') < size('.inv-legal'));

// ---------------------------------------------------------------------------------------------
// The web version turns it on; the widget never does
// ---------------------------------------------------------------------------------------------
const web = readFileSync(_resolve(ROOT, 'src/web/app.js'), 'utf8');
ok('the web version opts in', /document\.creditLine = /.test(web));
ok('and a page can turn it off with data-credit', /dataset\.credit/.test(web));
const main = readFileSync(_resolve(ROOT, 'src/main.js'), 'utf8');
ok('the widget never sets it behind the user’s back', !/creditLine\s*=/.test(main));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
