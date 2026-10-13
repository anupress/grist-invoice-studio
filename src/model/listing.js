// The invoice list: how it is ordered, and which rows are shown.
//
// A table of forty invoices can be read in whatever order the table keeps them. A table of four
// thousand — several years of a business's history, imported in one go — cannot, and the document
// somebody just created was at the bottom of it, after the oldest invoice of 2019. So the list
// has an order of its own, newest first unless asked otherwise, and a filter for the two things
// a person actually narrows a list of invoices by: what state it is in, and which year it was
// raised in. The search box narrows by number and client as before.
//
// Pure, so the choices can be tested without a browser; main.js draws the controls.

export const SORTS = [
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'created', label: 'Last created first' },
  { id: 'number', label: 'Highest number first' },
  { id: 'client', label: 'Client, A to Z' },
  { id: 'amount', label: 'Largest amount first' },
  { id: 'table', label: 'As in the table' },
];

export const DEFAULT_SORT = 'newest';

export const isSort = (id) => SORTS.some((s) => s.id === id);

/**
 * A date as a "YYYY-MM-DD" key, from whatever a row holds.
 *
 * The provider normally hands dates over as day strings, but a raw epoch — seconds or
 * milliseconds — is accepted too, for the same reason the renderer accepts one: a number is
 * never the right thing to sort as text. Anything unreadable is '', which sorts last.
 */
export function dayOf(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && isFinite(v)) {
    const d = new Date(Math.abs(v) > 1e11 ? v : v * 1000);
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (m) return m[1];
  if (/^\d{9,13}$/.test(s)) return dayOf(Number(s));
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

const byText = (a, b) => String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' });
const num = (v) => (v == null || v === '' || !isFinite(Number(v)) ? null : Number(v));

/** The list in the chosen order. A new array; the input is left alone. */
export function sortInvoices(list, sort = DEFAULT_SORT) {
  const rows = [...(list || [])];
  const id = (r) => Number(r.created != null ? r.created : r.id) || 0;
  // An empty date sorts after every real one whichever way the list runs, because a row with
  // no date is not the oldest invoice and not the newest; it is an incomplete one.
  const dated = (a, b, dir) => {
    const da = dayOf(a.issued), db = dayOf(b.issued);
    if (da && !db) return -1;
    if (!da && db) return 1;
    // dir 1 is newest first: the later day comes first.
    return da > db ? -dir : da < db ? dir : 0;
  };
  const cmp = {
    newest: (a, b) => dated(a, b, 1) || id(b) - id(a),
    oldest: (a, b) => dated(a, b, -1) || id(a) - id(b),
    created: (a, b) => id(b) - id(a),
    number: (a, b) => -byText(a.number, b.number) || id(b) - id(a),
    client: (a, b) => byText(a.client, b.client) || dated(a, b, 1) || id(b) - id(a),
    amount: (a, b) => {
      const ta = num(a.total), tb = num(b.total);
      if (ta == null && tb == null) return id(b) - id(a);
      if (ta == null) return 1;
      if (tb == null) return -1;
      return tb - ta || id(b) - id(a);
    },
    table: (a, b) => id(a) - id(b),
  }[isSort(sort) ? sort : DEFAULT_SORT];
  return rows.sort(cmp);
}

/** The rows that match the search, the status and the year — every one of them optional. */
export function filterInvoices(list, { query = '', status = '', year = '' } = {}) {
  const q = String(query || '').trim().toLowerCase();
  const st = String(status || '').trim().toLowerCase();
  const yr = String(year || '').trim();
  return (list || []).filter((r) => {
    if (q && !(`${r.number || ''} ${r.client || ''}`).toLowerCase().includes(q)) return false;
    if (st && String(r.status || '').trim().toLowerCase() !== st) return false;
    if (yr && dayOf(r.issued).slice(0, 4) !== yr) return false;
    return true;
  });
}

/** The years the list spans, newest first, for the year filter. */
export function yearsOf(list) {
  const years = new Set();
  for (const r of list || []) {
    const y = dayOf(r.issued).slice(0, 4);
    if (y) years.add(y);
  }
  return [...years].sort().reverse();
}
