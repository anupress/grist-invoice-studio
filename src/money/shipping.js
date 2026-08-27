// Shipping: zones, methods, classes, and the cost formula.
//
// Modelled on WooCommerce because its vocabulary is already in a million heads — a shop owner who
// has set up shipping once knows what a zone is, what a shipping class is, and that `[qty]` means
// the number of items. Inventing different words for the same three ideas would buy nothing.
//
//   ZONE    A geographic area with its own methods. Zones are tried in order and the FIRST match
//           wins, which is why they have to be arranged smallest-area-first: a "United States" zone
//           placed above a "California" zone means California never matches.
//   METHOD  Flat rate, free shipping, or local pickup.
//   CLASS   A per-product grouping with its own cost, added on top of the base cost.

import { evaluate } from './expression.js';

export const METHOD_TYPES = ['flat_rate', 'free_shipping', 'local_pickup'];

const norm = (v) => String(v == null ? '' : v).trim().toUpperCase();

/**
 * Does an address fall inside a zone?
 *
 * A zone's regions are `{ country, state, postcode }`. An empty or '*' country makes the zone match
 * everywhere, which is how the "rest of the world" fallback zone is expressed.
 */
export function zoneMatches(zone, address = {}) {
  const regions = zone?.regions || [];
  if (!regions.length) return true;  // a zone with no regions is the everywhere zone
  return regions.some((r) => {
    const c = norm(r.country);
    if (c && c !== '*' && c !== norm(address.country)) return false;
    const s = norm(r.state);
    if (s && s !== '*' && s !== norm(address.state)) return false;
    const p = String(r.postcode || '').trim();
    if (p && !postcodeInList(p, address.postcode)) return false;
    return true;
  });
}

// A simpler postcode test than the tax engine's: zones take a plain semicolon list with wildcards.
// Ranges are deliberately not supported here, because WooCommerce's zone editor does not offer them
// and supporting a syntax the source of the idea does not have invites a document that only works
// in ours.
function postcodeInList(spec, value) {
  const v = norm(value).replace(/\s+/g, '');
  if (!v) return false;
  return spec.split(';').map((x) => norm(x).replace(/\s+/g, '')).filter(Boolean).some((part) => {
    if (part.includes('*')) {
      const re = new RegExp('^' + part.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
      return re.test(v);
    }
    return part === v;
  });
}

/** The first zone an address falls into, or null. */
export function findZone(zones, address = {}) {
  return (zones || []).find((z) => zoneMatches(z, address)) || null;
}

/**
 * A flat-rate cost formula, resolved.
 *
 * Two placeholders, both WooCommerce's:
 *   [qty]                                    the number of items being shipped
 *   [fee percent="10" min_fee="4" max_fee="20"]   a percentage of the order, optionally clamped
 *
 * They are substituted for plain numbers and the remainder is arithmetic, which goes through the
 * parser in ./expression.js rather than eval — the formula comes out of a Grist document that other
 * people can edit, so executing it as code would be a stored XSS hole. Returns null when the
 * formula is not valid arithmetic, so the caller can distinguish "charge nothing" from "this is
 * broken".
 */
export function resolveCostFormula(formula, { quantity = 0, orderTotal = 0 } = {}) {
  const raw = String(formula == null ? '' : formula).trim();
  if (!raw) return 0;

  let out = raw.replace(/\[qty\]/gi, String(quantity));

  out = out.replace(/\[fee\b([^\]]*)\]/gi, (_match, attrs) => {
    const attr = (name) => {
      const m = new RegExp(name + '\\s*=\\s*"([^"]*)"', 'i').exec(attrs)
        || new RegExp(name + "\\s*=\\s*'([^']*)'", 'i').exec(attrs);
      const n = m ? parseFloat(m[1]) : NaN;
      return isFinite(n) ? n : null;
    };
    const percent = attr('percent');
    let fee = percent == null ? 0 : orderTotal * (percent / 100);
    const min = attr('min_fee');
    const max = attr('max_fee');
    if (min != null && fee < min) fee = min;
    if (max != null && fee > max) fee = max;
    // Parenthesised so a negative fee cannot turn "10 + -2" into something the parser rejects.
    return '(' + fee + ')';
  });

  return evaluate(out);
}

