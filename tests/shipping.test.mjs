import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const x = await import(pathToFileURL(_resolve(ROOT, 'src/money/expression.js')).href);
const s = await import(pathToFileURL(_resolve(ROOT, 'src/money/shipping.js')).href);

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };

// ---------------------------------------------------------------------------------------------
// The evaluator. It exists so a cost formula out of a Grist document never reaches eval().
// ---------------------------------------------------------------------------------------------
eq('a number', x.evaluate('10'), 10);
eq('addition', x.evaluate('10 + 5'), 15);
eq('precedence', x.evaluate('2 + 3 * 4'), 14);
eq('parentheses', x.evaluate('( 2 + 3 ) * 4'), 20);
eq('nested', x.evaluate('10 + ( 2 * ( 1 + 2 ) )'), 16);
eq('subtraction', x.evaluate('10 - 3 - 2'), 5);
eq('division', x.evaluate('10 / 4'), 2.5);
eq('decimals', x.evaluate('1.5 * 4'), 6);
eq('unary minus', x.evaluate('-5 + 10'), 5);
eq('a negative in parentheses, which the fee substitution produces', x.evaluate('10 + (-2)'), 8);

// Everything that is not arithmetic is refused rather than guessed at.
eq('code is not arithmetic', x.evaluate('alert(1)'), null);
eq('nor is a property lookup', x.evaluate('window.location'), null);
eq('nor a bare identifier', x.evaluate('qty'), null);
eq('two expressions are not one', x.evaluate('10 20'), null);
eq('an unclosed bracket', x.evaluate('( 10 + 2'), null);
eq('a dangling operator', x.evaluate('10 +'), null);
eq('empty', x.evaluate(''), null);
// Infinity would render as a shipping charge of "∞", so a formula that divides by nothing is broken.
eq('division by zero is broken, not infinite', x.evaluate('10 / 0'), null);

// ---------------------------------------------------------------------------------------------
// Cost formulas, in WooCommerce's syntax
// ---------------------------------------------------------------------------------------------
eq('a plain cost', s.resolveCostFormula('12.50', {}), 12.5);
eq('nothing means nothing', s.resolveCostFormula('', {}), 0);
eq('[qty] is the number of items', s.resolveCostFormula('10 + ( 2 * [qty] )', { quantity: 6 }), 22);
eq('[qty] on its own', s.resolveCostFormula('[qty] * 3', { quantity: 4 }), 12);

eq('a percentage fee', s.resolveCostFormula('10 + [fee percent="10"]', { orderTotal: 200 }), 30);
eq('a fee floor applies when the order is small',
  s.resolveCostFormula('[fee percent="10" min_fee="4"]', { orderTotal: 20 }), 4);
eq('and does not when it is not needed',
  s.resolveCostFormula('[fee percent="10" min_fee="4"]', { orderTotal: 200 }), 20);
eq('a fee ceiling caps a large order',
  s.resolveCostFormula('[fee percent="10" max_fee="25"]', { orderTotal: 1000 }), 25);
eq('single quotes work too', s.resolveCostFormula("[fee percent='5']", { orderTotal: 200 }), 10);
eq('a broken formula is null, not zero', s.resolveCostFormula('10 + * 2', {}), null);

// ---------------------------------------------------------------------------------------------
// Zones. First match wins, which is why order matters.
// ---------------------------------------------------------------------------------------------
const zones = [
  { id: 'ca', name: 'California', regions: [{ country: 'US', state: 'CA' }], methods: [] },
  { id: 'us', name: 'United States', regions: [{ country: 'US' }], methods: [] },
  { id: 'rest', name: 'Everywhere else', regions: [], methods: [] },
];
eq('the narrow zone is found first', s.findZone(zones, { country: 'US', state: 'CA' }).id, 'ca');
eq('a broader address falls to the country zone', s.findZone(zones, { country: 'US', state: 'TX' }).id, 'us');
eq('and anything else to the catch-all', s.findZone(zones, { country: 'JP' }).id, 'rest');

// Ordered wrongly, the specific zone is unreachable — worth proving, because it is the single most
// common shipping misconfiguration there is.
const wrongOrder = [zones[1], zones[0]];
eq('a country zone above a state zone hides it', s.findZone(wrongOrder, { country: 'US', state: 'CA' }).id, 'us');

eq('a postcode region', s.zoneMatches({ regions: [{ country: 'GB', postcode: 'SW1*' }] }, { country: 'GB', postcode: 'SW1A 1AA' }), true);
eq('a postcode that does not match', s.zoneMatches({ regions: [{ country: 'GB', postcode: 'SW1*' }] }, { country: 'GB', postcode: 'M1 1AA' }), false);

