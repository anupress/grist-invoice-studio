// The composer's totals box shows the totals of the lines it shows (1.26.7). It painted them once,
// from the draft it was handed, and repainted only on an edit; a line added by a button arrived
// through a rebuild before the draft was recalculated, so after Add interest the box still read the
// old total while the document beside it had the new one. render() now recalculates first.
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const d = await import(pathToFileURL(_resolve(ROOT, 'src/model/draft.js')).href);

let pass = 0, fail = 0;
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

// recalc works on the draft it is given, so a composer holding that draft sees the new totals
const settings = { money: { currency: 'GBP', taxMode: 'simple', taxRate: 20, taxName: 'VAT', format: {} } };
const draft = d.normaliseDraft({ kind: 'invoice', lines: [{ description: 'Work', quantity: 1, unitPrice: 100 }] });
const held = d.recalc(draft, settings);
ok('recalc returns the same draft', held === draft);
const before = draft.totals.total;
draft.lines.push({ description: 'Late payment interest', quantity: 1, unitPrice: 10 });
d.recalc(draft, settings);
ok('and its totals follow a line added without an edit', draft.totals.total > before);

// render() recalculates the draft before it builds the composer
const src = readFileSync(_resolve(ROOT, 'src/main.js'), 'utf8');
const branch = src.indexOf("if (app.mode === 'compose' && app.draft) {");
const built = src.indexOf('renderComposer({', branch);
const again = src.indexOf('recalc(app.draft', branch);
ok('the compose branch exists', branch > 0 && built > branch);
ok('it recalculates the draft before renderComposer', again > branch && again < built);

console.log(`composer-totals: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
