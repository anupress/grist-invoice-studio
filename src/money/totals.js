// The pipeline: lines in, an invoice's figures out.
//
// Everything else in ./money is a piece of this. The order below is not arbitrary — each step
// changes the base the next one works on, and swapping any two of them produces figures that are
// wrong in a way nobody notices until an accountant does:
//
//   1. line base            quantity x unit price
//   2. line discount        a percentage or amount against that one line
//   3. order discounts      spread ACROSS lines, so each line's taxable base falls correctly
//   4. shipping             zone, method, formula
//   5. tax                  per line by its class, plus shipping where the rate says so
//   6. rounding             per line, or once at the subtotal — a setting, because jurisdictions differ
//   7. totals               and what is still owed
//
// Nothing here knows about a country. Tax is whatever rows the rate table matched.

import { roundTo, currencyDecimals } from './currency.js';
import { matchRates, computeTaxOn, netFromGross } from './tax/engine.js';
import { applyDiscounts, apportion } from './discounts.js';
import { computeShipping } from './shipping.js';

export const DEFAULT_SETTINGS = {
  taxEnabled: true,
  taxRates: [],
  pricesIncludeTax: false,
  taxBasedOn: 'billing',        // billing | shipping | base
  roundAtSubtotal: false,
  roundingMode: 'halfUp',
  decimals: null,               // null = whatever the currency itself uses
  currency: 'USD',
  shippingTaxClass: '',         // '' standard, or 'inherit' to follow the items being shipped
  sequentialDiscounts: false,
  displayTaxTotals: 'itemized', // itemized | single
};

const numOr = (v, fallback = 0) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isFinite(n) ? n : fallback;
};

/** Which address the tax is worked out against, falling back rather than failing. */
function taxAddress(addresses = {}, basedOn = 'billing') {
  const order = basedOn === 'shipping' ? ['shipping', 'billing', 'base']
    : basedOn === 'base' ? ['base', 'billing', 'shipping']
      : ['billing', 'shipping', 'base'];
  for (const key of order) {
    const a = addresses[key];
    // An address with nothing in it is not an address. Falling through to the next one is what
    // lets a document that only records a billing country still be taxed correctly.
    if (a && (a.country || a.state || a.postcode)) return a;
  }
  return {};
}

/** The base of one line before any order-level discount: quantity x price, less its own discount. */
function lineBase(line) {
  const quantity = numOr(line.quantity, 1);
  const unitPrice = numOr(line.unitPrice, 0);
  // A stored amount wins over the multiplication, because a formula column may carry a rounding
  // rule or an agreed figure that quantity x price does not reproduce.
  let base = line.amount != null && line.amount !== '' ? numOr(line.amount) : quantity * unitPrice;

  const d = line.lineDiscount;
  if (d && isFinite(Number(d.amount)) && Number(d.amount) !== 0) {
    const amt = Number(d.amount);
    base -= d.type === 'percent' ? (base * amt) / 100 : Math.min(base, amt);
  }
  return { quantity, unitPrice, base: Math.max(0, base) };
}

const taxKey = (t) => `${t.name}|${t.rate}|${t.compound ? 1 : 0}`;

/**
 * Everything an invoice needs to state, computed once.
 *
 * Returns raw numbers, not strings: formatting is the renderer's job and doing it here would make
 * the figures impossible to test and impossible to add up.
 */
