// Tiny DOM + helper kit shared across modules. No framework, no dependencies.

// Valid HTML attribute name (spec-lax): starts with letter/underscore, then letters/digits/hyphens/dots/colons/underscores.
const ATTR_RE = /^[a-zA-Z_][\w.:-]*$/;

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') { node.className = v; continue; }
    if (k === 'html') { node.innerHTML = v; continue; }
    if (k === 'text') { node.textContent = v; continue; }
    if (k === 'dataset') { Object.assign(node.dataset, v); continue; }
    if (k === 'style' && typeof v === 'object') { Object.assign(node.style, v); continue; }
    if (k.startsWith('on') && typeof v === 'function') { node.addEventListener(k.slice(2).toLowerCase(), v); continue; }
    if (k in node && k !== 'list') { try { node[k] = v; continue; } catch {} }
    // Fall-through: only call setAttribute with a name the DOM will accept —
    // otherwise a mangled key crashes the whole render with DOMException.
    if (ATTR_RE.test(k)) { try { node.setAttribute(k, v); } catch {} }
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

// Build a node from a trusted HTML string (our own SVG icon strings).
export function fromHTML(htmlStr) {
  const t = document.createElement('template');
  t.innerHTML = htmlStr.trim();
  return t.content.firstElementChild;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

export const uid = (p = 'id') => p + '-' + Math.random().toString(36).slice(2, 9);

export const clone = (o) => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));

export function debounce(fn, ms = 180) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// Human-friendly number formatting (1.2K, 3.4M, currency, percent).
export function fmtNumber(v, opts = {}) {
  if (v == null || v === '' || (typeof v === 'number' && !isFinite(v))) return '—';
  const n = Number(v);
  if (!isFinite(n)) return String(v);
  const { compact, currency, percent, decimals } = opts;
  if (percent) return (n).toLocaleString(undefined, { maximumFractionDigits: decimals ?? 1 }) + '%';
  if (compact && Math.abs(n) >= 1000) {
    const units = [['T', 1e12], ['B', 1e9], ['M', 1e6], ['K', 1e3]];
    for (const [s, f] of units) if (Math.abs(n) >= f) return (currency ? currency : '') + trimZero(n / f) + s;
  }
  const fixed = decimals != null ? n.toFixed(decimals) : trimZero(Math.round(n * 100) / 100);
  return (currency || '') + Number(fixed).toLocaleString(undefined, { maximumFractionDigits: decimals ?? 2 });
}
function trimZero(n) { return String(Number(n.toFixed(2))); }

export function isFiniteNum(v) { return typeof v === 'number' ? isFinite(v) : (v !== '' && v != null && isFinite(Number(v))); }

/**
 * A short, stable fingerprint of a design.
 *
 * Used to answer one question: has anything been changed since a template was applied? Comparing
 * whole configs is no good, because several keys move on their own — the save revision, the record
 * of which tables we created, and the template stamp itself — and a viewer flipping light/dark
 * writes theme.mode without touching the design at all. Those are excluded; everything a person
 * could deliberately build is included, so adding a block, retitling a page, recolouring or
 * switching fonts all register.
 *
 * FNV-1a over the canonical JSON. Not cryptographic and does not need to be: a collision means one
 * confirmation screen phrases itself slightly wrongly.
 */
export function designSignature(config) {
  if (!config || typeof config !== 'object') return '0';
  const ignore = new Set(['__apRev', 'createdTables', 'templateId', 'templateSig']);
  const canonical = (v) => {
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === 'object') {
      const out = {};
      for (const k of Object.keys(v).sort()) {
        if (ignore.has(k)) continue;
        out[k] = canonical(v[k]);
      }
      return out;
    }
    return v;
  };
  const clean = canonical(config);
  if (clean.theme) delete clean.theme.mode; // a viewer's light/dark choice is not a design change
  const s = JSON.stringify(clean);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

// How a raw cell value should read to a person.
//
// Every table cell used to be String(value), which is fine for text and wrong for the two types
// that do not stringify into anything a reader recognises: a Bool became the word "true", and a
// number lost whatever format the document had given it. On screen that is untidy; on a printed
// page sent to a client it is a defect -- a fee column reading "204972" and a billing column
// reading "true" are programming artefacts, not data.
//
// Order of authority: the column's own Grist format first, then its type. We never invent a
// format the document did not ask for, except for thousands separators on Numeric, where the
// alternative is an unreadable run of digits. Int is deliberately left bare, because that is
// where years, invoice numbers and postcodes live and "2,026" would be actively wrong.
/**
 * Columns whose stored value is structurally not its display value.
 *
 * A Reference holds a row id; a ChoiceList, an Attachments cell and a Reference List all hold
 * Grist's list tuple ['L', …]. Stringifying any of them produces something that is not a rough
 * approximation of the truth but a different value entirely — "2", or "L,Red,Blue".
 *
 * One definition, used everywhere that groups, filters, sorts or prints a cell, because three
 * copies of this regex is three chances for one of them to fall behind the others. Deliberately
 * NOT a general "does this need formatting" test: Bool and Numeric also format, but their raw form
 * is still recognisably the value, and treating them here would desynchronise filter lists from the
 * plain-text inputs beside them.
 */
