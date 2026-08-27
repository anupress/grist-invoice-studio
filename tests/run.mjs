// Runs every *.test.mjs in this folder and reports one verdict.
//
// No test framework, for the same reason the widget has no runtime dependencies: this project ships
// as a static page and builds in CI with two devDependencies, so a suite that needed a third would
// be the heaviest thing in it. Each file is a plain ES module that prints its own results and exits
// non-zero on failure, which is all a runner actually needs to know.
//
// Run with `npm test`, or a single file directly with `node tests/barcode.test.mjs`.

import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(HERE).filter((f) => f.endsWith('.test.mjs')).sort();

if (!files.length) {
  console.error('No test files found in', HERE);
  process.exit(1);
}

let failed = 0;
const results = [];

for (const f of files) {
  const r = spawnSync(process.execPath, [join(HERE, f)], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const ok = r.status === 0;
  if (!ok) failed++;

  // Each suite prints its own tally; surface that line rather than re-counting it here.
  const tally = out.trim().split('\n').filter(Boolean).pop() || '(no output)';
  results.push({ file: f, ok, tally });

  // A failing suite is the only time the detail matters, so only then is it printed in full.
  if (!ok) {
    console.log(`\n--- ${f} ---`);
    console.log(out.trimEnd());
  }
}

console.log('');
for (const { file, ok, tally } of results) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${file.padEnd(30)} ${tally}`);
}
console.log('');

if (failed) {
  console.log(`${failed} of ${files.length} suites failed.`);
  process.exit(1);
}
console.log(`All ${files.length} suites passed.`);
