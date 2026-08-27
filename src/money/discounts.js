// Discounts, and the one thing about them that is easy to get wrong.
//
// A discount is not just a smaller total. It reduces the TAXABLE BASE, so a flat "$50 off" against
// an order containing both standard-rated and zero-rated lines has to be spread across those lines
// before tax is worked out, or the tax will be right for a total nobody is being charged. That is
// why apportion() exists and why fixed discounts are distributed rather than simply subtracted at
// the end.
//
// Types, in WooCommerce's vocabulary:
//   percent      a percentage off the lines it applies to
//   fixed_total  a flat amount off the order, spread proportionally across the lines
//   fixed_line   a flat amount off each line it applies to
//
// And its one genuinely surprising setting: whether several discounts are applied SEQUENTIALLY —
// each one to what is left after the previous — or all measured against the original price. Two
// 10% discounts are 19% off sequentially and 20% off otherwise, and shops mean both.

import { roundTo } from './currency.js';

/**
 * Split a total across weights so the parts sum to exactly the total.
 *
 * The obvious implementation — round each share independently — loses or gains a penny, and on an
 * invoice that penny is a line that does not add up. So the shares are rounded down and whatever is
 * left over is handed to the largest weight, which is the least visible place to put it.
 */
export function apportion(total, weights, dp = 2, mode = 'halfUp') {
  const list = (weights || []).map((w) => (isFinite(w) ? Math.max(0, w) : 0));
  const sumWeights = list.reduce((a, b) => a + b, 0);
  if (!list.length) return [];
  if (sumWeights === 0) {
    // Nothing to weight by: give it all to the first, rather than dividing by zero or silently
    // dropping the amount.
    return list.map((_, i) => (i === 0 ? roundTo(total, dp, mode) : 0));
  }

  const parts = list.map((w) => roundTo((total * w) / sumWeights, dp, mode));
  const allocated = parts.reduce((a, b) => a + b, 0);
  const drift = roundTo(total - allocated, dp, mode);
  if (drift !== 0) {
    let biggest = 0;
    for (let i = 1; i < list.length; i++) if (list[i] > list[biggest]) biggest = i;
    parts[biggest] = roundTo(parts[biggest] + drift, dp, mode);
  }
  return parts;
}

const appliesToLine = (discount, line) => {
  const only = discount.appliesTo;
  if (!only || !only.length) return true;
  return only.includes(line.id);
};

/**
 * Work out what each line loses to the order's discounts.
 *
 * Returns the amount taken off each line (in the same order as `lines`) plus a summary per discount
 * for the document to print. Line-level discounts — a percentage typed against one row — are the
 * caller's business and are already reflected in the base passed in here.
 */
export function applyDiscounts(lines, discounts, { sequential = false, dp = 2, mode = 'halfUp' } = {}) {
  const bases = lines.map((l) => (isFinite(l.base) ? l.base : 0));
  const taken = lines.map(() => 0);
  const summary = [];

  for (const d of discounts || []) {
    if (!d) continue;
    const amount = Number(d.amount);
    if (!isFinite(amount) || amount === 0) continue;

    // Which lines this discount can touch, and what is left of them to discount. Sequential means
    // "what remains after earlier discounts"; otherwise every discount is measured against the
    // original price, so two 10%s really are 20%.
    const eligible = lines.map((l, i) => (appliesToLine(d, l) ? i : -1)).filter((i) => i >= 0);
    if (!eligible.length) continue;
    const remaining = eligible.map((i) => (sequential ? Math.max(0, bases[i] - taken[i]) : bases[i]));
    const pool = remaining.reduce((a, b) => a + b, 0);
    if (pool <= 0) continue;

    let shares;
    if (d.type === 'percent') {
      shares = remaining.map((r) => (r * amount) / 100);
    } else if (d.type === 'fixed_line') {
      shares = remaining.map((r) => Math.min(r, amount));
    } else {
      // fixed_total: spread across the eligible lines in proportion to what they are worth, and
      // never take more off the order than the order is worth.
      shares = apportion(Math.min(amount, pool), remaining, dp, mode);
    }

    let applied = 0;
    eligible.forEach((lineIndex, k) => {
      // A discount can never take a line below zero — otherwise a generous coupon turns into a
      // negative taxable base and the tax goes the wrong way.
      const headroom = Math.max(0, bases[lineIndex] - taken[lineIndex]);
      const share = Math.min(headroom, Math.max(0, shares[k]));
      taken[lineIndex] = roundTo(taken[lineIndex] + share, dp, mode);
      applied += share;
    });

    summary.push({
      id: d.id || null,
      code: d.code || null,
      label: d.label || d.code || (d.type === 'percent' ? `${amount}% off` : 'Discount'),
      type: d.type || 'fixed_total',
      amount: roundTo(applied, dp, mode),
    });
  }

  return {
    perLine: taken,
    discounts: summary,
    total: roundTo(taken.reduce((a, b) => a + b, 0), dp, mode),
  };
}
