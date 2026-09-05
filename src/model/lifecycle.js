// What happens to a document after it is sent.
//
// A professional invoicing tool is judged less on the invoice than on the month after it: the
// same invoice raised again next month, the interest a late payer owes, and the statement that
// shows a client everything still open. All three are arithmetic on documents the widget already
// has, so they live here as pure functions, and the UI only decides when to offer them.

import { normaliseDraft, computeDraftTotals } from './draft.js';
import { documentKind } from '../doc/kinds.js';

const R = (n) => Math.round((Number(n) || 0) * 100) / 100;
const iso = (d) => d.toISOString().slice(0, 10);
const utcDay = (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** The periods a document can repeat at. */
export const PERIODS = [
  { id: 'week', label: 'Next week' },
  { id: 'month', label: 'Next month' },
  { id: 'quarter', label: 'Next quarter' },
  { id: 'year', label: 'Next year' },
];

/**
 * A date moved on by one period, keeping the day of the month where the month has it.
 *
 * Rent billed on the 31st is billed on the 28th in February and on the 31st again in March —
 * the day is clamped, never carried over into the following month, which is what a lease means.
 */
export function addPeriod(isoDate, period = 'month') {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDate || ''));
  if (!m) return '';
  const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
  if (period === 'week') return iso(new Date(Date.UTC(y, mo, d + 7)));
  const months = period === 'year' ? 12 : period === 'quarter' ? 3 : 1;
  const first = new Date(Date.UTC(y, mo + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, lastDay))));
}

/**
 * The same document, raised again for the next period.
 *
 * A new draft: no row, no number (assigned on save), status Draft, nothing paid, nothing sent,
 * every date moved on by the period, the lines copied without their row ids so saving adds
 * rows rather than rewriting last month's. Rent, retainers and subscriptions are this.
 */
export function nextDocument(draft, period = 'month') {
  const lines = (draft.lines || []).map(({ rowId, ...l }) => ({ ...l }));
  return normaliseDraft({
    ...draft,
    rowId: null,
    number: '',
    status: 'Draft',
    relatedTo: '',
    sentAt: '',
    sentTo: '',
    amountPaid: 0,
    taxAmount: null,
    issued: addPeriod(draft.issued, period),
    due: addPeriod(draft.due, period),
    serviceDate: draft.serviceDate ? addPeriod(draft.serviceDate, period) : '',
    lines,
  });
}

/**
 * Is anything still owed on this document?
 *
 * Drafts and cancelled documents owe nothing yet or ever; quotes, receipts and credit notes do
 * not ask for money at all. What is left is a document that asks and has not been paid in full.
 */
export function openDocument(d) {
  const status = String(d?.status || '').toLowerCase();
  if (/draft|cancel/.test(status)) return false;
  if (!documentKind(d?.kind).demandsPayment) return false;
  return balanceOf(d) > 0.005;
}

export function balanceOf(d) {
  const t = d?.totals || {};
  return R(t.balance != null ? t.balance : (Number(t.total) || 0) - (Number(t.amountPaid) || 0));
}

const isOverdue = (d, today) => {
  if (/overdue/i.test(String(d.status || ''))) return true;
  const due = Date.parse(String(d.due || '') + 'T00:00:00Z');
  return isFinite(due) && due < today;
};

/**
 * Interest on a late payment.
 *
 * Simple interest on the balance, at a yearly rate, for the days since the due date. The rate is
 * the business's setting, because the law sets it differently everywhere — eight points over a
 * base rate in the UK and the EU directive, nine over the Basiszinssatz between German
 * businesses — and a widget that picked one would be wrong somewhere. Returns null when there is
 * nothing to charge: not overdue, nothing owed, or a document that does not ask for money.
 */
export function lateFee(draft, { rate = 8, asAt = new Date() } = {}) {
  if (!documentKind(draft?.kind).demandsPayment) return null;
  const due = Date.parse(String(draft.due || '') + 'T00:00:00Z');
  if (!isFinite(due)) return null;
  const days = Math.floor((utcDay(asAt) - due) / 86400000);
  if (days <= 0) return null;
  const balance = balanceOf(draft);
  if (balance <= 0) return null;
  const pct = Math.max(0, Number(rate) || 0);
  const amount = R(balance * (pct / 100) * days / 365);
  if (amount <= 0) return null;
  return {
    days, rate: pct, balance, amount,
    description: `Late payment interest: ${days} day${days === 1 ? '' : 's'} overdue at ${pct}% a year`,
  };
}

/** The fee as a line for the document. Zero-rated: statutory interest is outside the scope of VAT. */
export function lateFeeLine(fee) {
  return { description: fee.description, quantity: 1, unitPrice: fee.amount, amount: fee.amount, taxClass: 'zero', unit: '' };
}

/**
 * A statement of account: every open document for one client, with a running balance.
 *
 * `documents` are resolved drafts — each with its kind, number, dates, reference and totals.
 * Only the open ones appear, oldest first, and the closing balance is what the client owes today.
 * The statement is a document of the `statement` kind, so it prints, exports and emails like any
 * other; it is not saved, because it is a view of the ledger rather than an entry in it.
 */
export function buildStatement({ client, documents = [], asAt = new Date(), sender = {}, currency = '', number = '', layout = '' } = {}) {
  const open = documents.filter(openDocument)
    .sort((a, b) => String(a.issued || '').localeCompare(String(b.issued || '')));
  let running = 0;
  const lines = open.map((d) => {
    const t = d.totals || {};
    const charge = R(t.total);
    const paid = R(t.amountPaid);
    running = R(running + charge - paid);
    return {
      description: `${documentKind(d.kind).word} ${d.number || ''}`.trim(),
      date: d.issued || '',
      reference: d.reference || '',
      charge, paid, balance: running,
      quantity: 1, unitPrice: 0, amount: charge - paid,
    };
  });
  const statement = normaliseDraft({
    kind: 'statement', number, layout, status: 'Sent',
    issued: iso(asAt), due: '',
    client: client || {}, sender, currency,
    lines,
  });
  // A statement's figures are its own columns — charges, payments, the closing balance — and the
  // totals engine knows that for this kind; run here so a caller gets a complete document.
  statement.totals = computeDraftTotals(statement, {});
  return statement;
}

/**
 * What is outstanding across a set of documents, for the sidebar's one-line summary.
 *
 * Money still owed, how much of it is past its due date, and how many documents each is.
 */
export function aging(documents = [], asAt = new Date()) {
  const today = utcDay(asAt);
  let outstanding = 0, overdue = 0, count = 0, overdueCount = 0;
  for (const d of documents) {
    if (!openDocument(d)) continue;
    const bal = balanceOf(d);
    outstanding += bal;
    count++;
    if (isOverdue(d, today)) { overdue += bal; overdueCount++; }
  }
  return { outstanding: R(outstanding), overdue: R(overdue), count, overdueCount };
}
