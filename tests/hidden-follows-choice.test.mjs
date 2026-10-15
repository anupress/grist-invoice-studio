// The advice about columns hidden from their pages follows the tables chosen in the Data drawer (1.26.10).
// It was worked out on load and on Refresh only, so after pointing the widget at your own tables and
// pinning their columns, the drawer still described the columns of the tables it had guessed first.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const main = readFileSync(_resolve(ROOT, 'src/main.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

const at = main.indexOf('const persist = async (note) =>');
const persist = main.slice(at, main.indexOf('};', at));
ok('a choice in the Data drawer re-reads the hidden columns', /await probeHidden\(\)/.test(persist));
ok('after the tables are worked out again, before the redraw', persist.indexOf('rescan()') < persist.indexOf('probeHidden()') && persist.indexOf('probeHidden()') < persist.indexOf('render()'));
ok('and a page layout that cannot be read does not stop the save', /probeHidden\(\)\.catch\(/.test(persist));

console.log(`hidden-follows-choice: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
