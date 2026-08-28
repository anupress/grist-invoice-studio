// The document, rebuilt for email.
//
// This exists because the on-screen document cannot go in an email. It is laid out with CSS grid
// and flexbox, and mail clients — Outlook above all, which renders with Word — strip both, along
// with `<style>` blocks, class names, and most of what a modern page is made of. Pasting the real
// document into an email produces a column of unstyled text in roughly the wrong order.
//
// So this is the same document expressed the way email actually works: nested tables, inline styles,
// widths as attributes, and nothing cleverer than that. It looks like 1999 because email is 1999,
// and it will keep working when everything else has moved on.
//
// It reads the SAME kinds and fields descriptions as the screen and the PDF — doc/kinds.js and
// doc/fields.js — so a delivery note has no prices here for exactly the reason it has none there.

import { formatMoney } from '../money/currency.js';
import { documentKind } from '../doc/kinds.js';
import { fieldsFor, lineColumns } from '../doc/fields.js';
import { docDate, imageSrc } from '../doc/render.js';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const INK = '#16212c';
const MUTED = '#5f7285';
const RULE = '#dfe5ec';

// 600px is the width every email design has settled on: it fits the reading pane in Outlook without
// a horizontal scrollbar, and it is what mobile clients expect to shrink from.
const WIDTH = 600;

const F = "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * The logo, if there is one this body can safely carry.
 *
 * The shape is re-checked here rather than trusted, because this string is pasted into mail clients
 * and webhook payloads — only a well-formed image data URI may reach an src attribute. Some clients
 * (Gmail among them) strip data URI images entirely; the name printed beside it means the header
 * still says who it is from when the image is gone.
 */
function logoTag(sender) {
  const src = String(sender.logoData || '');
  if (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(src)) return '';
  return `<img src="${src}" alt="" height="40" style="display:block;max-height:40px;margin-bottom:6px;border:0" />`;
}

const label = (text) => `<td style="${F};font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${MUTED};padding:0 0 4px">${esc(text)}</td>`;

