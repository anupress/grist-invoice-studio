import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const m = await import(pathToFileURL(_resolve(ROOT, 'src/money/currency.js')).href);

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (Object.is(got, want) || JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };

// ---------------------------------------------------------------------------------------------
// The reason this module exists: the naive Math.round(n * 100) / 100 is wrong on real money.
// 1.005 * 100 is 100.49999999999999 in binary floating point, so it rounds DOWN.
// ---------------------------------------------------------------------------------------------
eq('the classic 1.005 rounds up, not down', m.roundTo(1.005, 2), 1.01);
eq('and the naive version really is wrong', Math.round(1.005 * 100) / 100, 1);   // documents the bug
eq('2.675 too', m.roundTo(2.675, 2), 2.68);
eq('1.115', m.roundTo(1.115, 2), 1.12);
eq('8.575', m.roundTo(8.575, 2), 8.58);

// Half away from zero, so a credit note rounds symmetrically with the invoice it reverses.
eq('negatives round away from zero', m.roundTo(-1.005, 2), -1.01);
eq('-2.5 to whole', m.roundTo(-2.5, 0), -3);
eq('2.5 to whole', m.roundTo(2.5, 0), 3);

// Banker's rounding, which some jurisdictions and standards require and which gives other answers.
eq('halfEven sends 2.5 down', m.roundTo(2.5, 0, 'halfEven'), 2);
eq('halfEven sends 3.5 up', m.roundTo(3.5, 0, 'halfEven'), 4);
eq('halfEven on 1.005', m.roundTo(1.005, 2, 'halfEven'), 1);
eq('halfEven leaves non-ties alone', m.roundTo(2.51, 0, 'halfEven'), 3);

eq('up', m.roundTo(1.001, 2, 'up'), 1.01);
eq('down', m.roundTo(1.009, 2, 'down'), 1);
eq('down on a negative goes toward zero in magnitude', m.roundTo(-1.009, 2, 'down'), -1);

eq('nothing is not zero-ish, it is zero', m.roundTo(null, 2), 0);
eq('nonsense is zero', m.roundTo('abc', 2), 0);
eq('a numeric string works', m.roundTo('12.345', 2), 12.35);
eq('zero decimals', m.roundTo(1234.56, 0), 1235);
eq('already exact', m.roundTo(10, 2), 10);

// Summing rounds once at the end rather than accumulating error at each step.
eq('sum rounds once', m.sum([0.1, 0.2]), 0.3);
eq('and the raw addition really does drift', 0.1 + 0.2 === 0.3, false);
eq('sum of an empty list', m.sum([]), 0);

// ---------------------------------------------------------------------------------------------
// Currencies do not all have two decimals, and printing "¥1,400.00" is wrong, not untidy.
// ---------------------------------------------------------------------------------------------
eq('USD has two decimals', m.currencyDecimals('USD'), 2);
eq('JPY has none', m.currencyDecimals('JPY'), 0);
eq('an unknown code falls back to two', m.currencyDecimals('ZZZ'), 2);
eq('so does nonsense', m.currencyDecimals(''), 2);

// The symbol, narrow — "$", not "US$", which is what an unqualified Intl call produces outside
// the United States and what would otherwise appear on the face of every dollar invoice.
eq('USD is a dollar sign', m.currencySymbol('USD'), '$');
eq('GBP', m.currencySymbol('GBP'), '£');
eq('EUR', m.currencySymbol('EUR'), '€');
eq('INR', m.currencySymbol('INR'), '₹');

// ---------------------------------------------------------------------------------------------
// Display settings, which are the store's rather than the viewer's browser's.
// ---------------------------------------------------------------------------------------------
eq('default US style', m.formatMoney(1234.5, { currency: 'USD' }), '$1,234.50');
eq('yen carries no decimals', m.formatMoney(1400, { currency: 'JPY' }), '¥1,400');
eq('symbol on the right', m.formatMoney(1234.5, { currency: 'EUR', position: 'right' }), '1,234.50€');

// The gap is a NON-BREAKING space, on purpose: an ordinary one lets a browser wrap the number onto
// one line and the currency symbol onto the next, which on an invoice reads as a number with no
// currency at all. Asserted explicitly so nobody "fixes" it back to U+0020.
eq('with a space', m.formatMoney(1234.5, { currency: 'EUR', position: 'right_space' }), '1,234.50 €');
eq('left with a space', m.formatMoney(1234.5, { currency: 'EUR', position: 'left_space' }), '€ 1,234.50');
eq('and it really is non-breaking, not a plain space',
  m.formatMoney(1, { currency: 'EUR', position: 'right_space' }).includes(' '), false);

// A European store writing 1.234,56 is correct, and is not what a US-locale browser would produce.
eq('continental separators', m.formatMoney(1234.56, {
  currency: 'EUR', position: 'right_space', thousandSeparator: '.', decimalSeparator: ',',
}), '1.234,56 €');

eq('grouping across millions', m.formatMoney(1234567.89, { currency: 'USD' }), '$1,234,567.89');
eq('no grouping needed', m.formatMoney(12.3, { currency: 'USD' }), '$12.30');

// The minus belongs outside the symbol, which is how every other document a bookkeeper sees does it.
eq('a credit reads -$40.00', m.formatMoney(-40, { currency: 'USD' }), '-$40.00');
eq('and not $-40.00', m.formatMoney(-40, { currency: 'USD' }).includes('$-'), false);

eq('decimals can be forced', m.formatMoney(1234.5678, { currency: 'USD', decimals: 3 }), '$1,234.568');
eq('an explicit symbol wins', m.formatMoney(99, { currency: 'USD', symbol: 'US$' }), 'US$99.00');
eq('zero', m.formatMoney(0, { currency: 'USD' }), '$0.00');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