export const isStructuredType = (type) => /^(Ref(List)?(:|$)|ChoiceList|Attachments)/i.test(String(type || ''));

export function formatCellValue(value, col) {
  if (value == null || value === '') return '';
  const type = String(col?.type || '');

  // References are how Grist does relationships, so they turn up in most real documents — and what
  // it stores in the cell is a row id. Printing that raw is not a formatting nicety we skipped, it
  // is the wrong value: an invoice's client reads as "4", and a chart grouped by that column groups
  // by numbers nobody recognises. A Reference List arrives as Grist's list tuple ['L', 1, 2],
  // which stringifies to the memorable nonsense "L,1,2".
  //
  // `refLabels` is supplied by the provider, which has the referenced table cached whole. One fetch
  // per referenced TABLE, never one per row — that distinction is the difference between this
  // working and it being the "too many fetches" problem in a different coat.
  if (/^Ref(List)?(:|$)/i.test(type)) {
    const labels = col?.refLabels || null;
    const one = (id) => {
      const v = labels ? labels[id] : undefined;
      return v == null || v === '' ? String(id) : String(v);
    };
    if (/^RefList/i.test(type)) {
      const list = Array.isArray(value) ? (value[0] === 'L' ? value.slice(1) : value) : [value];
      return list.filter((x) => x != null && x !== 0 && x !== '').map(one).join(', ');
    }
    // 0 is Grist's empty reference, not a row.
    return value === 0 ? '' : one(value);
  }

  // Grist stores every list-shaped cell as the same tuple, ['L', …], so ChoiceList and Attachments
  // fall into exactly the trap Reference List did: String() on one produces "L,Red,Blue", which is
  // not a near-miss but a made-up value with a stray letter at the front. A ChoiceList is the
  // multi-select tag column people reach for constantly, so this is worth spelling out separately
  // rather than leaving to the default.
  if (/^ChoiceList/i.test(type)) {
    const list = Array.isArray(value) ? (value[0] === 'L' ? value.slice(1) : value) : [value];
    return list.filter((x) => x != null && x !== '').join(', ');
  }
  if (/^Attachments/i.test(type)) {
    // The ids mean nothing to a reader and the filenames are not in this cell — they live in
    // _grist_Attachments, which this pure function has no way to reach. A count is the honest
    // thing a table cell can say about them.
    const list = Array.isArray(value) ? (value[0] === 'L' ? value.slice(1) : value) : [value];
    const n = list.filter((x) => x != null && x !== '').length;
    return n ? `${n} file${n === 1 ? '' : 's'}` : '';
  }

  if (/^Bool/i.test(type) || typeof value === 'boolean') {
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (value === 'true' || value === 1 || value === '1') return 'Yes';
    if (value === 'false' || value === 0 || value === '0') return 'No';
  }

  if (/^(Numeric|Int|Currency)/i.test(type) && isFiniteNum(value)) {
    const n = Number(value);
    const o = col?.widgetOptions || {};
    const mode = o.numMode;
    const min = o.decimals, max = o.maxDecimals;
    if (mode || min != null || max != null) {
      const fmt = { minimumFractionDigits: min ?? 0, maximumFractionDigits: max ?? Math.max(min ?? 0, 2) };
      if (mode === 'currency') { fmt.style = 'currency'; fmt.currency = o.currency || 'USD'; }
      else if (mode === 'percent') fmt.style = 'percent';
      else if (mode === 'scientific') return n.toExponential(max ?? min ?? 2);
      if (mode === 'decimal' || !mode) fmt.useGrouping = true;
      try { return n.toLocaleString(undefined, fmt); } catch { return String(n); }
    }
    if (/^Int/i.test(type)) return String(n);
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  return String(value);
}

// Replace %placeholders in a template with values (numbers are locale-formatted).
export function interpolate(template, vars) {
  return String(template == null ? '' : template).replace(/%(\w+)/g, (m, k) => {
    if (!(k in vars)) return m;
    const v = vars[k];
    return typeof v === 'number' ? v.toLocaleString() : String(v ?? '');
  });
}

// Quick toast notification.
let toastTimer;
export function toast(msg, kind = '') {
  let t = document.querySelector('.ap-toast');
  if (!t) { t = el('div', { class: 'ap-toast' }); document.body.appendChild(t); }
  t.className = 'ap-toast' + (kind ? ' ap-toast--' + kind : '');
  t.textContent = msg;
  // setTimeout, not rAF — rAF is starved while the page is not compositing (inactive Grist tab),
  // and a "Saved" confirmation that never appears is worse than one that appears un-animated.
  setTimeout(() => t.classList.add('is-show'), 0);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-show'), 2600);
}