// ---------------------------------------------------------------------------------------------
// Methods and classes
// ---------------------------------------------------------------------------------------------
const flat = { id: 'flat', type: 'flat_rate', label: 'Standard', cost: '5' };
eq('a flat rate', s.methodCost(flat, {}).amount, 5);

const withClasses = {
  id: 'flat', type: 'flat_rate', cost: '5',
  classCosts: { fragile: '10', bulky: '20', none: '1' },
};
eq('class costs are added to the base, and each class counts',
  s.methodCost({ ...withClasses, calculationType: 'class' }, { classes: ['fragile', 'bulky'] }).amount, 35);
eq('per order, only the dearest class counts once',
  s.methodCost({ ...withClasses, calculationType: 'order' }, { classes: ['fragile', 'bulky'] }).amount, 25);
eq('a product with no class uses the no-class cost',
  s.methodCost(withClasses, { classes: [''] }).amount, 6);
eq('an unknown class adds nothing rather than throwing',
  s.methodCost(withClasses, { classes: ['mystery'] }).amount, 5);

eq('a broken base formula reports itself', !!s.methodCost({ type: 'flat_rate', cost: '5 +' }, {}).error, true);
eq('and charges nothing rather than NaN', s.methodCost({ type: 'flat_rate', cost: '5 +' }, {}).amount, 0);

// Free shipping conditions
const free = (requires, minAmount) => ({ id: 'f', type: 'free_shipping', requires, minAmount });
eq('unconditional', s.freeShippingQualifies(free('none'), { orderTotal: 0 }), true);
eq('a minimum that is met', s.freeShippingQualifies(free('min_amount', 50), { orderTotal: 60 }), true);
eq('a minimum that is not', s.freeShippingQualifies(free('min_amount', 50), { orderTotal: 40 }), false);
eq('a coupon', s.freeShippingQualifies(free('coupon'), { hasFreeShippingCoupon: true }), true);
eq('either, satisfied by the coupon alone', s.freeShippingQualifies(free('either', 50), { orderTotal: 10, hasFreeShippingCoupon: true }), true);
eq('both, not satisfied by one', s.freeShippingQualifies(free('both', 50), { orderTotal: 10, hasFreeShippingCoupon: true }), false);
eq('both, satisfied', s.freeShippingQualifies(free('both', 50), { orderTotal: 60, hasFreeShippingCoupon: true }), true);

// ---------------------------------------------------------------------------------------------
// End to end
// ---------------------------------------------------------------------------------------------
eq('a plain number is a shipping charge', s.computeShipping(9.5, {}).amount, 9.5);
eq('so is a plain amount object', s.computeShipping({ amount: 12 }, {}).amount, 12);
eq('nothing is nothing', s.computeShipping(0, {}).amount, 0);

const config = {
  zones: [
    { id: 'uk', regions: [{ country: 'GB' }], methods: [
      { id: 'std', type: 'flat_rate', label: 'Standard', cost: '4.95' },
      { id: 'free', type: 'free_shipping', requires: 'min_amount', minAmount: 50 },
    ] },
    { id: 'world', regions: [], methods: [{ id: 'intl', type: 'flat_rate', label: 'International', cost: '19.95' }] },
  ],
};
eq('a small UK order pays the flat rate', s.computeShipping(config, { address: { country: 'GB' }, orderTotal: 20 }).amount, 4.95);
// Free shipping that has been earned always wins, because charging for it anyway is a complaint.
eq('a large one gets free shipping', s.computeShipping(config, { address: { country: 'GB' }, orderTotal: 80 }).amount, 0);
eq('and it is labelled as such', s.computeShipping(config, { address: { country: 'GB' }, orderTotal: 80 }).label, 'Free shipping');
eq('elsewhere falls to the catch-all zone', s.computeShipping(config, { address: { country: 'JP' }, orderTotal: 80 }).amount, 19.95);
eq('a named method is honoured',
  s.computeShipping({ ...config, chosen: 'std' }, { address: { country: 'GB' }, orderTotal: 80 }).amount, 4.95);

const noZone = { zones: [{ id: 'uk', regions: [{ country: 'GB' }], methods: [] }] };
eq('a zone with no methods says so', !!s.computeShipping(noZone, { address: { country: 'GB' } }).note, true);
eq('an address matching no zone says that instead', !!s.computeShipping(noZone, { address: { country: 'JP' } }).note, true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
