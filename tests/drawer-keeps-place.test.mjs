// The Data drawer keeps its place when a choice in it redraws the page (1.26.9). Every choice saves
// and redraws everything; the drawer slid in again from the side, jumped back to its top, and the
// "Columns in …" section just used closed, so pinning four columns meant finding the place four times.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const main = readFileSync(_resolve(ROOT, 'src/main.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

const state = main.slice(main.indexOf('function scrollState'), main.indexOf('function restoreScroll'));
ok('the scroll state notes which drawer was open, and where', /drawer:/.test(state) && /drawerTop:/.test(state));
const render = main.slice(main.indexOf('const keep = scrollState(host);'), main.indexOf('restoreScroll(host, keep);'));
ok('the same drawer drawn again opens at once, where it was', /keep\.drawer === drawer\.getAttribute\('aria-label'\)/.test(render) && /scrollTop = keep\.drawerTop/.test(render) && /classList\.add\('is-open'\)/.test(render));
ok('the open column sections are remembered', /const openColumns = new Set\(\)/.test(main));
const cols = main.slice(main.indexOf('const columnsFor = (part, label)'), main.indexOf('const pick = (label, key, hint)'));
ok('and a section opens as it was left', /open: openColumns\.has\(part\)/.test(cols) && /addEventListener\('toggle'/.test(cols));

console.log(`drawer-keeps-place: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
