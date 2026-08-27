// When to send what, and what to write down afterwards.
//
// Two separate jobs that both belong to "sending", kept together because they are two halves of one
// idea: a document's state decides the message, and sending the message changes the state.
//
// This does not RUN anything on a schedule. A browser cannot: it is only alive while somebody has
// the page open, so a rule that fires "three days after the due date" would fire whenever the tab
// next happened to be open, which is worse than not firing at all. What it does is choose the right
// message for a document as it stands, and describe the rule plainly enough that the same logic can
// be set up in Grist — where it can genuinely run unattended. See ./outbox.js.

import { MESSAGE_TEMPLATES, findTemplate, daysBetween } from './message.js';

/** How many days past its due date a document is; negative means still to come. */
export function overdueBy(draft, now = new Date()) {
  if (!draft || !draft.due) return null;
  return daysBetween(draft.due, now.toISOString().slice(0, 10));
}

/**
 * Which message this document is asking for.
 *
 * Reads the document rather than being configured: a quote wants the quote message, a paid invoice
 * wants a receipt, and an overdue one wants whichever reminder matches how late it is — gentle at
 * three days, final at thirty. Somebody can always choose differently; this is what the panel opens
 * on, so that the common case is one click.
 */
export function suggestTemplate(draft, now = new Date()) {
  if (!draft) return MESSAGE_TEMPLATES[0].id;

  if (draft.kind === 'quote') return 'quote_sent';
  const status = String(draft.status || '').toLowerCase();
  if (status === 'paid') return 'payment_received';
  if (draft.kind === 'receipt') return 'payment_received';

  const late = overdueBy(draft, now);
  if (late != null) {
    // Ordered longest-overdue first, so thirty days does not match the three-day rule on its way
    // past. A document that is late enough for the final notice is not also due a gentle nudge.
    if (late >= 30) return 'reminder_final';
    if (late >= 3) return 'reminder_overdue';
    if (late >= 0) return 'reminder_overdue';
    if (late >= -3) return 'reminder_due_soon';
  }

  return 'invoice_sent';
}

/**
 * The rules as prose, for the setup page.
 *
 * Written out because the person reading it has to reproduce them in Grist's own Automations, and a
 * condition they have to reverse-engineer from our behaviour is one they will get subtly wrong.
 */
export const AUTOMATION_RULES = [
  { when: 'Status becomes Sent', send: 'invoice_sent', condition: '$Status == "Sent"' },
  { when: 'Three days before the due date', send: 'reminder_due_soon', condition: '$Due and ($Due - NOW().date()).days == 3 and $Status != "Paid"' },
  { when: 'Three days after the due date', send: 'reminder_overdue', condition: '$Due and (NOW().date() - $Due).days == 3 and $Status != "Paid"' },
  { when: 'Thirty days after the due date', send: 'reminder_final', condition: '$Due and (NOW().date() - $Due).days == 30 and $Status != "Paid"' },
  { when: 'Status becomes Paid', send: 'payment_received', condition: '$Status == "Paid"' },
];

/**
 * What to record on the document once a message has gone.
 *
 * Sending is a thing that happened to an invoice, and an invoice that does not remember being sent
 * is how a client gets chased for something they were never asked to pay. The status only moves
 * forward: a paid invoice that has a receipt emailed to it does not go back to being merely sent.
 */
export function stampAfterSend(draft, message, { now = new Date(), route = '' } = {}) {
  const template = findTemplate(message.templateId);
  const current = String(draft.status || '').toLowerCase();

  let status = draft.status;
  if (template.id === 'payment_received') status = 'Paid';
  else if (!current || current === 'draft') status = 'Sent';

  return {
    status,
    sentAt: now.toISOString().slice(0, 10),
    sentTo: message.to || '',
    // Not written to the document — shown in the toast, so a person can tell "opened in your mail
    // client" apart from "queued for automatic sending" a week later when they are wondering
    // whether it actually went.
    route,
  };
}
