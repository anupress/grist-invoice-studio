import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const t = await import(pathToFileURL(_resolve(ROOT, 'src/money/totals.js')).href);
const p = await import(pathToFileURL(_resolve(ROOT, 'src/money/tax/rates.js')).href);

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };

const GB = p.buildPreset('gb-vat');
const IN_MH = p.buildPreset('in-gst', { homeState: 'MH' });
const CA = p.buildPreset('ca-gst');
const AU = p.buildPreset('au-gst');

const taxNames = (r) => r.taxLines.map((l) => [l.name, l.amount]);

// =============================================================================================
// 1. A UK consultancy. Tax exclusive, the ordinary case.
// =============================================================================================
const uk = t.computeTotals({
  lines: [
    { id: 1, description: 'Design work', quantity: 1, unitPrice: 1200 },
    { id: 2, description: 'Hosting', quantity: 12, unitPrice: 15 },
  ],
  addresses: { billing: { country: 'GB' } },
}, { taxRates: GB, currency: 'GBP' });

eq('subtotal', uk.subtotal, 1380);
eq('VAT at 20%', uk.taxTotal, 276);
eq('total', uk.total, 1656);
eq('itemised as one VAT line', taxNames(uk), [['VAT', 276]]);
eq('and the lines carry their own share', uk.lines.map((l) => l.tax), [240, 36]);
eq('nothing is provisional any more', uk.provisional, false);

// Part payment
const part = t.computeTotals({
  lines: [{ id: 1, quantity: 1, unitPrice: 1200 }, { id: 2, quantity: 12, unitPrice: 15 }],
  addresses: { billing: { country: 'GB' } },
  amountPaid: 500,
}, { taxRates: GB, currency: 'GBP' });
eq('a deposit leaves a balance', part.balance, 1156);
eq('and the total is unchanged by it', part.total, 1656);

// =============================================================================================
// 2. Australia, tax INCLUSIVE. The invariant: the advertised price is what is charged.
// =============================================================================================
const au = t.computeTotals({
  lines: [{ id: 1, description: 'Consultation', quantity: 1, unitPrice: 110 }],
  addresses: { billing: { country: 'AU' } },
}, { taxRates: AU, currency: 'AUD', pricesIncludeTax: true });

eq('the net is backed out of the gross', au.subtotal, 100);
eq('the GST that was inside it', au.taxTotal, 10);
eq('and the customer pays exactly what was advertised', au.total, 110);

// The case that breaks naive implementations: £9.99 inclusive of 20% VAT. Computing net and tax
// independently and rounding both gives 8.33 + 1.67 = 10.00, and the shelf price is gone.
const nineNinetyNine = t.computeTotals({
  lines: [{ id: 1, quantity: 1, unitPrice: 9.99 }],
  addresses: { billing: { country: 'GB' } },
}, { taxRates: GB, currency: 'GBP', pricesIncludeTax: true });
eq('9.99 inclusive still totals 9.99', nineNinetyNine.total, 9.99);
eq('with the tax taken out of it, not added to it', nineNinetyNine.taxTotal, 1.67);
eq('and the net making up the difference exactly', nineNinetyNine.subtotal, 8.32);
eq('which is the invariant, stated as arithmetic', nineNinetyNine.subtotal + nineNinetyNine.taxTotal, 9.99);

// =============================================================================================
// 3. India, intra-state. The document must show CGST and SGST separately.
// =============================================================================================
const intra = t.computeTotals({
  lines: [{ id: 1, description: 'Software licence', quantity: 1, unitPrice: 1000 }],
  addresses: { billing: { country: 'IN', state: 'MH' } },
}, { taxRates: IN_MH, currency: 'INR' });

eq('split in two, and shown split', taxNames(intra), [['CGST', 90], ['SGST', 90]]);
eq('adding to the full rate', intra.taxTotal, 180);
eq('total', intra.total, 1180);

const inter = t.computeTotals({
  lines: [{ id: 1, quantity: 1, unitPrice: 1000 }],
  addresses: { billing: { country: 'IN', state: 'KA' } },
}, { taxRates: IN_MH, currency: 'INR' });
eq('to another state, one IGST line', taxNames(inter), [['IGST', 180]]);
eq('at the same total', inter.total, 1180);

// Some documents must not collapse a split tax; some businesses would rather they did.
const collapsed = t.computeTotals({
  lines: [{ id: 1, quantity: 1, unitPrice: 1000 }],
  addresses: { billing: { country: 'IN', state: 'MH' } },
}, { taxRates: IN_MH, currency: 'INR', displayTaxTotals: 'single' });
eq('collapsed to one line on request', taxNames(collapsed), [['Tax', 180]]);
eq('but the detail is still there underneath', collapsed.taxDetail.length, 2);

