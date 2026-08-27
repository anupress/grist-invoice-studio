// Composing the message that carries a document.
//
// Every delivery route — the mail client, the clipboard, the outbox, a webhook — carries the same
// thing: a recipient, a subject and a body. So they are built once, here, from templates the user
// can edit, and the routes differ only in what they do with the result.
//
// The templates are per TRIGGER rather than per document kind, because what changes the wording is
// the reason you are writing: the same invoice needs one message when it is first sent, another
// three days after it fell due, and a different one again when it is finally paid. WooCommerce
// arrived at the same shape — one editable message per event — and shop owners already know it.
//
// Placeholders are `{name}`. Anything unrecognised is left exactly as it was found, so a body
// mentioning "{" in passing survives, and a typo shows up on the page as itself rather than
// silently becoming an empty string.

import { formatMoney } from '../money/currency.js';
import { documentKind } from '../doc/kinds.js';
import { docDate } from '../doc/render.js';

/**
 * The messages, and when each is meant.
 *
 * `when` is the status a document reaches to make this the natural message; `afterDays` is how long
 * past the due date it applies. Both are used by ./rules.js to choose one automatically, and both
 * are only defaults — a person can always pick a different one.
 */
export const MESSAGE_TEMPLATES = [
  {
    id: 'invoice_sent',
    label: 'Invoice sent',
    when: 'Sent',
    subject: '{kind} {number} from {sender_name}',
    body: `Hello {client_first_name},

Please find {kind_lower} {number} attached, for {total}.

{payment_terms_line}

{payment_details}

Thank you,
{sender_name}`,
  },
  {
    id: 'quote_sent',
    label: 'Quote sent',
    kinds: ['quote'],
    subject: 'Quote {number} from {sender_name}',
    body: `Hello {client_first_name},

Thank you for the enquiry. Our quote comes to {total}, and the detail is attached.

It holds until {due}. If anything needs changing, tell me and I will revise it.

{sender_name}`,
  },
  {
    id: 'reminder_due_soon',
    label: 'Reminder — due soon',
    afterDays: -3,
    subject: '{kind} {number} falls due on {due}',
    body: `Hello {client_first_name},

A quick note that {kind_lower} {number}, for {balance}, falls due on {due}.

{payment_details}

If it is already on its way, please ignore this.

{sender_name}`,
  },
  {
    id: 'reminder_overdue',
    label: 'Reminder — overdue',
    when: 'Overdue',
    afterDays: 3,
    subject: '{kind} {number} is now overdue',
    body: `Hello {client_first_name},

{kind} {number}, for {balance}, fell due on {due} and is now {days_overdue} days overdue.

{payment_details}

If there is a problem with it, let me know and we will sort it out.

{sender_name}`,
  },
  {
    id: 'reminder_final',
    label: 'Reminder — final notice',
    afterDays: 30,
    subject: 'Final notice — {kind} {number}, {days_overdue} days overdue',
    body: `Hello {client_first_name},

{kind} {number}, for {balance}, is now {days_overdue} days overdue. I have written before and have
not heard back.

{payment_details}

Please either settle it or tell me when I can expect payment.

{sender_name}`,
  },
  {
    id: 'payment_received',
    label: 'Payment received',
    when: 'Paid',
    subject: 'Received, thank you — {kind} {number}',
    body: `Hello {client_first_name},

Thank you — payment of {amount_paid} against {kind_lower} {number} has been received, and a receipt
is attached.

It was a pleasure working with you.

{sender_name}`,
  },
];

export const findTemplate = (id) => MESSAGE_TEMPLATES.find((t) => t.id === id) || MESSAGE_TEMPLATES[0];

/** Templates that make sense for this kind of document. */
export function templatesFor(kindId) {
  return MESSAGE_TEMPLATES.filter((t) => !t.kinds || t.kinds.includes(kindId));
}

const text = (v) => String(v == null ? '' : v).trim();

/** Whole days from `from` to `to`, or null when either date is missing or unreadable. */
export function daysBetween(from, to) {
  const a = Date.parse(String(from || '') + 'T00:00:00Z');
  const b = Date.parse(String(to || '') + 'T00:00:00Z');
  if (!isFinite(a) || !isFinite(b)) return null;
  // Whole days, computed from UTC midnights, so it never lands on 2.9999 and floors to the wrong
  // number because one of the two dates is on the other side of a daylight-saving change.
  return Math.round((b - a) / 86400000);
}

/**
 * The values a template can refer to.
 *
 * Exported because the send panel lists them for the user, and a list of placeholders that has
 * drifted from the ones that actually work is worse than no list.
 */
