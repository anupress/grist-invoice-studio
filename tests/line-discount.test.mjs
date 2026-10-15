// A discount on one line: typed as "10%" or as an amount, kept as typed, worked out against the
// line, stored with the line, and declared to an e-invoice as a line allowance so its arithmetic
// closes. Asked for by a German business that discounts per position rather than per order.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => import(pathToFileURL(_resolve(ROOT, p)).href);

const D = await load('src/model/draft.js');
const W = await load('src/model/write.js');
const S = await load('src/model/schema.js');
const { resolveInvoice } = await load('src/model/resolve.js');
const { mergeIntoExisting, duplicateLines, combineDuplicates } = await load('src/compose/lines-grid.js');
const { lineDiscountText, fieldsFor, lineColumns } = await load('src/doc/fields.js');
const { layoutInvoice } = await load('src/export/pdf/invoice.js');
const { einvoiceModel } = await load('src/einvoice/model.js');
const { simpleRate } = await load('src/money/tax/rates.js');
const { starterTablesFor } = await load('src/templates/starter.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

// ---------------------------------------------------------------------------------------------
// Reading what was typed
// ---------------------------------------------------------------------------------------------
eq('a percentage', D.parseLineDiscount('10%'), { percent: 10 });
eq('with a space and a comma decimal', D.parseLineDiscount('2,5 %'), { percent: 2.5 });
eq('an amount', D.parseLineDiscount('25'), { amount: 25 });
eq('a comma amount', D.parseLineDiscount('12,50'), { amount: 12.5 });
eq('a leading minus is the same discount', D.parseLineDiscount('-10%'), { percent: 10 });
eq('more than everything is everything', D.parseLineDiscount('150%'), { percent: 100 });
eq('nothing', D.parseLineDiscount(''), null);
eq('nonsense', D.parseLineDiscount('ten'), null);
eq('zero is no discount', D.parseLineDiscount('0'), null);

// ---------------------------------------------------------------------------------------------
// The line's own arithmetic
// ---------------------------------------------------------------------------------------------
{
  const l = D.lineNet({ quantity: 4, unitPrice: 550, discountPercent: 10 });
  eq('10% off 4 × 550', [l.discountAmount, l.amount], [220, 1980]);
  l.unitPrice = 600; D.lineNet(l);
  eq('repriced, it is still 10% off', [l.discountAmount, l.amount], [240, 2160]);
  const a = D.lineNet({ quantity: 1, unitPrice: 1200, discountAmount: 50 });
  eq('an amount off', a.amount, 1150);
  const over = D.lineNet({ quantity: 1, unitPrice: 30, discountAmount: 50 });
  eq('never below nothing', [over.discountAmount, over.amount], [30, 0]);
}
{
  const n = D.normaliseLine({ quantity: 12, unitPrice: 85, discountPercent: 10 });
  eq('a normalised line works its discount out', [n.discountAmount, n.amount, n.discountPercent], [102, 918, 10]);
  eq('a plain line is as it was', D.normaliseLine({ quantity: 2, unitPrice: 5 }).amount, 10);
  eq('and has no percentage', D.normaliseLine({ quantity: 2, unitPrice: 5 }).discountPercent, null);
}

// ---------------------------------------------------------------------------------------------
// Totals: tax on the net of each line
// ---------------------------------------------------------------------------------------------
const settings = { money: { currency: 'EUR', taxEnabled: true, taxMode: 'simple', taxRates: simpleRate({ rate: 19, name: 'MwSt' }), homeCountry: 'DE' }, einvoice: { profile: 'en16931' } };
const draft = D.recalc(D.normaliseDraft({
  kind: 'invoice', number: 'RE-1', issued: '2026-10-15', currency: 'EUR',
  sender: { name: 'Hartmann GmbH', country: 'DE', taxNumber: 'DE123456789' },
  client: { name: 'Muster GmbH', country: 'DE' },
  lines: [
    { description: 'Beratung', quantity: 12, unitPrice: 85, discountPercent: 10 },
    { description: 'Material', quantity: 40, unitPrice: 6.5, discountAmount: 20 },
  ],
}), settings);
eq('the subtotal is the sum of the nets', draft.totals.subtotal, 918 + 240);
eq('and the tax is on it', draft.totals.taxTotal, Math.round(1158 * 0.19 * 100) / 100);

// ---------------------------------------------------------------------------------------------
// On the document
// ---------------------------------------------------------------------------------------------
const money = (v) => `€${Number(v).toFixed(2)}`;
eq('a percentage prints as one', lineDiscountText({ discountPercent: 10, discountAmount: 102 }, money), '−10%');
eq('in the document’s decimal', lineDiscountText({ discountPercent: 2.5 }, money, { decimal: ',' }), '−2,5%');
eq('an amount prints as money', lineDiscountText({ discountAmount: 20 }, money), '−€20.00');
eq('the PDF passes a hyphen', lineDiscountText({ discountAmount: 20 }, money, { minus: '-' }), '-€20.00');
eq('nothing prints nothing', lineDiscountText({}, money), '');
{
  const fields = fieldsFor(draft, settings);
  ok('the discount column appears', lineColumns(fields).some((c) => c.id === 'discount'));
  const texts = layoutInvoice(draft, settings).pages.flat().filter((o) => typeof o !== 'string').map((o) => o.text);
  ok('the PDF prints both discounts', texts.includes('-10%') && texts.some((t) => /^-.*20[.,]00$/.test(t)));
}

// ---------------------------------------------------------------------------------------------
// The e-invoice: quantity × price, less a line allowance, is the line's net
// ---------------------------------------------------------------------------------------------
{
  const m = einvoiceModel(draft, settings);
  const [a, b] = m.lines;
  eq('the first line starts from quantity × price', a.base, 1020);
  eq('its allowance is the 10%', a.allowance, 102);
  eq('and it closes', Math.round((a.base - a.allowance) * 100) / 100, a.net);
  eq('the second line closes too', [b.base, b.allowance, b.net], [260, 20, 240]);
}

// ---------------------------------------------------------------------------------------------
// Saving and reading back
// ---------------------------------------------------------------------------------------------
const schema = {
  invoice: { table: 'Invoices', roles: { number: 'N', client: 'C' } },
  line: { table: 'Items', roles: { invoiceLink: 'Invoice', description: 'D', quantity: 'Q', unitPrice: 'P', lineTotal: 'T', lineDiscount: 'Disc', lineDiscountPercent: 'DiscPct' } },
};
const invCols = [{ id: 'N', type: 'Text' }, { id: 'C', type: 'Text' }];
const lineCols = [{ id: 'Invoice', type: 'Ref:Invoices' }, { id: 'D', type: 'Text' }, { id: 'Q', type: 'Numeric' }, { id: 'P', type: 'Numeric' }, { id: 'T', type: 'Numeric' }, { id: 'Disc', type: 'Numeric' }, { id: 'DiscPct', type: 'Numeric' }];
{
  const plan = W.buildWritePlan(draft, schema, { invoiceColumns: invCols, lineColumns: lineCols });
  const [a, b] = plan.lines.adds;
  eq('the percentage line keeps both', [a.Disc, a.DiscPct, a.T], [102, 10, 918]);
  eq('the amount line keeps its amount', [b.Disc, b.DiscPct, b.T], [20, undefined, 240]);
}
{
  const existing = D.normaliseDraft({ ...draft, rowId: 7, lines: [{ rowId: 3, description: 'Beratung', quantity: 1, unitPrice: 100 }] });
  const plan = W.buildWritePlan(existing, schema, { invoiceColumns: invCols, lineColumns: lineCols });
  eq('a cleared discount on an existing line clears the cells', [plan.lines.updates[0].fields.Disc, plan.lines.updates[0].fields.DiscPct], [0, null]);
}
{
  const bare = { ...schema, line: { ...schema.line, roles: { invoiceLink: 'Invoice', description: 'D', quantity: 'Q', unitPrice: 'P', lineTotal: 'T' } } };
  const plain = D.normaliseDraft({ ...draft, rowId: 7, lines: [{ rowId: 3, description: 'x', quantity: 1, unitPrice: 1 }] });
  ok('no discount and no column: nothing to report', !W.buildWritePlan(plain, bare, { invoiceColumns: invCols, lineColumns: lineCols.slice(0, 5) }).skipped.some((s) => /lineDiscount/.test(s.role)));
  const lost = W.buildWritePlan(draft, bare, { invoiceColumns: invCols, lineColumns: lineCols.slice(0, 5) });
  ok('a discount with nowhere to go is reported', lost.skipped.some((s) => s.role === 'lineDiscount' && s.where === 'line'));
  ok('but a percentage alone is not, since the amount is the discount', !lost.skipped.some((s) => s.role === 'lineDiscountPercent'));
}
{
  // Grist's own Items table computes Total = $Price * $Quantity, knowing nothing of a Discount
  // column next to it. Read back, the line is still the net.
  const provider = {
    records: (t) => (t === 'Invoices' ? [{ id: 1, N: 'RE-1', C: 'Muster' }] : [
      { id: 10, Invoice: 1, D: 'Beratung', Q: 12, P: 85, T: 1020, Disc: 0, DiscPct: 10 },
      { id: 11, Invoice: 1, D: 'Material', Q: 40, P: 6.5, T: 260, Disc: 20, DiscPct: null },
      { id: 12, Invoice: 1, D: 'Stored net', Q: 2, P: 50, T: 90, Disc: 10, DiscPct: null },
    ]),
    columns: () => [],
  };
  const d = resolveInvoice(provider.records('Invoices')[0], schema, provider, settings);
  eq('a formula total of price × quantity loses the percentage', [d.lines[0].amount, d.lines[0].discountAmount, d.lines[0].discountPercent], [918, 102, 10]);
  eq('and the amount', [d.lines[1].amount, d.lines[1].discountAmount], [240, 20]);
  eq('a stored net total is trusted as it is', d.lines[2].amount, 90);
}

// ---------------------------------------------------------------------------------------------
// Merging lines: the same thing at the same price and the same discount
// ---------------------------------------------------------------------------------------------
{
  const d = { lines: [{ description: 'Tee', quantity: 1, unitPrice: 5, discountPercent: 10, discountAmount: 0.5, amount: 4.5 }, { description: 'Tee', quantity: 2, unitPrice: 5 }] };
  ok('a different discount is a different line', !duplicateLines(d).length);
  const same = { lines: [{ description: 'Tee', quantity: 1, unitPrice: 5, discountPercent: 10 }, { description: 'Tee', quantity: 2, unitPrice: 5, discountPercent: 10 }] };
  eq('the same percentage is the same line', duplicateLines(same), [1]);
  combineDuplicates(same);
  eq('combined, the percentage is worked out on the whole', [same.lines.length, same.lines[0].quantity, same.lines[0].amount], [1, 3, 13.5]);
  const fixed = { lines: [{ description: 'Tee', quantity: 1, unitPrice: 5, discountAmount: 1 }, { description: 'Tee', quantity: 1, unitPrice: 5, discountAmount: 1 }] };
  ok('an amount off is per line, so it is not offered for combining', !duplicateLines(fixed).length);
  ok('and choosing it again does not fold into it', mergeIntoExisting({ lines: [{ description: 'Tee', quantity: 1, unitPrice: 5, discountAmount: 1 }, { description: '', quantity: 1, unitPrice: 5 }] }, 1, 'Tee', 5).blocked === true);
}

// ---------------------------------------------------------------------------------------------
// Where it is kept
// ---------------------------------------------------------------------------------------------
ok('the line table offers a Discount column', S.UPGRADE_PLAN.line.some((i) => i.id === 'Discount' && i.role === 'lineDiscount' && !i.optional));
ok('and a percentage column, only when asked for', S.UPGRADE_PLAN.line.some((i) => i.id === 'DiscountPercent' && i.optional));
eq('"Rabatt" and "Rabatt %" are recognised', S.mapRoles([{ id: 'Rabatt', type: 'Numeric' }, { id: 'Rabatt_Prozent', type: 'Numeric' }], { lineDiscount: [/^rabatt$/i], lineDiscountPercent: [/^rabatt_?(%|prozent|satz)$/i] }), { lineDiscount: 'Rabatt', lineDiscountPercent: 'Rabatt_Prozent' });
{
  const items = starterTablesFor('freelancer', { empty: true }).find((t) => t.id === 'InvoiceItems');
  ok('a new document’s line table has both columns', ['Discount', 'DiscountPercent'].every((id) => items.columns.some((c) => c.id === id)));
}
const grid = readFileSync(_resolve(ROOT, 'src/compose/lines-grid.js'), 'utf8');
ok('the composer has a discount box per line', /discountInput/.test(grid) && /parseLineDiscount\(v\)/.test(grid));
ok('and the catalogue’s unit comes with its price', /if \(p\.unit\)/.test(grid));
ok('an empty unit box shows no grey word', /placeholder: '', ariaLabel: 'Unit'/.test(grid));

// The widget only: the free web version on anupress.com keeps the grid it had.
ok('the box is off unless asked for', /lineDiscounts = false/.test(grid) && /showDiscount \? el\('span', \{ class: 'is-num', text: 'Discount' \}\) : null/.test(grid));
ok('the widget’s composer asks for it', /lineDiscounts: true/.test(readFileSync(_resolve(ROOT, 'src/compose/composer.js'), 'utf8')));
ok('the web version does not', !/lineDiscounts/.test(readFileSync(_resolve(ROOT, 'src/web/form.js'), 'utf8')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