/** One party as a stacked block. */
function party(heading, p, extra) {
  const lines = [
    p.street1, p.street2,
    [p.city, p.state, p.postcode].map((x) => String(x || '').trim()).filter(Boolean).join(' '),
    p.country,
  ].map((x) => String(x || '').trim()).filter(Boolean);

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr>${label(heading)}</tr>
<tr><td style="${F};font-size:14px;font-weight:700;color:${INK};padding:0 0 3px">${esc(p.name || '—')}</td></tr>
${lines.map((l) => `<tr><td style="${F};font-size:13px;color:${INK};line-height:1.45">${esc(l)}</td></tr>`).join('')}
${(extra || []).filter(Boolean).map((l) => `<tr><td style="${F};font-size:12px;color:${MUTED};line-height:1.45">${esc(l)}</td></tr>`).join('')}
</table>`;
}

/** A cell of the lines table, as the string it prints as. */
function cell(line, col, money) {
  switch (col.id) {
    case 'description': {
      // Only a stable source — https or a data URI — ever reaches an email. An attachment's token
      // URL would die within minutes of the message arriving, which is worse than no picture.
      const src = imageSrc(line.image);
      const img = src ? `<img src="${esc(src)}" alt="" width="34" height="34" style="width:34px;height:34px;object-fit:cover;border-radius:4px;vertical-align:middle;margin-right:8px;border:0" />` : '';
      return img + esc(line.description || '');
    }
    case 'hsn': return esc(line.hsn || '—');
    case 'quantity': return esc(String(line.quantity ?? ''));
    case 'unit': return esc(line.unit || '');
    case 'unitPrice': return esc(money(line.unitPrice));
    case 'discount': return line.discountAmount ? '&minus;' + esc(money(line.discountAmount)) : '';
    case 'amount': return esc(money(line.amount));
    case 'date': return esc(docDate(line.date));
    case 'reference': return esc(line.reference || '');
    case 'charge': return line.charge != null ? esc(money(line.charge)) : '';
    case 'paid': return line.paid != null ? esc(money(line.paid)) : '';
    case 'balance': return line.balance != null ? esc(money(line.balance)) : '';
    default: return '';
  }
}

/**
 * The whole document, as email HTML.
 *
 * Returns a fragment rather than a full page, so it can be dropped into the body of a message
 * alongside the covering note — which is the point: a client who will not open an attachment can
 * still read the invoice.
 */
export function documentToEmailHtml(draft, settings = {}) {
  if (!draft) return '';
  const kind = documentKind(draft.kind);
  const fields = fieldsFor(draft, settings);
  const cols = lineColumns(fields);
  const t = draft.totals || {};
  const sender = draft.sender || {};
  const client = draft.client || {};
  const fmt = draft.format || { currency: draft.currency };
  const money = (v) => formatMoney(v, fmt);
  const accent = settings.accent || '#14509b';

  // ---- masthead -------------------------------------------------------------------------------
  const head = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-bottom:2px solid ${accent};padding-bottom:14px">
<tr>
<td align="left" valign="top" style="${F};font-size:19px;font-weight:700;color:${INK}">${logoTag(sender)}${esc(sender.name || 'Your business')}</td>
<td align="right" valign="top">
<div style="${F};font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${accent}">${esc(kind.word)}</div>
<div style="${F};font-size:16px;color:${INK};padding-top:2px">${esc(draft.number || '—')}</div>
${draft.status ? `<div style="${F};font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${MUTED};padding-top:4px">${esc(draft.status)}</div>` : ''}
</td>
</tr>
</table>`;

  // ---- parties + dates -------------------------------------------------------------------------
  const metaRows = [
    [kind.dateLabels.issued, docDate(draft.issued)],
    fields.showSecondDate ? [kind.dateLabels.second, docDate(draft.due)] : null,
    fields.showReference ? [settings.referenceLabel || 'Your reference', draft.reference] : null,
  ].filter(Boolean);

  const parties = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="padding:18px 0 0">
<tr>
<td valign="top" width="46%">${party('From', sender, [sender.email, sender.phone,
    fields.showSenderTaxNumber ? `${settings.taxNumberLabel || 'Tax ID'}: ${sender.taxNumber}` : ''])}</td>
<td width="4%"></td>
<td valign="top" width="50%">${party(kind.showsMoney ? 'Bill to' : 'Deliver to', client, [client.email,
    fields.showClientTaxNumber ? `${settings.taxNumberLabel || 'Tax ID'}: ${client.taxNumber}` : ''])}</td>
</tr>
</table>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="padding:16px 0 0">
<tr>${metaRows.map(([l]) => label(l)).join('')}${fields.showTotals ? label(kind.totalLabel) : ''}</tr>
<tr>${metaRows.map(([, v]) => `<td style="${F};font-size:13px;color:${INK}">${esc(v)}</td>`).join('')}
${fields.showTotals ? `<td style="${F};font-size:17px;font-weight:700;color:${accent}">${esc(money(fields.showPaid ? t.balance : t.total))}</td>` : ''}</tr>
</table>`;

  // ---- the lines --------------------------------------------------------------------------------
  const lineRows = (draft.lines || []).map((line) => `<tr>${cols.map((c) => `<td align="${c.numeric ? 'right' : 'left'}" style="${F};font-size:13px;color:${INK};padding:8px 6px;border-bottom:1px solid ${RULE}">${cell(line, c, money)}</td>`).join('')}</tr>`).join('');

  const table = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="padding:20px 0 0;border-collapse:collapse">
<tr>${cols.map((c) => `<th align="${c.numeric ? 'right' : 'left'}" style="${F};font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${MUTED};padding:0 6px 6px;border-bottom:1px solid ${RULE}">${esc(c.label)}</th>`).join('')}</tr>
${lineRows}
</table>`;

  // ---- totals -------------------------------------------------------------------------------------
  const totalRow = (l, v, big) => `<tr>
<td align="right" style="${F};font-size:${big ? 15 : 13}px;${big ? 'font-weight:700;' : ''}color:${big ? INK : MUTED};padding:${big ? '8px 6px 0' : '3px 6px'}${big ? `;border-top:1px solid ${RULE}` : ''}">${esc(l)}</td>
<td align="right" width="110" style="${F};font-size:${big ? 15 : 13}px;${big ? 'font-weight:700;' : ''}color:${INK};padding:${big ? '8px 0 0' : '3px 0'}${big ? `;border-top:1px solid ${RULE}` : ''}">${esc(v)}</td>
</tr>`;

  const totals = !fields.showTotals ? '' : `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right" style="padding:14px 0 0;border-collapse:collapse">
${totalRow('Subtotal', money(t.subtotal))}
${t.discountTotal ? totalRow(t.discounts?.[0]?.label || 'Discount', '−' + money(t.discountTotal)) : ''}
${t.shipping?.amount ? totalRow(t.shipping.label || 'Shipping', money(t.shipping.amount)) : ''}
${(fields.showTax ? (t.taxLines || []) : []).map((l) => totalRow(l.rate != null ? `${l.name} ${Number(l.rate)}%` : l.name, money(l.amount))).join('')}
${t.exempt ? `<tr><td colspan="2" align="right" style="${F};font-size:11px;font-style:italic;color:${MUTED};padding:4px 0">${esc(t.exempt.reason)}</td></tr>` : ''}
${totalRow(kind.id === 'credit_note' ? 'Total credit' : 'Total', money(t.total), true)}
${fields.showPaid ? totalRow('Paid', '−' + money(t.amountPaid)) : ''}
${fields.showPaid ? totalRow(kind.totalLabel, money(t.balance), true) : ''}
</table>
<div style="clear:both"></div>`;

  // ---- the standing wording ---------------------------------------------------------------------
  const block = (heading, body) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="padding:14px 0 0">
${heading ? `<tr>${label(heading)}</tr>` : ''}
<tr><td style="${F};font-size:13px;color:${INK};line-height:1.5">${esc(body).replace(/\n/g, '<br>')}</td></tr>
</table>`;

  const foot = [
    fields.legend ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="padding:16px 0 0"><tr><td style="${F};font-size:12px;color:${INK};background:#f2f5f8;padding:9px 12px;line-height:1.5">${esc(fields.legend)}</td></tr></table>` : '',
    fields.showNote ? block('Note', draft.note) : '',
    fields.showTerms ? block('Payment terms', draft.terms) : '',
    fields.showPaymentDetails ? block(settings.paymentDetailsLabel || 'How to pay', settings.paymentDetails) : '',
  ].join('');

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${WIDTH}" style="width:${WIDTH}px;max-width:100%;background:#ffffff;border:1px solid ${RULE};border-radius:4px;border-collapse:separate">
<tr><td style="padding:22px 24px 26px">
${head}${parties}${table}${totals}${foot}
</td></tr>
</table>`;
}
