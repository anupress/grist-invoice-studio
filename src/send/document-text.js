// The document as plain text.
//
// For the one route that can carry nothing else. A `mailto:` link cannot attach a file — that is
// the protocol, not an omission — and its body is text/plain by definition, so the HTML version
// next door is no use there. Without this, the mail client route sends a covering note that refers
// to an invoice the recipient has not been given.
//
// Written to stay SHORT. A mailto: URL has a practical ceiling around two thousand characters, and
// past it the body is silently truncated rather than rejected, so an invoice that runs long arrives
// as an email that stops mid-sentence. Every choice here — one line per item, no column padding, no
// box drawing — buys room under that ceiling. mailto.js still guards the limit; this keeps a normal
// invoice comfortably inside it rather than relying on the guard.

import { formatMoney } from '../money/currency.js';
import { documentKind } from '../doc/kinds.js';
import { fieldsFor } from '../doc/fields.js';
import { docDate } from '../doc/render.js';

/**
 * Render the document as text.
 *
 * Reads the same field rules the screen and the PDF read, so a delivery note shows no prices here
 * for exactly the reason it shows none there — decided once, in doc/fields.js.
 */
export function documentToPlainText(draft, settings = {}) {
  if (!draft) return '';
  const kind = documentKind(draft.kind);
  const fields = fieldsFor(draft, settings);
  const t = draft.totals || {};
  const fmt = draft.format || { currency: draft.currency };
  const money = (v) => formatMoney(v, fmt);

  const out = [];
  out.push(`${kind.word.toUpperCase()} ${draft.number || ''}`.trim());

  const dates = [`${kind.dateLabels.issued} ${docDate(draft.issued)}`];
  if (fields.showSecondDate && draft.due) dates.push(`${kind.dateLabels.second} ${docDate(draft.due)}`);
  out.push(dates.join('  ·  '));
  if (fields.showReference && draft.reference) {
    out.push(`${settings.referenceLabel || 'Your reference'}: ${draft.reference}`);
  }
  out.push('');

  // One line per item. Quantity first, because that is what a reader checks against what arrived.
  // A statement's rows are not items at all — they are documents with a running balance — so they
  // print as date, reference and figures instead of pretending to be quantities of something.
  for (const l of draft.lines || []) {
    if (l.charge != null || l.paid != null || l.balance != null) {
      out.push([
        docDate(l.date),
        String(l.reference || l.description || '').trim(),
        l.charge != null ? money(l.charge) : '',
        l.paid != null ? `paid ${money(l.paid)}` : '',
        l.balance != null ? `balance ${money(l.balance)}` : '',
      ].filter(Boolean).join('  ·  '));
      continue;
    }
    const desc = String(l.description || '').trim();
    if (!desc && !l.amount) continue;
    if (!kind.showsMoney) {
      out.push(`${l.quantity} × ${desc}`);
      continue;
    }
    out.push(`${l.quantity} × ${desc} — ${money(l.amount)}`);
  }

  if (fields.showTotals) {
    out.push('');
    out.push(`Subtotal ${money(t.subtotal)}`);
    if (t.discountTotal) out.push(`${t.discounts?.[0]?.label || 'Discount'} −${money(t.discountTotal)}`);
    if (t.shipping?.amount) out.push(`${t.shipping.label || 'Shipping'} ${money(t.shipping.amount)}`);
    if (fields.showTax) {
      for (const l of t.taxLines || []) {
        out.push(`${l.rate != null ? `${l.name} ${Number(l.rate)}%` : l.name} ${money(l.amount)}`);
      }
    }
    out.push(`Total ${money(t.total)}`);
    if (fields.showPaid) {
      out.push(`Paid −${money(t.amountPaid)}`);
      out.push(`${kind.totalLabel} ${money(t.balance)}`);
    }
  }

  // The wording that asks for money belongs with the figures, not in the covering note: a client
  // reading only the quoted document still learns where to send it.
  if (fields.showPaymentDetails && settings.paymentDetails) {
    out.push('');
    out.push(settings.paymentDetailsLabel || 'How to pay');
    out.push(String(settings.paymentDetails).trim());
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
