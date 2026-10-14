// A Subtotal printed above a Discount row is the subtotal BEFORE that discount (1.26.2).
// The stored figures and the e-invoice keep `subtotal` (after the discount): only what is printed changes.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const t = await import(pathToFileURL(_resolve(ROOT, 'src/money/totals.js')).href);
const p = await import(pathToFileURL(_resolve(ROOT, 'src/money/tax/rates.js')).href);
const r = await import(pathToFileURL(_resolve(ROOT, 'src/doc/render.js')).href).catch(() => null);

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const R2 = (v) => Math.round(v * 100) / 100;
// What a reader adds up from the printed rows
const printedAddsUp = (x) => R2(x.subtotalBeforeDiscount - x.discountShown + (x.shipping?.amount || 0) + x.taxTotal) === x.total;

const GB = p.buildPreset('gb-vat');

// 1. The quote from the tutorial: two consulting days, a travel line, 50 off, UK VAT
const q = t.computeTotals({
  lines: [
    { id: 1, description: 'Consultancy, day rate', quantity: 2, unitPrice: 550 },
    { id: 2, description: 'Travel to the client', quantity: 1, unitPrice: 85 },
  ],
  discounts: [{ type: 'fixed_total', amount: 50 }],
  addresses: { billing: { country: 'GB' } },
}, { taxRates: GB, currency: 'GBP' });
eq('subtotal stays after the discount (stored, e-invoice)', q.subtotal, 1135);
eq('printed subtotal is before it', q.subtotalBeforeDiscount, 1185);
eq('printed discount is what was typed', q.discountShown, 50);
eq('VAT on the discounted lines', q.taxTotal, 227);
eq('total', q.total, 1362);
eq('the printed rows add up', printedAddsUp(q), true);

// 2. No discount: nothing changes
const plain = t.computeTotals({ lines: [{ id: 1, quantity: 1, unitPrice: 100 }], addresses: { billing: { country: 'GB' } } }, { taxRates: GB, currency: 'GBP' });
eq('no discount: printed subtotal is the subtotal', plain.subtotalBeforeDiscount, plain.subtotal);
eq('no discount: nothing shown', plain.discountShown, 0);

// 3. Prices include tax (a shop): 120 on the shelf, 12 off, 20% VAT
const shop = t.computeTotals({
  lines: [{ id: 1, description: 'Kettle', quantity: 1, unitPrice: 120 }],
  discounts: [{ type: 'fixed_total', amount: 12 }],
  addresses: { billing: { country: 'GB' } },
}, { taxRates: GB, currency: 'GBP', pricesIncludeTax: true });
eq('inclusive: what the customer pays', shop.total, 108);
eq('inclusive: net after the discount', shop.subtotal, 90);
eq('inclusive: net before it', shop.subtotalBeforeDiscount, 100);
eq('inclusive: the discount shown without its tax', shop.discountShown, 10);
eq('inclusive: the printed rows add up', printedAddsUp(shop), true);

// 4. A percentage discount over awkward amounts still adds up to the cent
const odd = t.computeTotals({
  lines: [{ id: 1, quantity: 3, unitPrice: 33.33 }, { id: 2, quantity: 7, unitPrice: 14.29 }],
  discounts: [{ type: 'percent', amount: 7.5 }],
  addresses: { billing: { country: 'GB' } },
}, { taxRates: GB, currency: 'GBP' });
eq('odd amounts: the printed rows add up', printedAddsUp(odd), true);
const oddInc = t.computeTotals({
  lines: [{ id: 1, quantity: 3, unitPrice: 33.33 }, { id: 2, quantity: 7, unitPrice: 14.29 }],
  discounts: [{ type: 'percent', amount: 7.5 }],
  addresses: { billing: { country: 'GB' } },
}, { taxRates: GB, currency: 'GBP', pricesIncludeTax: true });
eq('odd amounts, inclusive: the printed rows add up', printedAddsUp(oddInc), true);

console.log(`subtotal-discount: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
