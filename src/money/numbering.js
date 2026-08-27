// Invoice numbers, and the rule that matters more than the format.
//
//   ASSIGN ONCE. STORE IT. NEVER RECOMPUTE.
//
// An invoice number is not a display property, it is an identifier on a legal document, and in many
// jurisdictions the sequence must have no gaps and must not change. Anything that derives it — from
// a row id, from a position in a sorted list, from a count — produces numbers that move when an
// earlier invoice is deleted. Grist's own Invoicing template does exactly this (`$id + 51371`), and
// it is the single defect in that template most likely to cause a real problem for a real business.
//
// WooCommerce keeps invoice numbers separate from order numbers for the same reason, assigns one at
// the moment a document is generated, stores it, and reuses the stored value forever after. So does
// this. That is why generating a document is a considered action rather than a preview, and why
// WooCommerce warns against attaching a PDF to early emails: generating one BURNS a number.

const pad = (n, width) => {
  const s = String(Math.max(0, Math.floor(n)));
  return width > s.length ? '0'.repeat(width - s.length) + s : s;
};

export const DEFAULT_FORMAT = {
  prefix: 'INV-{YYYY}-',
  suffix: '',
  padding: 4,
  start: 1,
  resetPeriod: 'yearly',   // yearly | monthly | never
};

const TOKEN = /\{(YYYY|YY|MM|DD)\}/g;

/** Substitute the date tokens in a prefix or suffix. */
export function renderTokens(text, date = new Date()) {
  const d = date instanceof Date ? date : new Date(String(date));
  const valid = !isNaN(d.getTime()) ? d : new Date();
  return String(text == null ? '' : text).replace(TOKEN, (_m, token) => {
    switch (token) {
      case 'YYYY': return String(valid.getFullYear());
      case 'YY': return String(valid.getFullYear()).slice(-2);
      case 'MM': return pad(valid.getMonth() + 1, 2);
      case 'DD': return pad(valid.getDate(), 2);
      default: return _m;
    }
  });
}

const hasToken = (text, ...tokens) => {
  const s = String(text || '');
  return tokens.some((t) => s.includes('{' + t + '}'));
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The finished number for a given sequence value and date. */
export function formatNumber(sequence, format = {}, date = new Date()) {
  const f = { ...DEFAULT_FORMAT, ...format };
  return renderTokens(f.prefix, date) + pad(sequence, f.padding) + renderTokens(f.suffix, date);
}

/**
 * Pull the sequence back out of a finished number, or null if it does not belong to this format.
 *
 * The rendered prefix is what scopes a period: with `INV-{YYYY}-`, last year's numbers begin
 * "INV-2025-" and simply do not match this year's pattern, so the sequence restarts by itself. That
 * is deliberate — the numbering scheme carries its own period rather than needing a counter stored
 * somewhere that can drift out of step with the documents.
 */
export function parseSequence(value, format = {}, date = new Date()) {
  const f = { ...DEFAULT_FORMAT, ...format };
  const prefix = renderTokens(f.prefix, date);
  const suffix = renderTokens(f.suffix, date);
  const re = new RegExp('^' + escapeRe(prefix) + '(\\d+)' + escapeRe(suffix) + '$');
  const m = re.exec(String(value == null ? '' : value).trim());
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Whether the format can actually honour the reset period it claims.
 *
 * A yearly reset with no `{YYYY}` anywhere in the number is not a thing that can work: nothing in
 * the finished number says which year it belongs to, so nothing can tell this year's sequence from
 * last year's, and restarting at 1 would produce duplicates. Reported rather than silently ignored,
 * because a duplicate invoice number is the kind of problem that surfaces at an audit.
 */
export function validateFormat(format = {}) {
  const f = { ...DEFAULT_FORMAT, ...format };
  const problems = [];
  const both = String(f.prefix || '') + String(f.suffix || '');

  if (f.resetPeriod === 'yearly' && !hasToken(both, 'YYYY', 'YY')) {
    problems.push('A yearly reset needs {YYYY} or {YY} in the prefix or suffix, or this year’s numbers cannot be told apart from last year’s.');
  }
  if (f.resetPeriod === 'monthly' && !hasToken(both, 'MM')) {
    problems.push('A monthly reset needs {MM} in the prefix or suffix, or each month’s numbers would collide with the last.');
  }
  if (f.resetPeriod === 'monthly' && !hasToken(both, 'YYYY', 'YY')) {
    problems.push('A monthly reset also needs {YYYY} or {YY}, or the same month next year reuses this year’s numbers.');
  }
  if (!(Number(f.padding) >= 0)) problems.push('Padding must be a number.');
  return { ok: problems.length === 0, problems };
}

/**
 * The next number in the sequence, given every number already in use.
 *
 * Highest-plus-one rather than count-plus-one: counting produces a duplicate the moment anything
 * has been deleted, and a duplicate invoice number is worse than a gap.
 */
export function nextNumber(existingNumbers, format = {}, date = new Date()) {
  const f = { ...DEFAULT_FORMAT, ...format };
  let highest = null;
  for (const value of existingNumbers || []) {
    const seq = parseSequence(value, f, date);
    if (seq != null && (highest == null || seq > highest)) highest = seq;
  }
  const sequence = highest == null ? Math.max(1, Number(f.start) || 1) : highest + 1;
  return { sequence, number: formatNumber(sequence, f, date) };
}

/**
 * Give this invoice its number — unless it already has one.
 *
 * The whole rule, in one function. `current` is whatever is stored on the row; if there is anything
 * there at all it is returned untouched, because reassigning a number that has been on a document
 * somebody has already received is not a correction, it is a second invoice.
 */
export function assignNumber(current, { existingNumbers = [], format = {}, date = new Date() } = {}) {
  const held = String(current == null ? '' : current).trim();
  if (held) return { number: held, assigned: false, reason: 'This invoice already has a number.' };

  const check = validateFormat(format);
  const next = nextNumber(existingNumbers, format, date);
  return {
    number: next.number,
    sequence: next.sequence,
    assigned: true,
    warnings: check.ok ? [] : check.problems,
  };
}