// =============================================================================================
// 4. Quebec. A compound tax, where adding the percentages together is wrong.
// =============================================================================================
const qc = t.computeTotals({
  lines: [{ id: 1, quantity: 1, unitPrice: 100 }],
  addresses: { billing: { country: 'CA', state: 'QC' } },
}, { taxRates: CA, currency: 'CAD' });
eq('GST then QST on top of it', taxNames(qc), [['GST', 5], ['QST', 10.47]]);
eq('total', qc.total, 115.47);
eq('a flat 14.975% would have given a different answer', 100 + Math.round(100 * 0.14975 * 100) / 100, 114.98);

// Tax lines print in the order they were APPLIED, never sorted by size. QST is charged on top of
// the GST, so listing it above the GST — which sorting by amount would do, since it is the larger
// number — would state a calculation that did not happen.
eq('the compound tax is listed after the tax it compounds on', qc.taxLines.map((l) => l.name), ['GST', 'QST']);
eq('and is marked as compound', qc.taxLines.map((l) => l.compound), [false, true]);

// =============================================================================================
// 5. Discount, shipping and tax together — the order of operations.
// =============================================================================================
const full = t.computeTotals({
  lines: [
    { id: 1, description: 'Widget', quantity: 1, unitPrice: 100 },
    { id: 2, description: 'Gadget', quantity: 1, unitPrice: 100 },
  ],
  addresses: { billing: { country: 'GB' } },
  discounts: [{ type: 'fixed_total', amount: 50, label: 'Spring offer' }],
  shipping: 10,
}, { taxRates: GB, currency: 'GBP' });

eq('the discount comes off before tax', full.subtotal, 150);
eq('and is reported', full.discountTotal, 50);
eq('shipping is charged', full.shipping.amount, 10);
// 20% of 150 plus 20% of the shipping — the rate row says it applies to shipping.
eq('tax covers the discounted lines and the shipping', full.taxTotal, 32);
eq('total', full.total, 192);
eq('the shipping tax is visible on its own', full.shipping.tax, 2);

// A rate that does not apply to shipping leaves it untaxed.
const noShipTax = t.computeTotals({
  lines: [{ id: 1, quantity: 1, unitPrice: 100 }],
  addresses: { billing: { country: 'US', state: 'CA' } },
  shipping: 10,
}, { taxRates: [{ country: 'US', state: 'CA', rate: 10, name: 'Sales tax', priority: 1, shipping: false }], currency: 'USD' });
eq('shipping is not always taxable', noShipTax.taxTotal, 10);
eq('and the total reflects that', noShipTax.total, 120);

// =============================================================================================
// 6. Where you round changes the answer, which is why it is a setting.
// =============================================================================================
const rateNY = [{ country: 'US', state: 'NY', rate: 8.875, name: 'Sales tax', priority: 1 }];
const threeLines = {
  lines: [1, 2, 3].map((id) => ({ id, quantity: 1, unitPrice: 10 })),
  addresses: { billing: { country: 'US', state: 'NY' } },
};
const perLine = t.computeTotals(threeLines, { taxRates: rateNY, currency: 'USD', roundAtSubtotal: false });
const atSubtotal = t.computeTotals(threeLines, { taxRates: rateNY, currency: 'USD', roundAtSubtotal: true });

// 8.875% of 10.00 is 0.8875. Rounded per line that is 0.89 three times; rounded once on 30.00 it
// is 2.66. One cent, on every invoice, forever — and jurisdictions specify which they want.
eq('rounded per line', perLine.taxTotal, 2.67);
eq('rounded once at the subtotal', atSubtotal.taxTotal, 2.66);
eq('so the totals genuinely differ', [perLine.total, atSubtotal.total], [32.67, 32.66]);

// =============================================================================================
// 7. Exemptions
// =============================================================================================
const reverse = t.computeTotals({
  lines: [{ id: 1, quantity: 1, unitPrice: 1000 }],
  addresses: { billing: { country: 'FR' } },
  exempt: p.reverseChargeApplies({ homeCountry: 'DE', customerCountry: 'FR', customerTaxNumber: 'FR123' }),
}, { taxRates: p.buildPreset('eu-vat'), currency: 'EUR' });

eq('a reverse-charged sale carries no tax', reverse.taxTotal, 0);
eq('and the document must say why', reverse.exempt.reason, 'Reverse charge: VAT to be accounted for by the recipient');
eq('total is the net', reverse.total, 1000);

const taxOff = t.computeTotals({
  lines: [{ id: 1, quantity: 1, unitPrice: 100 }],
  addresses: { billing: { country: 'GB' } },
}, { taxRates: GB, taxEnabled: false, currency: 'GBP' });
eq('a business not registered for tax charges none', taxOff.taxTotal, 0);
eq('and is told that is why', taxOff.exempt.reason, 'Tax is switched off for this document');

