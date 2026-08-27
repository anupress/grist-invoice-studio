// Taking sold items off stock.
//
// The most destructive thing in this project, so it is the most constrained. Three rules, and each
// exists because the alternative silently corrupts a real inventory:
//
//   OPT IN.       Off unless a business turns it on. Plenty of people keep a product table purely
//                 as a price list and would be baffled to find their numbers moving.
//   ONCE ONLY.    An invoice records that its stock has been taken, and one that has been is never
//                 adjusted again. Saving an invoice twice — which is an ordinary thing to do — must
//                 not take the goods off twice.
//   NEVER BELOW ZERO. Unless explicitly allowed. A negative stock figure is not a small error; it
//                 is a number nobody can reconcile and which quietly spreads into every report.
//
// Pure, like every other write in this project: it builds a plan, something else carries it out,
// and the plan can be shown to a person before anything moves.

const norm = (s) => String(s == null ? '' : s).trim().toLowerCase();

/**
 * Match a line to a catalogue row.
 *
 * By SKU first, because that is what a code is for, then by an exact name. Deliberately not a fuzzy
 * match: guessing that "Ducting, 100mm" is the "100mm Ducting" in the catalogue would be right most
 * of the time, and the times it was wrong would move stock on the wrong product.
 */
export function matchProduct(line, products, rows) {
  if (!products || !rows || !rows.length) return null;
  const R = products.roles;
  const desc = norm(line.description);
  if (!desc && !line.sku) return null;

  if (R.sku) {
    const bySku = rows.find((r) => norm(r[R.sku]) && (norm(r[R.sku]) === norm(line.sku) || norm(r[R.sku]) === desc));
    if (bySku) return bySku;
  }
  return rows.find((r) => norm(r[R.name]) === desc) || null;
}

/**
 * What issuing this document would do to stock.
 *
 * `already` is whether this invoice has been adjusted before — the caller reads it from the
 * document, because that is where a fact about an invoice belongs.
 */
export function buildStockPlan(draft, products, rows, opts = {}) {
  const { enabled = false, already = false, allowNegative = false } = opts;

  if (!enabled) return { ok: false, reason: 'Taking items off stock is switched off.', updates: [], problems: [], skipped: [] };
  if (already) return { ok: false, reason: 'This document has already been taken off stock.', updates: [], problems: [], skipped: [] };
  if (!products || !products.roles.stock) {
    return { ok: false, reason: 'No product table with a stock column was found.', updates: [], problems: [], skipped: [] };
  }

  const R = products.roles;
  const problems = [];
  const skipped = [];
  // Several lines can name the same product — two entries of the same item on one invoice is
  // ordinary — so quantities are accumulated per row before anything is written. Writing each line
  // separately would have the second overwrite the first rather than add to it.
  const byRow = new Map();

  for (const line of draft.lines || []) {
    const qty = Number(line.quantity) || 0;
    if (!String(line.description || '').trim() || qty <= 0) continue;

    const match = matchProduct(line, products, rows);
    if (!match) { skipped.push({ description: line.description, reason: 'not in the catalogue' }); continue; }

    const entry = byRow.get(match.id) || { row: match, quantity: 0 };
    entry.quantity += qty;
    byRow.set(match.id, entry);
  }

  const updates = [];
  for (const { row, quantity } of byRow.values()) {
    const current = Number(row[R.stock]);
    const have = isFinite(current) ? current : 0;
    const after = have - quantity;

    if (after < 0 && !allowNegative) {
      problems.push({
        product: String(row[R.name] ?? ''),
        have, wanted: quantity,
        text: `${row[R.name]}: ${quantity} sold but only ${have} in stock.`,
      });
      continue;
    }
    updates.push({ id: row.id, fields: { [R.stock]: after }, product: String(row[R.name] ?? ''), from: have, to: after });
  }

  return {
    ok: problems.length === 0 && updates.length > 0,
    table: products.table,
    updates,
    problems,
    skipped,
    reason: updates.length ? '' : 'Nothing on this document matches the catalogue.',
  };
}

/** A plain summary, for a confirmation somebody will actually read. */
export function describeStockPlan(plan) {
  if (!plan || !plan.updates.length) return plan?.reason || 'Nothing to change.';
  const parts = plan.updates.map((u) => `${u.product} ${u.from} → ${u.to}`);
  const tail = plan.skipped.length ? ` ${plan.skipped.length} line${plan.skipped.length === 1 ? '' : 's'} not in the catalogue.` : '';
  return parts.join(', ') + '.' + tail;
}