/**
 * What one method costs for this order.
 *
 * `context` carries what the formulas need: the quantity being shipped, the order total the
 * percentage fee is measured against, and the shipping classes present in the order.
 *
 * Class costs are ADDED to the base cost, and how several classes combine is the method's
 * `calculationType`:
 *   'class'  every class present is charged  (the default, and WooCommerce's)
 *   'order'  only the most expensive class is charged, once
 */
export function methodCost(method, context = {}) {
  if (!method) return { amount: 0, free: true, label: '' };
  const type = method.type || 'flat_rate';

  if (type === 'free_shipping') {
    return { amount: 0, free: true, label: method.label || 'Free shipping' };
  }
  if (type === 'local_pickup') {
    const amount = resolveCostFormula(method.cost, context) || 0;
    return { amount, free: amount === 0, label: method.label || 'Local pickup' };
  }

  const base = resolveCostFormula(method.cost, context);
  if (base === null) {
    return { amount: 0, free: false, label: method.label || 'Shipping', error: `Could not read the cost formula "${method.cost}".` };
  }

  const classCosts = [];
  const classes = context.classes || [];
  const table = method.classCosts || {};
  for (const cls of classes) {
    // A product with no class uses the "no class" cost, which is a separate field rather than a
    // fallback to the base — that is how WooCommerce does it and how people expect it to behave.
    const key = cls || 'none';
    if (!(key in table)) continue;
    const v = resolveCostFormula(table[key], context);
    if (v !== null) classCosts.push(v);
  }

  let extra = 0;
  if (classCosts.length) {
    extra = (method.calculationType === 'order')
      ? Math.max(...classCosts)
      : classCosts.reduce((a, b) => a + b, 0);
  }

  return { amount: base + extra, free: base + extra === 0, label: method.label || 'Flat rate' };
}

/**
 * Whether a free-shipping method's conditions are met.
 *
 * `requires` is WooCommerce's: 'none', 'min_amount', 'coupon', 'either', 'both'.
 */
export function freeShippingQualifies(method, { orderTotal = 0, hasFreeShippingCoupon = false } = {}) {
  const requires = method?.requires || 'none';
  const min = Number(method?.minAmount);
  const meetsMin = isFinite(min) ? orderTotal >= min : true;
  switch (requires) {
    case 'min_amount': return meetsMin;
    case 'coupon': return !!hasFreeShippingCoupon;
    case 'either': return meetsMin || !!hasFreeShippingCoupon;
    case 'both': return meetsMin && !!hasFreeShippingCoupon;
    default: return true;
  }
}

/**
 * The shipping charge for an order: find the zone, pick the method, work out the cost.
 *
 * When a method is named in `chosen` it is used; otherwise the zone's first available method is.
 * Free shipping that qualifies always wins over a paid method, because a customer who has earned it
 * and been charged anyway is a complaint rather than an edge case.
 */
export function computeShipping(config = {}, context = {}) {
  // The simplest case, and the one most invoices actually are: a number somebody typed.
  if (typeof config === 'number') return { amount: config, label: 'Shipping', taxable: true };
  if (config && config.amount != null && !config.zones) {
    return { amount: Number(config.amount) || 0, label: config.label || 'Shipping', taxable: config.taxable !== false };
  }

  const zone = findZone(config.zones, context.address);
  if (!zone) return { amount: 0, label: '', taxable: true, zone: null, note: 'No shipping zone matches this address.' };

  const available = (zone.methods || []).filter((mth) =>
    mth.type !== 'free_shipping' || freeShippingQualifies(mth, context));

  const free = available.find((mth) => mth.type === 'free_shipping');
  const chosen = (config.chosen && available.find((mth) => mth.id === config.chosen)) || free || available[0] || null;
  if (!chosen) return { amount: 0, label: '', taxable: true, zone: zone.id, note: 'This zone has no shipping methods.' };

  const cost = methodCost(chosen, context);
  return {
    amount: cost.amount,
    label: cost.label,
    taxable: chosen.taxable !== false,
    taxClass: chosen.taxClass || '',
    zone: zone.id,
    method: chosen.id,
    error: cost.error || null,
  };
}
