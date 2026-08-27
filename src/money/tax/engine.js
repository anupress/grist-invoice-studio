// The tax engine: one rate table, every jurisdiction.
//
// The obvious way to support Indian GST, EU VAT, UK VAT and US sales tax is four modules of
// bespoke logic. That is also the way to be permanently one country behind, because the fifth
// person to ask needs a fifth module and a release.
//
// WooCommerce solved this two decades ago and its answer is a TABLE. A rate is a row — country,
// state, postcode, city, percentage, a name, a priority, whether it compounds, whether it applies
// to shipping — and every tax regime on earth is a set of rows. So this file is a matcher and an
// arithmetic routine, the regional presets in ./rates are data, and a country nobody anticipated is
// a few rows somebody types in rather than a feature request.
//
// Two rules from that model carry all the subtlety and are worth stating plainly:
//
//   PRIORITY  At most ONE rate applies per priority level. That is what makes an Indian intra-state
//             invoice able to charge CGST *and* SGST (priorities 1 and 2) while an inter-state one
//             charges a single IGST — the same table, resolved differently by the customer's state,
//             with no branch anywhere in this file mentioning India.
//
//   COMPOUND  A compound rate applies on top of the base PLUS the taxes already added, rather than
//             on the base alone. Quebec's QST over GST is the standard example, and getting it
//             wrong understates the total.

/** A tax class is how one line can be taxed differently from another. '' means the standard rate. */
export const DEFAULT_TAX_CLASSES = ['', 'reduced', 'zero'];

const normClass = (c) => {
  const s = String(c == null ? '' : c).trim().toLowerCase();
  return s === 'standard' ? '' : s;
};

const normCode = (v) => String(v == null ? '' : v).trim().toUpperCase();

/** '' and '*' both mean "anywhere". */
const wildcardMatches = (spec, value) => {
  const s = normCode(spec);
  return s === '' || s === '*' || s === normCode(value);
};