// =============================================================================================
// 7b. A flat tax figure, typed on one document
// =============================================================================================
// Sometimes the answer is not a rate: an accountant has given a figure, an old invoice is being
// reproduced, or a rounding elsewhere has to be matched exactly.
const flat = t.computeTotals({
  lines: [{ id: 1, quantity: 1, unitPrice: 1000 }],
  addresses: { billing: { country: 'GB' } },
  taxAmount: 137.5,
  taxName: 'VAT',
}, { taxRates: GB, currency: 'GBP' });

eq('the figure given is the figure charged', flat.taxTotal, 137.5);
eq('and not what the rate table would have said', flat.taxTotal !== 200, true);
eq('total', flat.total, 1137.5);
// `rate: null` is what tells the renderer to print a bare name with no percentage after it —
// "VAT", not "VAT null%".
eq('it prints without a percentage', flat.taxLines, [{ name: 'VAT', rate: null, compound: false, amount: 137.5 }]);

// Shipping is not taxed on top of a figure somebody has already worked out.
const flatShipped = t.computeTotals({
  lines: [{ id: 1, quantity: 1, unitPrice: 1000 }],
  addresses: { billing: { country: 'GB' } },
  shipping: 50, taxAmount: 100,
}, { taxRates: GB, currency: 'GBP' });
eq('a flat figure is the whole tax', flatShipped.taxTotal, 100);
eq('with shipping simply added', flatShipped.total, 1150);

// Zero is a real answer and means zero, not "work it out".
eq('a flat zero charges nothing', t.computeTotals({
  lines: [{ id: 1, quantity: 1, unitPrice: 1000 }], addresses: { billing: { country: 'GB' } }, taxAmount: 0,
}, { taxRates: GB }).taxTotal, 0);
// Absent means "use the rates", which is different again.
eq('no figure means use the table', t.computeTotals({
  lines: [{ id: 1, quantity: 1, unitPrice: 1000 }], addresses: { billing: { country: 'GB' } },
}, { taxRates: GB }).taxTotal, 200);

// =============================================================================================
// 8. Which address the tax follows
// =============================================================================================
const twoAddresses = {
  lines: [{ id: 1, quantity: 1, unitPrice: 100 }],
  addresses: { billing: { country: 'GB' }, shipping: { country: 'DE' } },
};
const rates = [...GB, ...p.buildPreset('eu-vat')];
eq('billing by default', t.computeTotals(twoAddresses, { taxRates: rates }).taxTotal, 20);
eq('shipping when asked', t.computeTotals(twoAddresses, { taxRates: rates, taxBasedOn: 'shipping' }).taxTotal, 19);
// An address with nothing in it is not an address — falling through is what lets a document that
// only records one of the two still be taxed correctly.
eq('an empty billing address falls through to shipping',
  t.computeTotals({ ...twoAddresses, addresses: { billing: {}, shipping: { country: 'DE' } } }, { taxRates: rates }).taxTotal, 19);

// =============================================================================================
// 9. Line-level detail
// =============================================================================================
const perLineDiscount = t.computeTotals({
  lines: [{ id: 1, quantity: 2, unitPrice: 100, lineDiscount: { type: 'percent', amount: 10 } }],
  addresses: { billing: { country: 'GB' } },
}, { taxRates: GB });
eq('a discount on one line', perLineDiscount.subtotal, 180);
eq('taxed on what is left', perLineDiscount.taxTotal, 36);

const mixedClasses = t.computeTotals({
  lines: [
    { id: 1, quantity: 1, unitPrice: 100, taxClass: '' },
    { id: 2, quantity: 1, unitPrice: 100, taxClass: 'zero' },
  ],
  addresses: { billing: { country: 'GB' } },
}, { taxRates: GB });
eq('a zero-rated line is not taxed', mixedClasses.taxTotal, 20);
eq('while the standard one is', mixedClasses.lines.map((l) => l.tax), [20, 0]);

const storedAmount = t.computeTotals({
  lines: [{ id: 1, quantity: 3, unitPrice: 10, amount: 25 }],
  addresses: { billing: { country: 'GB' } },
}, { taxRates: GB });
eq('a stored line total beats quantity times price', storedAmount.subtotal, 25);

// =============================================================================================
// 10. Degenerate input should degrade, not explode
// =============================================================================================
const empty = t.computeTotals({}, {});
eq('no lines at all', [empty.subtotal, empty.taxTotal, empty.total], [0, 0, 0]);
eq('and no tax lines to show', empty.taxLines, []);
eq('no rate table means no tax', t.computeTotals({ lines: [{ id: 1, quantity: 1, unitPrice: 50 }] }, {}).total, 50);
eq('a line with nothing on it', t.computeTotals({ lines: [{ id: 1 }] }, {}).total, 0);
eq('a negative quantity cannot make a negative line', t.computeTotals({ lines: [{ id: 1, quantity: -2, unitPrice: 10 }] }, {}).subtotal, 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
