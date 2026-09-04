import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');

// print.js reaches for the DOM only inside its functions; importing it needs no window.
const print = await import(pathToFileURL(_resolve(ROOT, 'src/print.js')).href);
const { fileNameFor } = await import(pathToFileURL(_resolve(ROOT, 'src/export/html-file.js')).href);

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

// ---------------------------------------------------------------------------------------------
// The sheet: no margin, so the browser has nowhere to put its date, title, URL and page count
// ---------------------------------------------------------------------------------------------
for (const size of Object.keys(print.PAPER)) {
  const rule = print.pageRuleFor(size);
  ok(`${size}: the page margin is zero`, /margin: 0;/.test(rule.css));
  ok(`${size}: the paper is named`, rule.css.includes(`size: ${print.PAPER[size]};`));
  ok(`${size}: inside a print media block`, rule.css.startsWith('@media print { @page {'));
}
eq('a normal sheet keeps 14mm inside', print.pageRuleFor('a4').inset, '14mm');
eq('letter too', print.pageRuleFor('letter').inset, '14mm');
eq('a till roll can afford 3mm', print.pageRuleFor('receipt80').inset, '3mm');
eq('the narrow one as well', print.pageRuleFor('receipt58').inset, '3mm');
eq('an unknown size is A4', print.pageRuleFor('foolscap').css, print.pageRuleFor('a4').css);
eq('so is none', print.pageRuleFor(undefined).inset, '14mm');

// ---------------------------------------------------------------------------------------------
// The title: what Chrome names the saved PDF
// ---------------------------------------------------------------------------------------------
const draft = { kind: 'invoice', number: 'SUB-2026-0001', client: { name: 'Harbour Lane Bakery' } };
eq('the saved PDF gets the same name the Download button gives', print.printTitleFor(draft) + '.pdf', fileNameFor(draft).replace(/\.html$/, '.pdf'));
ok('and that name starts with the number', print.printTitleFor(draft).includes('SUB-2026-0001'));
ok('and carries the client', print.printTitleFor(draft).includes('Harbour-Lane-Bakery'));
ok('nothing in it a filesystem refuses', !/[\\/:*?"<>|]/.test(print.printTitleFor({ kind: 'invoice', number: 'A/B:C', client: { name: 'X <Y>' } })));
ok('a draft with nothing in it still has a name', print.printTitleFor({}).length > 0);
ok('no draft at all does too', print.printTitleFor(null).length > 0);

// ---------------------------------------------------------------------------------------------
// The stylesheets, read as text: what print hides and what it must not cut
// ---------------------------------------------------------------------------------------------
const studio = readFileSync(_resolve(ROOT, 'src/styles/studio.css'), 'utf8');
const doc = readFileSync(_resolve(ROOT, 'src/styles/document.css'), 'utf8');
const printBlocks = (css) => [...css.matchAll(/@media print \{([\s\S]*?)\n\}/g)].map((m) => m[1]).join('\n');
const sp = printBlocks(studio);
const dp = printBlocks(doc);

ok('the hint strip is not printed', /\.studio-hintbar[^{]*\{[^}]*display: none/.test(sp));
ok('nor the sample note', /\.studio-sample-note[^{]*\{[^}]*display: none/.test(sp));
ok('nor a toast', /\.ap-toast[^{]*\{[^}]*display: none/.test(sp));
ok('nor the bar', /\.studio-bar[^{]*\{[^}]*display: none/.test(sp));
ok('nor the sidebar', /\.studio-side[^{]*\{[^}]*display: none/.test(printBlocks(studio)));
ok('the frame’s header row repeats on every page', /studio-printframe > thead \{ display: table-header-group/.test(sp));
ok('and its footer row', /studio-printframe > tfoot \{ display: table-footer-group/.test(sp));
ok('each one margin tall', /studio-printframe__gap \{[^}]*height: var\(--print-inset/.test(sp));
ok('the sides get the same inset', /studio-body \{[^}]*padding: 0 var\(--print-inset/.test(sp));
ok('no stylesheet sets a page margin of its own', !/@page/.test(studio) && !/@page/.test(doc));
ok('on screen the margin rows do not exist', /\.studio-printframe__gap \{ display: none; \}/.test(studio));

ok('backgrounds print', /print-color-adjust: exact/.test(dp));
ok('a line is never cut in two', /\.inv-lines tr[^{]*\{[^}]*break-inside: avoid/.test(dp));
ok('nor the totals', /\.inv-totals[^{]*\{[^}]*break-inside: avoid/.test(dp));
ok('the column headings repeat on a second page', /\.inv-lines thead \{ display: table-header-group/.test(dp));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