export function placeholdersFor(draft, settings = {}, now = new Date()) {
  const kind = documentKind(draft.kind);
  const t = draft.totals || {};
  const fmt = draft.format || { currency: draft.currency };
  const money = (v) => formatMoney(v, fmt);

  const clientName = text(draft.client?.name);
  // "Hello Harbour Lane Bakery," is stilted; "Hello Kingfisher," is worse. A first name is right for
  // a person and wrong for a company, and there is no way to tell them apart reliably — so the
  // whole name is used, and the placeholder is named for what it is FOR rather than what it does.
  const firstName = clientName.split(/\s+/)[0] || clientName;
  const isPerson = /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(clientName);

  const today = now.toISOString().slice(0, 10);
  const overdue = draft.due ? daysBetween(draft.due, today) : null;

  // Dates read the way the document writes them — "19 Aug 2026", never "2026-08-19". A covering
  // email that spells a date differently from the invoice attached to it looks like it came from
  // somewhere else, and the whole point of the message is that it plainly belongs to the document.
  const dueText = draft.due ? docDate(draft.due) : '';

  // Only add a full stop if the terms do not already end in one. Somebody who types "Net 30." — and
  // most people do end a sentence — would otherwise get "Net 30.." on every invoice they send.
  const terms = text(draft.terms);
  const termsLine = terms
    ? `Payment terms: ${terms}${/[.!?]$/.test(terms) ? '' : '.'}`
    : (dueText ? `Payment is due by ${dueText}.` : '');

  return {
    number: text(draft.number),
    kind: kind.word,
    kind_lower: kind.word.toLowerCase(),
    status: text(draft.status),
    issued: draft.issued ? docDate(draft.issued) : '',
    due: dueText || '—',
    reference: text(draft.reference),
    client_name: clientName,
    client_first_name: isPerson ? firstName : clientName,
    client_email: text(draft.client?.email),
    sender_name: text(draft.sender?.name) || text(settings.sender?.name),
    sender_email: text(draft.sender?.email) || text(settings.sender?.email),
    total: money(t.total),
    balance: money(t.balance != null ? t.balance : t.total),
    amount_paid: money(t.amountPaid),
    subtotal: money(t.subtotal),
    tax: money(t.taxTotal),
    days_overdue: overdue != null && overdue > 0 ? String(overdue) : '0',
    payment_terms_line: termsLine,
    payment_details: text(settings.paymentDetails),
    note: text(draft.note),
  };
}

/**
 * Substitute placeholders.
 *
 * An unknown placeholder is left alone rather than emptied — a body that reads "{clientname}" tells
 * whoever wrote it that they got the name wrong, where a body with a hole in it does not.
 */
export function fill(template, values) {
  return String(template == null ? '' : template).replace(/\{(\w+)\}/g, (whole, key) =>
    (key in values ? values[key] : whole));
}

/**
 * Tidy the result of substitution.
 *
 * Templates have optional lines in them — payment details, a terms line — and when those are empty
 * they leave a blank line where a paragraph break used to be, then another, until a message ends
 * with four inches of nothing. Collapsing runs of blank lines is what makes one template work for
 * a business that has filled everything in and one that has not.
 */
function tidy(body) {
  return String(body || '')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Build the message for one document.
 *
 * Returns everything every route needs; each takes the parts it can use. `overrides` lets the send
 * panel carry whatever the user has typed over the template without editing the template itself.
 */
export function buildMessage(templateId, draft, settings = {}, overrides = {}) {
  const template = findTemplate(templateId);
  const values = placeholdersFor(draft, settings, overrides.now || new Date());

  // Three layers, most specific first: what was typed for THIS send, then the business's own
  // wording saved in Settings, then the built-in text. Layering here, in the one function every
  // route calls, is what makes a saved wording reach the mail client, the clipboard, the outbox
  // and the endpoint alike.
  const saved = (settings.messages || {})[template.id] || {};
  const subject = tidy(fill(overrides.subject != null ? overrides.subject : saved.subject != null ? saved.subject : template.subject, values));
  const body = tidy(fill(overrides.body != null ? overrides.body : saved.body != null ? saved.body : template.body, values));

  const to = text(overrides.to != null ? overrides.to : values.client_email);

  return {
    templateId: template.id,
    to,
    cc: text(overrides.cc != null ? overrides.cc : settings.cc),
    bcc: text(overrides.bcc != null ? overrides.bcc : settings.bcc),
    replyTo: text(settings.replyTo || values.sender_email),
    fromName: values.sender_name,
    subject,
    body,
    values,
    // What the message is ABOUT, carried alongside it so an automation on the far end can file it,
    // match a payment against it, or refuse to send twice.
    document: {
      kind: draft.kind,
      number: values.number,
      status: values.status,
      issued: values.issued,
      due: values.due,
      total: (draft.totals || {}).total,
      balance: (draft.totals || {}).balance,
      currency: draft.currency,
      client: values.client_name,
      rowId: draft.rowId ?? null,
    },
    problems: to ? [] : ['This client has no email address, so there is nobody to send it to.'],
  };
}
