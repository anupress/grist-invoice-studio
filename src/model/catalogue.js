// The catalogue as products rather than rows.
//
// A price that changes is kept as rows: the same product again, with the day the new price starts
// (1.27.0). The composer's picker already offered one entry per product, priced for the document's
// date (schema.js productOptions). The sidebar listed every row, so a product with three prices was
// three entries, and its form edited one row with no sight of the others. From a German user's
// third round: one entry per product, the list grouped by category and then alphabetical, a
// category to narrow it by, and a product's prices kept together on its form, the next one a
// press away.
//
// What makes two rows one product is their key — the SKU when the row has one, else the name
// (schema.js productKey). The picker goes by the same key, so the list and the picker agree.

import { productKey, dayKey } from './schema.js';

const text = (v) => String(v ?? '').trim();
/** A to Z the way a person sorts: case does not count, and 10 comes after 9. */
export const alpha = (a, b) => String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base', numeric: true });

/** Today as a day key, for the version in force. */
export const todayKey = () => new Date().toISOString().slice(0, 10);

/**
 * Every product in the catalogue, once, with its prices over time, A to Z by name.
 *
 * Each item carries the row to open (`id`): the version in force on `today`, else the one that
 * starts next, else the last one. `versions` are all of its rows, earliest start first, each saying
 * whether it is the current one. The category and the picture travel with the product, so a
 * version that was saved without them shows the other's.
 */
export function catalogueItems(products, provider, { today = todayKey() } = {}) {
  if (!products || !provider) return [];
  const R = products.roles || {};
  const rows = (provider.records(products.table) || []).map((r) => {
    const raw = R.unitPrice ? r[R.unitPrice] : null;
    const price = raw === '' || raw == null ? null : Number(raw);
    return {
      id: r.id,
      name: text(R.name ? r[R.name] : ''),
      sku: text(R.sku ? r[R.sku] : ''),
      unit: text(R.unit ? r[R.unit] : ''),
      category: text(R.category ? r[R.category] : ''),
      price: price != null && isFinite(price) ? price : null,
      image: R.image ? (r[R.image] ?? null) : null,
      validFrom: R.validFrom ? dayKey(r[R.validFrom]) : '',
      validTo: R.validTo ? dayKey(r[R.validTo]) : '',
    };
  });
  const groups = new Map();
  for (const row of rows) {
    const key = productKey(row.name, row.sku) || `#${row.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const items = [];
  for (const [key, versions] of groups) {
    versions.sort((a, b) => alpha(a.validFrom, b.validFrom) || a.id - b.id);
    // The version to open, and whether it is in force: a product whose prices all lie ahead opens
    // on the first of them, but nothing about it is "current" yet.
    const shown = currentVersion(versions, today);
    items.push({
      key,
      id: shown.id,
      name: shown.name,
      sku: shown.sku,
      unit: shown.unit,
      category: shown.category || versions.map((v) => v.category).find(Boolean) || '',
      image: shown.image ?? versions.map((v) => v.image).find((v) => v != null) ?? null,
      price: shown.price,
      validFrom: shown.validFrom,
      validTo: shown.validTo,
      versions: versions.map((v) => ({ id: v.id, price: v.price, validFrom: v.validFrom, validTo: v.validTo, current: v === shown && inForce(v, today) })),
    });
  }
  return items.sort((a, b) => alpha(a.name, b.name) || alpha(a.sku, b.sku));
}

/**
 * The version to show today: the one in force (the latest start wins, as in the picker), else the
 * next to start, else the last one there is.
 */
export function currentVersion(versions, today = todayKey()) {
  const live = versions.filter((v) => inForce(v, today));
  if (live.length) return live.reduce((best, v) => ((v.validFrom || '') > (best.validFrom || '') ? v : best));
  const next = versions.filter((v) => v.validFrom && v.validFrom > today).sort((a, b) => alpha(a.validFrom, b.validFrom))[0];
  return next || versions[versions.length - 1];
}

/** Whether a version applies on a day: it has started, and it has not ended. */
export const inForce = (v, today = todayKey()) => (!v.validFrom || v.validFrom <= today) && (!v.validTo || v.validTo >= today);

/** The categories in use, A to Z. */
export function categoriesOf(items) {
  return [...new Set((items || []).map((i) => text(i.category)).filter(Boolean))].sort(alpha);
}

/** The list in sections: one per category, A to Z, and the uncategorised last under ''. */
export function groupByCategory(items) {
  const by = new Map();
  for (const i of items || []) {
    const c = text(i.category);
    if (!by.has(c)) by.set(c, []);
    by.get(c).push(i);
  }
  const names = [...by.keys()].filter(Boolean).sort(alpha);
  if (by.has('')) names.push('');
  return names.map((category) => ({ category, items: by.get(category) }));
}

/** The words beside a product in the list: its category, SKU, unit, and how its price stands. */
export function catalogueSubline(item, t = (s) => s) {
  const prices = item.versions ? item.versions.length : 1;
  const when = prices > 1 ? t(`${prices} prices`) : (item.validFrom ? t(`from ${item.validFrom}`) : '');
  return [item.category, item.sku, item.unit, when].map(text).filter(Boolean).join(' · ');
}

/** A price version's span, in words a translator can match: "from …", "until …", "always", or both days. */
export function versionSpan(v) {
  if (v.validFrom && v.validTo) return `${v.validFrom} – ${v.validTo}`;
  if (v.validFrom) return `from ${v.validFrom}`;
  if (v.validTo) return `until ${v.validTo}`;
  return 'always';
}
