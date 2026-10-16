// Invoice numbers, and the rule that matters more than the format.
//
//   ASSIGN ONCE. STORE IT. NEVER RECOMPUTE.
//
// An invoice number is not a display property, it is an identifier on a legal document. What a
// country asks of the run differs, but a number that belongs to two documents is wrong anywhere, so
// it is never derived. A count, or a position in a sorted list, produces numbers that move when an
// earlier invoice is deleted. A row id does not move, but it leaves a gap when a middle row is
// deleted, and Grist gives the id of a deleted NEWEST row to the next row added, so a number built
// from it can be issued twice (tested in Grist on 16 October 2026). Grist's own Invoicing template
// does exactly this (`$id + 51371`), and it is the defect in that template most likely to cause a
// real problem for a real business.
//
// A stored number is not a full cure. The next one is the highest number still in the table plus
// one (see nextNumber), so deleting the NEWEST invoice frees its number for the next. The advice
// that goes with it: cancel an invoice instead of deleting it.
//
// WooCommerce keeps invoice numbers separate from order numbers for the same reason, assigns one at
// the moment a document is generated, stores it, and reuses the stored value forever after. So does
// this. That is why generating a document is a considered action rather than a preview, and why
// WooCommerce warns against attaching a PDF to early emails: generating one BURNS a number.
//
// WHAT A NUMBER CAN BE BUILT FROM. The prefix and suffix take tokens in braces:
//
//   {YYYY} {YY} {MM} {DD}   the document's date
//   {reference}             the client's own reference on this document
//   {client.Column}         any column of the client's record — {client.Konto} for a business
//                           whose numbers carry the ledger account of the debtor
//   {Column}                a column of the invoice row itself, filled in on the composer
//
// A token the document cannot fill in stays in the number as typed and is reported, rather than
// vanishing: "RE-{client.Konto}-0001" is a number somebody notices, "RE--0001" is one they send.
// The rendered prefix is also what scopes a sequence, so a prefix that carries the client's
// account restarts the count per account — which is what a business that numbers by ledger
// account means by it.

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

const TOKEN = /\{([A-Za-z_][\w.]*)\}/g;
const DATE_TOKENS = new Set(['YYYY', 'YY', 'MM', 'DD']);

/** A value fit to go inside a number: text, trimmed; a figure as its digits; nothing for the rest. */
function tokenValue(v) {
  if (v == null) return '';
  if (typeof v === 'number') return isFinite(v) ? String(v) : '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return v.map(tokenValue).filter(Boolean).join(',');
  if (typeof v === 'object') return '';
  return String(v).trim();
}

/**
 * Substitute the tokens in a prefix or suffix.
 *
 * `values` is a flat map from token name to value — `{ reference: 'PO 5087', 'client.Konto':
 * 10001 }` — and a token with no value, or an empty one, is left exactly as typed.
 */
export function renderTokens(text, date = new Date(), values = {}) {
  const d = date instanceof Date ? date : new Date(String(date));
  const valid = !isNaN(d.getTime()) ? d : new Date();
  return String(text == null ? '' : text).replace(TOKEN, (_m, token) => {
    switch (token) {
      case 'YYYY': return String(valid.getFullYear());
      case 'YY': return String(valid.getFullYear()).slice(-2);
      case 'MM': return pad(valid.getMonth() + 1, 2);
      case 'DD': return pad(valid.getDate(), 2);
      default: {
        const v = tokenValue(values && values[token]);
        return v ? v : _m;
      }
    }
  });
}

/** The tokens in a prefix or suffix that `values` cannot fill in, each once. */
export function unresolvedTokens(text, values = {}) {
  const out = [];
  for (const m of String(text == null ? '' : text).matchAll(TOKEN)) {
    const token = m[1];
    if (DATE_TOKENS.has(token) || out.includes(token)) continue;
    if (!tokenValue(values && values[token])) out.push(token);
  }
  return out;
}

/** Why a token could not be filled in, in words a person can act on. */
function explainToken(token) {
  if (token.startsWith('client.')) return `{${token}} could not be filled in: the client record has no value in ${token.slice(7)}. It is left in the number as typed.`;
  if (token === 'reference') return '{reference} could not be filled in: this document has no reference. It is left in the number as typed.';
  return `{${token}} could not be filled in: nothing on this document is called ${token}. It is left in the number as typed.`;
}

const hasToken = (text, ...tokens) => {
  const s = String(text || '');
  return tokens.some((t) => s.includes('{' + t + '}'));
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The finished number for a given sequence value and date. */
export function formatNumber(sequence, format = {}, date = new Date(), values = {}) {
  const f = { ...DEFAULT_FORMAT, ...format };
  return renderTokens(f.prefix, date, values) + pad(sequence, f.padding) + renderTokens(f.suffix, date, values);
}

/**
 * Pull the sequence back out of a finished number, or null if it does not belong to this format.
 *
 * The rendered prefix is what scopes a period: with `INV-{YYYY}-`, last year's numbers begin
 * "INV-2025-" and simply do not match this year's pattern, so the sequence restarts by itself. That
 * is deliberate — the numbering scheme carries its own period rather than needing a counter stored
 * somewhere that can drift out of step with the documents.
 */
export function parseSequence(value, format = {}, date = new Date(), values = {}) {
  const f = { ...DEFAULT_FORMAT, ...format };
  const prefix = renderTokens(f.prefix, date, values);
  const suffix = renderTokens(f.suffix, date, values);
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
export function nextNumber(existingNumbers, format = {}, date = new Date(), values = {}) {
  const f = { ...DEFAULT_FORMAT, ...format };
  let highest = null;
  for (const value of existingNumbers || []) {
    const seq = parseSequence(value, f, date, values);
    if (seq != null && (highest == null || seq > highest)) highest = seq;
  }
  const sequence = highest == null ? Math.max(1, Number(f.start) || 1) : highest + 1;
  return { sequence, number: formatNumber(sequence, f, date, values) };
}

/**
 * Give this invoice its number — unless it already has one.
 *
 * The whole rule, in one function. `current` is whatever is stored on the row; if there is anything
 * there at all it is returned untouched, because reassigning a number that has been on a document
 * somebody has already received is not a correction, it is a second invoice.
 */
export function assignNumber(current, { existingNumbers = [], format = {}, date = new Date(), values = {} } = {}) {
  const held = String(current == null ? '' : current).trim();
  if (held) return { number: held, assigned: false, reason: 'This invoice already has a number.' };

  const f = { ...DEFAULT_FORMAT, ...format };
  const check = validateFormat(f);
  const next = nextNumber(existingNumbers, f, date, values);
  // A token nobody could fill in is said here, at the moment the number is given out, because
  // this is the moment somebody can still type the right one before the document goes anywhere.
  const missing = [...unresolvedTokens(f.prefix, values), ...unresolvedTokens(f.suffix, values)]
    .filter((t, i, all) => all.indexOf(t) === i)
    .map(explainToken);
  return {
    number: next.number,
    sequence: next.sequence,
    assigned: true,
    warnings: [...(check.ok ? [] : check.problems), ...missing],
  };
}
