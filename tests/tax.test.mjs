import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const e = await import(pathToFileURL(_resolve(ROOT, 'src/money/tax/engine.js')).href);
const p = await import(pathToFileURL(_resolve(ROOT, 'src/money/tax/rates.js')).href);
const { roundTo } = await import(pathToFileURL(_resolve(ROOT, 'src/money/currency.js')).href);

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const close = (n, got, want, tol = 1e-9) => { if (Math.abs(got - want) < tol) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${got}\n    want ${want}`); } };
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

const names = (matched) => matched.map((r) => `${r.name} ${r.rate}`);

// ---------------------------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------------------------
eq('an empty postcode spec matches anything', e.postcodeMatches('', '90210'), true);
eq('an exact postcode', e.postcodeMatches('90210', '90210'), true);
eq('a list', e.postcodeMatches('10001;10002;10003', '10002'), true);
eq('not in the list', e.postcodeMatches('10001;10002', '10009'), false);
eq('a numeric range includes its middle', e.postcodeMatches('2000...3000', '2500'), true);
eq('and excludes what is outside it', e.postcodeMatches('2000...3000', '3500'), false);
eq('range endpoints are inclusive', e.postcodeMatches('2000...3000', '3000'), true);
eq('a wildcard, ignoring the space in a UK postcode', e.postcodeMatches('SW1*', 'SW1A 1AA'), true);
eq('a wildcard that does not match', e.postcodeMatches('SW1*', 'EC1A 1BB'), false);
eq('a spec with no value to test against fails rather than matching everything', e.postcodeMatches('90210', ''), false);

eq('cities are matched case-insensitively', e.cityMatches('London;Bath', 'london'), true);
eq('a city not listed', e.cityMatches('London', 'Bristol'), false);
eq('no city spec matches anything', e.cityMatches('', 'Anywhere'), true);

// One rate per priority — the rule the whole design rests on.
const tie = [
  { country: 'US', state: '*', rate: 5, name: 'Broad', priority: 1 },
  { country: 'US', state: 'CA', rate: 9, name: 'Specific', priority: 1 },
];
eq('the more specific row wins its priority', names(e.matchRates(tie, { country: 'US', state: 'CA' })), ['Specific 9']);
eq('and the broad one applies everywhere else', names(e.matchRates(tie, { country: 'US', state: 'TX' })), ['Broad 5']);

const twoLevels = [
  { country: 'US', rate: 5, name: 'State', priority: 1 },
  { country: 'US', rate: 2, name: 'County', priority: 2 },
];
eq('different priorities both apply', names(e.matchRates(twoLevels, { country: 'US' })), ['State 5', 'County 2']);

eq('a different country does not match', e.matchRates(tie, { country: 'GB' }).length, 0);
eq('tax classes are kept apart',
  names(e.matchRates([
    { country: 'GB', rate: 20, name: 'VAT', priority: 1, class: '' },
    { country: 'GB', rate: 5, name: 'VAT', priority: 1, class: 'reduced' },
  ], { country: 'GB' }, 'reduced')), ['VAT 5']);
eq('"standard" and "" are the same class',
  e.matchRates([{ country: 'GB', rate: 20, name: 'VAT', priority: 1, class: 'standard' }], { country: 'GB' }, '').length, 1);

// ---------------------------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------------------------
const flat = e.matchRates([{ country: 'GB', rate: 20, name: 'VAT', priority: 1 }], { country: 'GB' });
close('20% of 100', e.computeTaxOn(100, flat).total, 20);
eq('itemised as one line', e.computeTaxOn(100, flat).lines.length, 1);

const compound = e.matchRates([
  { country: 'CA', rate: 5, name: 'GST', priority: 1 },
  { country: 'CA', rate: 10, name: 'PST', priority: 2, compound: true },
], { country: 'CA' });
// 5 on 100, then 10 on 105 — not 15 on 100.
close('a compound rate stacks on the tax before it', e.computeTaxOn(100, compound).total, 15.5);
close('and the multiplier reflects that', e.taxMultiplier(compound), 1.155);
close('so gross unwinds back to net', e.netFromGross(115.5, compound), 100);

close('a simple multiplier', e.taxMultiplier(flat), 1.2);
close('9.99 inclusive of 20% is 8.325 net', e.netFromGross(9.99, flat), 8.325);

eq('an exemption zeroes it', e.computeTaxOn(100, flat, { exempt: true, exemptReason: 'Reverse charge' }).total, 0);
eq('and says why', e.computeTaxOn(100, flat, { exempt: true, exemptReason: 'Reverse charge' }).exemptReason, 'Reverse charge');
eq('no matching rates is no tax', e.computeTaxOn(100, []).total, 0);

// ---------------------------------------------------------------------------------------------
// India — the worked example the priority rule exists for
// ---------------------------------------------------------------------------------------------
const india = p.buildPreset('in-gst', { homeState: 'MH' });

const intra = e.matchRates(india, { country: 'IN', state: 'MH' }, '');
eq('within your own state, GST splits in two', names(intra), ['CGST 9', 'SGST 9']);
close('and the halves add up to the full rate', e.computeTaxOn(1000, intra).total, 180);
eq('each half is shown separately, which the document must do',
  e.computeTaxOn(1000, intra).lines.map((l) => [l.name, l.amount]), [['CGST', 90], ['SGST', 90]]);

const inter = e.matchRates(india, { country: 'IN', state: 'KA' }, '');
eq('to another state it is a single IGST', names(inter), ['IGST 18']);
close('at the same total', e.computeTaxOn(1000, inter).total, 180);

const indiaReduced = e.matchRates(india, { country: 'IN', state: 'MH' }, 'reduced-5');
eq('the 5% slab splits the same way', names(indiaReduced), ['CGST 2.5', 'SGST 2.5']);
close('to 5% in total', e.computeTaxOn(1000, indiaReduced).total, 50);

// Nothing in the engine mentions India. Proof: the same rows with no home state set produce IGST
// for everyone, because there is no CGST row for the customer's state to be more specific than.
const indiaNoHome = p.buildPreset('in-gst', {});
eq('without a registered state there is nothing to split', names(e.matchRates(indiaNoHome, { country: 'IN', state: 'MH' }, '')), ['IGST 18']);

// ---------------------------------------------------------------------------------------------
// Canada — the compound worked example
// ---------------------------------------------------------------------------------------------
const canada = p.buildPreset('ca-gst');

const qc = e.matchRates(canada, { country: 'CA', state: 'QC' }, '');
eq('Quebec charges GST then QST', names(qc), ['GST 5', 'QST 9.975']);
close('QST is charged on the base plus the GST', e.computeTaxOn(100, qc).total, 15.47375);
eq('rounded for the document', roundTo(e.computeTaxOn(100, qc).total, 2), 15.47);
// The whole point: adding the percentages together gives a different, wrong answer.
eq('and a flat 14.975% would have been wrong', roundTo(100 * 0.14975, 2), 14.98);

const on = e.matchRates(canada, { country: 'CA', state: 'ON' }, '');
eq('Ontario is HST alone — the specific row displaces the federal GST at priority 1', names(on), ['HST 13']);
close('13% flat', e.computeTaxOn(100, on).total, 13);

const bc = e.matchRates(canada, { country: 'CA', state: 'BC' }, '');
eq('British Columbia is GST plus a non-compound PST', names(bc), ['GST 5', 'PST 7']);
close('which really is a flat 12', e.computeTaxOn(100, bc).total, 12);

// ---------------------------------------------------------------------------------------------
// Europe
// ---------------------------------------------------------------------------------------------
// Each member state's tax carries its own name, because that is what has to appear on the document.
const eu = p.buildPreset('eu-vat');
eq('Germany', names(e.matchRates(eu, { country: 'DE' }, '')), ['MwSt 19']);
eq('France', names(e.matchRates(eu, { country: 'FR' }, '')), ['TVA 20']);
eq('Hungary', names(e.matchRates(eu, { country: 'HU' }, '')), ['ÁFA 27']);
eq('a zero-rated line keeps the local name', names(e.matchRates(eu, { country: 'DE' }, 'zero')), ['MwSt 0']);

// Reverse charge is a condition, not a rate, so it lives outside the table.
eq('cross-border with a VAT number is reverse charged',
  !!p.reverseChargeApplies({ homeCountry: 'DE', customerCountry: 'FR', customerTaxNumber: 'FR12345678901' }), true);
eq('and it is not merely zero-rated — the document must say why',
  p.reverseChargeApplies({ homeCountry: 'DE', customerCountry: 'FR', customerTaxNumber: 'FR1' }).reason,
  'Reverse charge: VAT to be accounted for by the recipient');
eq('a domestic sale is not reverse charged',
  p.reverseChargeApplies({ homeCountry: 'DE', customerCountry: 'DE', customerTaxNumber: 'DE1' }), null);
eq('nor is one to a customer with no VAT number',
  p.reverseChargeApplies({ homeCountry: 'DE', customerCountry: 'FR', customerTaxNumber: '' }), null);
eq('nor one leaving the EU altogether',
  p.reverseChargeApplies({ homeCountry: 'DE', customerCountry: 'US', customerTaxNumber: 'X' }), null);

// ---------------------------------------------------------------------------------------------
// The simple ones
// ---------------------------------------------------------------------------------------------
eq('UK standard', names(e.matchRates(p.buildPreset('gb-vat'), { country: 'GB' }, '')), ['VAT 20']);
eq('UK reduced', names(e.matchRates(p.buildPreset('gb-vat'), { country: 'GB' }, 'reduced')), ['VAT 5']);
eq('Australia', names(e.matchRates(p.buildPreset('au-gst'), { country: 'AU' }, '')), ['GST 10']);
eq('UAE', names(e.matchRates(p.buildPreset('ae-vat'), { country: 'AE' }, '')), ['VAT 5']);

// ---------------------------------------------------------------------------------------------
// One rate, typed in — what most small businesses actually need
// ---------------------------------------------------------------------------------------------
const simple = p.simpleRate({ rate: 20, name: 'VAT' });
eq('it matches anywhere at all', names(e.matchRates(simple, { country: 'GB' }, '')), ['VAT 20']);
eq('including a country nobody listed', names(e.matchRates(simple, { country: 'ZZ' }, '')), ['VAT 20']);
eq('and with no address whatsoever', names(e.matchRates(simple, {}, '')), ['VAT 20']);
close('and it is just a rate', e.computeTaxOn(1000, e.matchRates(simple, { country: 'GB' })).total, 200);
// It is an ordinary rate ROW, so it goes through the same engine as a 27-country table. No second
// code path means no second set of rounding behaviour to disagree with the first.
eq('a zero class comes with it', names(e.matchRates(simple, { country: 'GB' }, 'zero')), ['VAT 0']);
eq('the name is what appears on the document', e.matchRates(p.simpleRate({ rate: 7, name: 'MwSt' }), {})[0].name, 'MwSt');
eq('a nonsense rate produces no rows', p.simpleRate({ rate: 'abc' }), []);

// ---------------------------------------------------------------------------------------------
// Europe, in full, and the wider world
// ---------------------------------------------------------------------------------------------
const eu27 = p.buildPreset('eu-all');
// Each member state's tax is called what it is called there. A German invoice says MwSt, not VAT.
eq('Germany calls it MwSt', names(e.matchRates(eu27, { country: 'DE' }, '')), ['MwSt 19']);
eq('France calls it TVA', names(e.matchRates(eu27, { country: 'FR' }, '')), ['TVA 20']);
eq('Italy calls it IVA', names(e.matchRates(eu27, { country: 'IT' }, '')), ['IVA 22']);
eq('the Netherlands calls it BTW', names(e.matchRates(eu27, { country: 'NL' }, '')), ['BTW 21']);
eq('and the reduced rate comes too', names(e.matchRates(eu27, { country: 'DE' }, 'reduced')), ['MwSt 7']);
eq('France reduced', names(e.matchRates(eu27, { country: 'FR' }, 'reduced')), ['TVA 10']);
// Denmark genuinely has no reduced rate, so there is no row pretending otherwise.
eq('Denmark has no reduced rate', e.matchRates(eu27, { country: 'DK' }, 'reduced').length, 0);
eq('all twenty-seven are there', new Set(eu27.map((r) => r.country)).size, 27);

const world = p.buildPreset('world');
eq('the UK', names(e.matchRates(world, { country: 'GB' }, '')), ['VAT 20']);
eq('Switzerland', names(e.matchRates(world, { country: 'CH' }, '')), ['MWST 8.1']);
eq('Norway', names(e.matchRates(world, { country: 'NO' }, '')), ['MVA 25']);
eq('Japan', names(e.matchRates(world, { country: 'JP' }, '')), ['CT 10']);
eq('Australia', names(e.matchRates(world, { country: 'AU' }, '')), ['GST 10']);
eq('Saudi Arabia', names(e.matchRates(world, { country: 'SA' }, '')), ['VAT 15']);
eq('Mexico', names(e.matchRates(world, { country: 'MX' }, '')), ['IVA 16']);
eq('and the EU is still in it', names(e.matchRates(world, { country: 'DE' }, '')), ['MwSt 19']);
ok('it covers a good deal of the world', new Set(world.map((r) => r.country)).size > 50);
// Brazil and US sales tax are deliberately absent: a plausible-looking wrong table is worse than
// an empty one that makes somebody go and look the answer up.
eq('Brazil is deliberately not guessed at', e.matchRates(world, { country: 'BR' }, '').length, 0);

// ---------------------------------------------------------------------------------------------
// The United States, where the preset is deliberately almost empty
// ---------------------------------------------------------------------------------------------
const us = p.buildPreset('us-sales');
eq('a Manhattan postcode matches the example row',
  names(e.matchRates(us, { country: 'US', state: 'NY', postcode: '10001' }, '')), ['Sales tax 8.875']);
eq('Buffalo matches nothing, which is the honest answer for a two-row table',
  e.matchRates(us, { country: 'US', state: 'NY', postcode: '14201' }, '').length, 0);
eq('and US rows do not tax shipping by default',
  e.matchRates(us, { country: 'US', state: 'CA' }, '')[0].shipping, false);

// ---------------------------------------------------------------------------------------------
// A missing address should degrade, not explode — most service invoices only know a country.
// ---------------------------------------------------------------------------------------------
eq('country-only still matches a country-level rate', names(e.matchRates(p.buildPreset('gb-vat'), { country: 'GB' })), ['VAT 20']);
eq('an empty address matches only wildcard rows',
  names(e.matchRates([{ country: '*', rate: 7, name: 'Flat', priority: 1 }], {})), ['Flat 7']);
eq('a rate row with no usable percentage is ignored',
  e.matchRates([{ country: 'GB', rate: 'abc', name: 'Bad', priority: 1 }], { country: 'GB' }).length, 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