const escapeRe = (s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

/**
 * Postcode matching: a semicolon-separated list of exact values, `SW1*` wildcards and `2000...3000`
 * ranges, exactly as WooCommerce's rate table accepts them.
 *
 * Ranges compare numerically when both ends and the value are numbers, and lexically otherwise, so
 * "2000...3000" behaves as a person expects while "AA...AZ" still does something sensible.
 */
export function postcodeMatches(spec, value) {
  const raw = String(spec == null ? '' : spec).trim();
  if (!raw) return true;
  const v = normCode(value).replace(/\s+/g, '');
  if (!v) return false;

  for (const part of raw.split(';').map((s) => s.trim()).filter(Boolean)) {
    if (part.includes('...')) {
      const [a, b] = part.split('...').map((s) => normCode(s).replace(/\s+/g, ''));
      const na = Number(a), nb = Number(b), nv = Number(v);
      if (isFinite(na) && isFinite(nb) && isFinite(nv)) {
        if (nv >= Math.min(na, nb) && nv <= Math.max(na, nb)) return true;
        continue;
      }
      if (v >= a && v <= b) return true;
      continue;
    }
    if (part.includes('*')) {
      const re = new RegExp('^' + escapeRe(normCode(part)).replace(/\*/g, '.*') + '$');
      if (re.test(v)) return true;
      continue;
    }
    if (normCode(part) === v) return true;
  }
  return false;
}

/** City matching: a semicolon-separated list, matched exactly but case-insensitively. */
export function cityMatches(spec, value) {
  const raw = String(spec == null ? '' : spec).trim();
  if (!raw) return true;
  const v = normCode(value);
  if (!v) return false;
  return raw.split(';').map((s) => normCode(s)).filter(Boolean).includes(v);
}

/**
 * How specifically a row addresses this customer.
 *
 * Used only to choose between rows sharing a priority. A row naming the state beats one that says
 * "any state", which is what makes a country-wide default and a regional override coexist in one
 * table — and, for India, what makes the customer's own state select CGST over IGST.
 */
function specificity(rate) {
  let score = 0;
  const w = (v) => { const s = normCode(v); return s !== '' && s !== '*'; };
  if (w(rate.country)) score += 8;
  if (w(rate.state)) score += 4;
  if (String(rate.postcode || '').trim()) score += 2;
  if (String(rate.city || '').trim()) score += 1;
  return score;
}

/**
 * The rates that apply to one address and tax class, at most one per priority, in priority order.
 *
 * `address` is `{ country, state, postcode, city }`. Any part of it may be missing — a document
 * that only knows the country still gets country-level rates, which is the common case for a
 * service business and should not require a full postal address to work.
 */
export function matchRates(rates, address = {}, taxClass = '') {
  const wanted = normClass(taxClass);
  const applicable = (rates || []).filter((r) => {
    if (!r || !isFinite(Number(r.rate))) return false;
    if (normClass(r.class) !== wanted) return false;
    if (!wildcardMatches(r.country, address.country)) return false;
    if (!wildcardMatches(r.state, address.state)) return false;
    if (!postcodeMatches(r.postcode, address.postcode)) return false;
    if (!cityMatches(r.city, address.city)) return false;
    return true;
  });

  // One winner per priority: the most specific, and where two are equally specific the one defined
  // first, so the order of a hand-edited table is predictable rather than arbitrary.
  const byPriority = new Map();
  applicable.forEach((r, index) => {
    const p = Number(r.priority) || 1;
    const current = byPriority.get(p);
    if (!current) { byPriority.set(p, { rate: r, spec: specificity(r), index }); return; }
    const spec = specificity(r);
    if (spec > current.spec) byPriority.set(p, { rate: r, spec, index });
  });

  return [...byPriority.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([priority, v]) => ({ ...v.rate, priority, rate: Number(v.rate.rate) }));
}

/**
 * Tax on a net amount, itemised.
 *
 * Non-compound rates all apply to the base. Compound rates then apply, in priority order, on top of
 * the base plus everything already added — including earlier compound rates.
 *
 * Nothing is rounded here. Rounding is the caller's decision, because whether it happens per line
 * or once at the subtotal is a setting, and rounding twice is how a document ends up a penny out.
 */
export function computeTaxOn(base, matched, opts = {}) {
  const lines = [];
  if (opts.exempt) {
    return { total: 0, lines: [], exempt: true, exemptReason: opts.exemptReason || 'Not subject to tax' };
  }

  let nonCompound = 0;
  for (const r of matched) {
    if (r.compound) continue;
    const amount = base * (r.rate / 100);
    nonCompound += amount;
    lines.push({ name: r.name || 'Tax', rate: r.rate, amount, compound: false, priority: r.priority });
  }

  let running = base + nonCompound;
  for (const r of matched) {
    if (!r.compound) continue;
    const amount = running * (r.rate / 100);
    running += amount;
    lines.push({ name: r.name || 'Tax', rate: r.rate, amount, compound: true, priority: r.priority });
  }

  return { total: lines.reduce((a, l) => a + l.amount, 0), lines, exempt: false };
}

/**
 * What 1.00 net becomes once these rates are applied.
 *
 * Running the real routine on a base of 1 rather than adding the percentages up, because compound
 * rates do not add — a 5% and a compound 9.975% are not 14.975%. Anything that needs to work
 * backwards from a tax-inclusive price needs this exact number.
 */
export function taxMultiplier(matched) {
  return 1 + computeTaxOn(1, matched).total;
}

/**
 * The net amount hiding inside a tax-inclusive price.
 *
 * When a shop enters prices with tax already in them, the advertised figure is what the customer
 * must end up paying, so the net is derived from it rather than the other way round. Dividing by
 * the multiplier is what makes a £9.99 item come back out as £9.99 after 20% VAT is added again,
 * instead of £9.98 or £10.00.
 */
export function netFromGross(gross, matched) {
  const m = taxMultiplier(matched);
  return m === 0 ? gross : gross / m;
}
