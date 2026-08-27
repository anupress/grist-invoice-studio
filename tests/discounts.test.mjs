import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const d = await import(pathToFileURL(_resolve(ROOT, 'src/money/discounts.js')).href);

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const sum = (a) => Math.round(a.reduce((x, y) => x + y, 0) * 100) / 100;

// ---------------------------------------------------------------------------------------------
// apportion — the parts must add up to the whole, exactly, or the invoice does not balance.
// ---------------------------------------------------------------------------------------------
eq('an even split of an odd amount still totals', sum(d.apportion(10, [1, 1, 1])), 10);
eq('and the leftover penny goes somewhere visible', d.apportion(10, [1, 1, 1]), [3.34, 3.33, 3.33]);
eq('proportional', d.apportion(100, [3, 1]), [75, 25]);
eq('a half-penny each still balances', d.apportion(0.03, [1, 1]), [0.01, 0.02]);
eq('and that still totals', sum(d.apportion(0.03, [1, 1])), 0.03);
eq('an uneven three-way split totals', sum(d.apportion(100, [7, 2, 1])), 100);
eq('all the weight on one line', d.apportion(50, [1, 0]), [50, 0]);
eq('no weight anywhere puts it on the first line rather than dividing by zero', d.apportion(20, [0, 0]), [20, 0]);
eq('no lines at all', d.apportion(10, []), []);

// ---------------------------------------------------------------------------------------------
// Discounts against lines
// ---------------------------------------------------------------------------------------------
const lines = [{ id: 1, base: 100 }, { id: 2, base: 100 }];

const pct = d.applyDiscounts(lines, [{ type: 'percent', amount: 10, label: '10% off' }]);
eq('a percentage comes off each line', pct.perLine, [10, 10]);
eq('and is summarised for the document', pct.discounts[0].amount, 20);

// The reason fixed discounts are spread rather than subtracted at the end: each line's TAXABLE base
// has to fall, and lines can be in different tax classes.
const fixed = d.applyDiscounts(lines, [{ type: 'fixed_total', amount: 50 }]);
eq('a flat amount is spread across the lines', fixed.perLine, [25, 25]);
eq('proportionally, not evenly', d.applyDiscounts([{ id: 1, base: 300 }, { id: 2, base: 100 }], [{ type: 'fixed_total', amount: 40 }]).perLine, [30, 10]);

eq('a per-line amount hits each line', d.applyDiscounts(lines, [{ type: 'fixed_line', amount: 15 }]).perLine, [15, 15]);

// The setting that surprises people: two 10% discounts are not 20% if they are applied in sequence.
const twoPct = [{ type: 'percent', amount: 10 }, { type: 'percent', amount: 10 }];
eq('measured against the original price, two 10%s are 20%', d.applyDiscounts(lines, twoPct).total, 40);
eq('applied in sequence, they are 19%', d.applyDiscounts(lines, twoPct, { sequential: true }).total, 38);

// A discount can never take a line below zero — a negative taxable base sends the tax the wrong way.
eq('an over-generous flat discount stops at the line value',
  d.applyDiscounts([{ id: 1, base: 50 }], [{ type: 'fixed_line', amount: 80 }]).perLine, [50]);
eq('and an over-generous order discount stops at the order value',
  d.applyDiscounts([{ id: 1, base: 50 }], [{ type: 'fixed_total', amount: 500 }]).total, 50);
eq('two discounts cannot combine past zero either',
  d.applyDiscounts([{ id: 1, base: 100 }], [{ type: 'fixed_line', amount: 80 }, { type: 'fixed_line', amount: 80 }], { sequential: true }).perLine, [100]);

// Targeting
eq('a discount can apply to one line only',
  d.applyDiscounts(lines, [{ type: 'percent', amount: 50, appliesTo: [2] }]).perLine, [0, 50]);
eq('and one that matches nothing does nothing',
  d.applyDiscounts(lines, [{ type: 'percent', amount: 50, appliesTo: [99] }]).total, 0);

// Nothing at all
eq('no discounts', d.applyDiscounts(lines, []).total, 0);
eq('undefined discounts', d.applyDiscounts(lines, undefined).total, 0);
eq('a zero discount is not a discount', d.applyDiscounts(lines, [{ type: 'percent', amount: 0 }]).discounts.length, 0);
eq('nor is a broken one', d.applyDiscounts(lines, [{ type: 'percent', amount: 'abc' }]).discounts.length, 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
