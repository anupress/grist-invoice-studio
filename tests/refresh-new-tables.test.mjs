// A table made in Grist after the widget opened can be described in the Data drawer (1.26.8).
// Refresh named the tables the widget knew before the press, so a new table came back with no
// columns: the drawer listed it, but every role offered only "automatic" and "none in this table".
// Choosing a table in the drawer did not read it either. Now Refresh also reads the tables that are
// new since the press (src/core stays a byte-for-byte copy), and choosing an unread table reads it.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const main = readFileSync(_resolve(ROOT, 'src/main.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

const at = main.indexOf('async function doRefresh');
const refresh = main.slice(at, at + 1400);
ok('Refresh still re-reads the tables it knew', /app\.provider\.reload\(wanted\)/.test(refresh));
ok('and then reads the ones that are new since the press', /\.filter\(\(id\) => !wanted\.includes\(id\)\)/.test(refresh) && /app\.provider\.prime\(fresh\)/.test(refresh));
const p = main.indexOf('const pick = (label, key, hint)');
const pick = main.slice(p, p + 1200);
ok('choosing a table it has not read reads it', /app\.provider\.prime\(\[sel\.value\]\)/.test(pick));

console.log(`refresh-new-tables: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