export function computeTotals(input = {}, settings = {}) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const dp = s.decimals == null ? currencyDecimals(s.currency) : s.decimals;
  const mode = s.roundingMode;
  const R = (v) => roundTo(v, dp, mode);

  const rawLines = Array.isArray(input.lines) ? input.lines : [];
  const address = taxAddress(input.addresses, s.taxBasedOn);
  const notes = [];

  // ---- 1 & 2. line bases -------------------------------------------------------------------
  const prepared = rawLines.map((l, i) => ({ ...lineBase(l), source: l, id: l.id != null ? l.id : i }));

  // ---- 3. order discounts, spread across the lines ------------------------------------------
  const discountResult = applyDiscounts(prepared, input.discounts, {
    sequential: s.sequentialDiscounts, dp, mode,
  });

  // ---- 4. shipping ---------------------------------------------------------------------------
  const chargedBeforeShipping = prepared.reduce((a, p, i) => a + Math.max(0, p.base - discountResult.perLine[i]), 0);
  const ship = computeShipping(input.shipping == null ? 0 : input.shipping, {
    address,
    quantity: prepared.reduce((a, p) => a + p.quantity, 0),
    orderTotal: chargedBeforeShipping,
    classes: [...new Set(rawLines.map((l) => l.shippingClass || ''))],
    hasFreeShippingCoupon: !!input.hasFreeShippingCoupon,
  });
  if (ship.error) notes.push(ship.error);
  if (ship.note) notes.push(ship.note);

  // ---- 5. tax ---------------------------------------------------------------------------------
  const exempt = s.taxEnabled ? (input.exempt || null) : { reason: 'Tax is switched off for this document' };

  /**
   * A flat tax amount, typed on this one document.
   *
   * Sometimes the answer is not a rate at all: an accountant has given a figure, an old invoice is
   * being reproduced, or a rounding somewhere else has to be matched exactly. Rather than pretend
   * that is a rate and fight the arithmetic, the amount is taken as given and the rate table is
   * skipped entirely for this document. `rate: null` on the line is what tells the renderer to
   * print a bare name with no percentage after it.
   */
  const flatTax = !exempt && input.taxAmount != null && isFinite(Number(input.taxAmount))
    ? { name: String(input.taxName || 'Tax'), amount: Number(input.taxAmount) }
    : null;
  const aggregate = new Map();
  const addTax = (t, amount) => {
    const key = taxKey(t);
    const cur = aggregate.get(key) || { name: t.name, rate: t.rate, compound: t.compound, amount: 0 };
    cur.amount += amount;
    aggregate.set(key, cur);
  };

  const outLines = prepared.map((p, i) => {
    const orderDiscount = discountResult.perLine[i];
    const charged = Math.max(0, p.base - orderDiscount);
    const taxClass = p.source.taxClass || '';
    const matched = (exempt || flatTax) ? [] : matchRates(s.taxRates, address, taxClass);

    let net = charged;
    let taxLines = [];
    if (matched.length) {
      if (s.pricesIncludeTax) {
        // The figure entered already contains the tax, and the customer must end up paying exactly
        // that figure, so the net is derived from it rather than the other way round.
        net = netFromGross(charged, matched);
      }
      taxLines = computeTaxOn(net, matched).lines;
    }

    // Rounding per line means each line's tax is a settled figure before anything is added up.
    // Rounding at the subtotal means the aggregate is rounded once instead, which produces a
    // different total often enough that jurisdictions specify which one they want.
    const contributions = taxLines.map((t) => ({ ...t, amount: s.roundAtSubtotal ? t.amount : R(t.amount) }));
    for (const t of contributions) addTax(t, t.amount);

    const lineTax = contributions.reduce((a, t) => a + t.amount, 0);
    // For tax-inclusive pricing the invariant is that net + tax === the price on the shelf. Deriving
    // the net back out of the rounded gross and the rounded tax is what preserves it; computing
    // both independently is what turns £9.99 into £10.00.
    const displayNet = s.pricesIncludeTax && !s.roundAtSubtotal ? R(charged) - R(lineTax) : R(net);

    return {
      id: p.id,
      description: p.source.description || '',
      quantity: p.quantity,
      unitPrice: p.unitPrice,
      taxClass,
      base: R(p.base),
      discount: R(orderDiscount),
      net: displayNet,
      tax: R(lineTax),
      total: R(displayNet + lineTax),
      taxLines: contributions.map((t) => ({ ...t, amount: R(t.amount) })),
      itemised: true,
    };
  });

  // Shipping tax. Only rates that say they apply to shipping do, which is a per-row flag because in
  // some places shipping is taxed and in others it plainly is not.
  let shippingTax = 0;
  if (!exempt && !flatTax && ship.amount) {
    const shipClass = s.shippingTaxClass === 'inherit'
      ? (rawLines.find((l) => l.taxClass)?.taxClass || '')
      : s.shippingTaxClass;
    const shipRates = matchRates(s.taxRates, address, shipClass).filter((r) => r.shipping !== false);
    if (shipRates.length && ship.taxable !== false) {
      const res = computeTaxOn(ship.amount, shipRates);
      for (const t of res.lines) addTax(t, s.roundAtSubtotal ? t.amount : R(t.amount));
      shippingTax = s.roundAtSubtotal ? res.total : R(res.total);
    }
  }

  // ---- 6. rounding of the aggregates ---------------------------------------------------------
  // Insertion order, deliberately — NOT sorted by amount.
  //
  // computeTaxOn emits non-compound rates first and compound rates after, in priority order, which
  // is the order they were actually applied in. A document has to read the same way: Quebec's QST
  // is charged on top of the federal GST, so printing it above the GST because it happens to be the
  // larger number states a calculation that did not happen. The Map preserves the order they were
  // added in, and every line adds them by the same rule, so this is stable across lines too.
  const taxDetail = flatTax
    ? [{ name: flatTax.name, rate: null, compound: false, amount: R(flatTax.amount) }].filter((t) => t.amount !== 0)
    : [...aggregate.values()]
      .map((t) => ({ ...t, amount: R(t.amount) }))
      .filter((t) => t.amount !== 0);

  const taxTotal = R(taxDetail.reduce((a, t) => a + t.amount, 0));

  // ---- 7. totals -------------------------------------------------------------------------------
  let subtotal = R(outLines.reduce((a, l) => a + l.net, 0));
  if (s.pricesIncludeTax && s.roundAtSubtotal) {
    // Same invariant as above, applied once instead of per line: whatever was advertised is what is
    // charged, so the subtotal is what is left after the rounded tax comes out of it.
    const grossTotal = R(outLines.reduce((a, l) => a + l.net + l.tax, 0));
    subtotal = R(grossTotal - taxTotal);
  }

  const shippingTotal = R(ship.amount);
  const discountTotal = discountResult.total;
  const total = R(subtotal + shippingTotal + taxTotal);
  const amountPaid = R(numOr(input.amountPaid));

  return {
    currency: s.currency,
    decimals: dp,
    lines: outLines,
    subtotal,
    discountTotal,
    discounts: discountResult.discounts,
    shipping: { amount: shippingTotal, label: ship.label || 'Shipping', tax: R(shippingTax), zone: ship.zone || null, method: ship.method || null },
    // `single` collapses the itemisation to one line, which is what a small business usually wants
    // and what some documents must not do — a split tax has to be shown split.
    taxLines: s.displayTaxTotals === 'single' && taxDetail.length
      ? [{ name: 'Tax', rate: null, compound: false, amount: taxTotal }]
      : taxDetail,
    taxDetail,
    taxTotal,
    taxAddress: address,
    exempt: exempt ? { reason: exempt.reason || 'Not subject to tax' } : null,
    pricesIncludeTax: !!s.pricesIncludeTax,
    total,
    amountPaid,
    balance: R(total - amountPaid),
    notes,
    provisional: false,
  };
}

export { apportion };
