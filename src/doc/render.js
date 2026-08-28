// The document itself.
//
// Takes a draft and nothing else — no provider, no schema, no Grist. That constraint is what lets
// the composer render an invoice that has never been saved using exactly the same code as a stored
// row, instead of the two drifting apart and disagreeing about what a total is.
//
// The page is assembled from three descriptions rather than written out longhand:
//   ./kinds.js    what kind of document this is, and what that changes
//   ./fields.js   which parts appear, mostly derived rather than configured
//   ./layouts.js  how the top of the page introduces the sender
//
// Two things here are deliberate corrections of how Grist's own invoice widget behaves. It
// hardcodes US dollars, with no setting anywhere, so every invoice it has ever produced in any
// country is denominated in dollars. And it hardcodes `MMMM DD, YYYY`, which is American order.
// Ours takes the currency from the document and writes dates unambiguously.

import { el } from '../core/util.js';
import { formatMoney } from '../money/currency.js';
import { documentKind } from './kinds.js';
import { fieldsFor, lineColumns } from './fields.js';
import { firstAttachmentId } from '../core/grist/bridge.js';
import { renderMasthead } from './layouts.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A date for a document rather than a dashboard: "28 Aug 2026", never "2026-08-28" or "08/09".
 *
 * A raw epoch is handled as well as a day string. Grist stores dates as epoch seconds and the
 * provider normally converts them on read, but "normally" is doing work in that sentence: any path
 * that reaches the renderer without passing through that conversion would otherwise print
 * "1784505600" on the face of an invoice. Printing the number is never the right answer, so the
 * fallback belongs here rather than in a comment about how it cannot happen.
 */
export function docDate(v) {
  if (v == null || v === '') return '—';
  if (typeof v === 'number' && isFinite(v)) return fromEpoch(v);

  const s = String(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}`;
  if (/^\d{9,13}$/.test(s)) return fromEpoch(Number(s));
  return s;
}

function fromEpoch(n) {
  // Seconds or milliseconds: anything past 1e11 seconds would be the year 5138, so it is millis.
  const d = new Date(Math.abs(n) > 1e11 ? n : n * 1000);
  if (isNaN(d.getTime())) return String(n);
  // Read in UTC, matching how the write side stores a day — otherwise a date west of Greenwich
  // renders as the day before the one that was typed.
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Money, in the currency the document is actually in. See money/currency.js for the real rules. */
export function money(value, currency = 'USD') {
  return formatMoney(value, { currency });
}

/** "VAT 20%", or just the name when there is no single rate worth printing. */
function taxLabel(line) {
  const rate = line.rate;
  if (rate == null || !isFinite(Number(rate))) return line.name || 'Tax';
  return `${line.name || 'Tax'} ${Number(rate)}%`;   // trailing zeros off: 20%, not 20.000%
}

const text = (v) => String(v == null ? '' : v).trim();

function party(label, name, lines, meta) {
  return el('div', { class: 'inv-party' }, [
    el('div', { class: 'inv-party__label', text: label }),
    el('div', { class: 'inv-party__name', text: name || '—' }),
    ...(lines || []).filter(Boolean).map((l) => el('div', { class: 'inv-party__line', text: l })),
    ...(meta || []).filter(Boolean).map((l) => el('div', { class: 'inv-party__line inv-party__line--meta', text: l })),
  ]);
}

function metaField(label, value, cls) {
  return el('div', { class: 'inv-meta' + (cls ? ' ' + cls : '') }, [
    el('div', { class: 'inv-meta__label', text: label }),
    el('div', { class: 'inv-meta__value', text: value }),
  ]);
}

function totalRow(label, value, cls) {
  return el('div', { class: 'inv-total' + (cls ? ' ' + cls : '') }, [
    el('span', { class: 'inv-total__label', text: label }),
    el('span', { class: 'inv-total__value', text: value }),
  ]);
}

const addressLines = (p) => [
  p.street1, p.street2,
  [p.city, p.state, p.postcode].map(text).filter(Boolean).join(' '),
  p.country,
].map(text).filter(Boolean);

/** One cell of the lines table, by column id. */
function lineCell(line, col, M) {
  switch (col.id) {
    case 'description': return text(line.description) || '—';
    case 'hsn': return text(line.hsn) || '—';
    case 'quantity': return String(line.quantity ?? '');
    case 'unit': return text(line.unit);
    case 'unitPrice': return M(line.unitPrice);
    case 'discount': return line.discountAmount ? '−' + M(line.discountAmount) : '';
    case 'amount': return M(line.amount);
    // Statement columns
    case 'date': return docDate(line.date);
    case 'reference': return text(line.reference);
    case 'charge': return line.charge != null ? M(line.charge) : '';
    case 'paid': return line.paid != null ? M(line.paid) : '';
    case 'balance': return line.balance != null ? M(line.balance) : '';
    default: return '';
  }
}

/**
 * The document, as a detached element.
 *
 * `settings` supplies the things that are the same on every document — payment details, the
 * closing line — and `overrides` lets a block force a field on or off.
 */
/**
 * What an image cell can actually be shown as.
 *
 * A string is trusted only when it is somewhere an <img> can safely go — https, or a data URI.
 * An Attachments cell is a list-tuple holding ids; those need the resolver main.js provides,
 * which trades an id for a short-lived token URL. Exports pass NO resolver on purpose: a token
 * URL frozen into a downloaded file or an email dies within minutes, and a picture that decays
 * is worse than none.
 */
export function imageSrc(cell, resolver) {
  if (cell == null || cell === '') return null;
  if (typeof cell === 'string') {
    const s = cell.trim();
    return /^(https:\/\/|data:image\/)/i.test(s) ? s : null;
  }
  const id = firstAttachmentId(cell);
  return id != null && resolver ? resolver(id) : null;
}

export function renderDocument(draft, settings = {}, overrides = {}) {
  if (!draft) return el('div', { class: 'inv-empty', text: 'No document selected.' });

  const kind = documentKind(draft.kind);
  const fields = fieldsFor(draft, settings, overrides);
  const cols = lineColumns(fields);
  const t = draft.totals || {};
  const sender = draft.sender || {};
  const client = draft.client || {};
  const fmt = draft.format || { currency: draft.currency };
  const M = (v) => formatMoney(v, fmt);

  const statusPill = draft.status
    ? el('span', { class: 'inv-status', dataset: { status: draft.status.toLowerCase().replace(/\s+/g, '-') }, text: draft.status })
    : null;

  // Said on the document, because this is exactly where it matters: a number computed from the row
  // id changes when an earlier invoice is deleted, and the person who needs to know that is the one
  // about to send it.
  const numberWarning = draft.numberIsDerived
    ? el('abbr', {
        class: 'inv-title__warn',
        title: 'This number is calculated from the row id, so deleting an earlier document will change it. Upgrade the document to store it instead.',
        text: '!',
      })
    : null;

  const head = renderMasthead(draft.layout, {
    sender, word: kind.word, number: draft.number, statusPill, numberWarning,
  });

  // Ship-to only when it differs from bill-to. Printing the same address twice under two headings
  // makes a reader check whether they have misread one of them.
  const shipTo = draft.shipTo && draft.shipTo.name && draft.shipTo.name !== client.name ? draft.shipTo : null;

  const parties = el('section', { class: 'inv-parties' + (shipTo ? ' has-shipto' : '') }, [
    party('From', sender.name, addressLines(sender), [
      sender.email, sender.phone,
      fields.showSenderTaxNumber ? `${settings.taxNumberLabel || 'Tax ID'}: ${sender.taxNumber}` : '',
    ]),
    party(kind.showsMoney ? 'Bill to' : 'Deliver to', client.name, addressLines(client), [
      client.email, client.phone,
      fields.showClientTaxNumber ? `${settings.taxNumberLabel || 'Tax ID'}: ${client.taxNumber}` : '',
    ]),
    shipTo ? party('Ship to', shipTo.name, addressLines(shipTo), []) : null,
    el('div', { class: 'inv-metas' }, [
      metaField(kind.dateLabels.issued, docDate(draft.issued)),
      fields.showSecondDate ? metaField(kind.dateLabels.second, docDate(draft.due)) : null,
      // The client's own reference. Accounts payable match on this, not on our number, so an
      // invoice without it can sit unpaid while nobody is doing anything wrong.
      fields.showReference ? metaField(settings.referenceLabel || 'Your reference', draft.reference) : null,
      fields.showTotals ? metaField(kind.totalLabel, M(fields.showPaid ? t.balance : t.total), 'is-total') : null,
    ]),
  ]);

  // The thumbnail column exists only when there is at least one thumbnail to put in it, so a
  // document without pictures is exactly the document it was before pictures existed.
  const showImages = !!fields.showImages;
  const table = el('table', { class: 'inv-lines' }, [
    el('thead', {}, [el('tr', {}, [
      showImages ? el('th', { scope: 'col', class: 'is-img', 'aria-label': 'Image' }) : null,
      ...cols.map((c) => el('th', { scope: 'col', class: c.numeric ? 'is-num' : null, text: c.label })),
    ])]),
    el('tbody', {}, (draft.lines || []).map((line) => {
      const src = showImages ? imageSrc(line.image, overrides.resolveImage) : null;
      return el('tr', {}, [
        showImages ? el('td', { class: 'is-img' }, src ? [el('img', { class: 'inv-lines__img', src, alt: '', loading: 'lazy' })] : []) : null,
        ...cols.map((c) => el('td', { class: c.numeric ? 'is-num' : null, text: lineCell(line, c, M) })),
      ]);
    })),
  ]);

  const totals = fields.showTotals
    ? el('section', { class: 'inv-totals' }, [
        totalRow('Subtotal', M(t.subtotal)),
        t.discountTotal ? totalRow(t.discounts?.[0]?.label || 'Discount', '−' + M(t.discountTotal)) : null,
        t.shipping?.amount ? totalRow(t.shipping.label || 'Shipping', M(t.shipping.amount)) : null,
        // Every tax line, in the order it was applied. A split tax has to be shown split — an
        // Indian invoice reading "Tax 180" instead of CGST 90 and SGST 90 is not a valid document.
        ...(fields.showTax ? (t.taxLines || []) : []).map((l) => totalRow(taxLabel(l), M(l.amount))),
        // An exemption is not the same as no tax, and the reason has to be on the document — a
        // reverse-charged invoice that simply omits VAT looks like one that forgot to charge it.
        t.exempt ? el('div', { class: 'inv-total inv-total--note', text: t.exempt.reason }) : null,
        totalRow(kind.id === 'credit_note' ? 'Total credit' : 'Total', M(t.total), 'is-grand'),
        fields.showPaid ? totalRow('Paid', '−' + M(t.amountPaid)) : null,
        fields.showPaid ? totalRow(kind.totalLabel, M(t.balance), 'is-grand') : null,
      ])
    : null;

  // The standing statements: what this document is, how to pay it, what was agreed.
  const foot = [];
  if (fields.legend) foot.push(el('p', { class: 'inv-legend', text: fields.legend }));
  if (fields.showNote) foot.push(block('Note', draft.note));
  if (fields.showTerms) foot.push(block('Payment terms', draft.terms));
  if (fields.showPaymentDetails) foot.push(block(settings.paymentDetailsLabel || 'How to pay', settings.paymentDetails));
  if (fields.showSignature) {
    foot.push(el('div', { class: 'inv-sign' }, [
      el('div', { class: 'inv-sign__rule' }),
      el('div', { class: 'inv-party__label', text: 'Received by' }),
    ]));
  }

  const closing = text(settings.closingText)
    ? el('p', { class: 'inv-closing', text: settings.closingText }) : null;

  return el('article', {
    class: `inv-doc is-${draft.layout || 'classic'} is-kind-${kind.id}`,
    style: settings.accent ? { '--doc-accent': settings.accent } : null,
  }, [
    head,
    parties,
    el('section', { class: 'inv-linesbox' }, [table]),
    totals,
    foot.length ? el('section', { class: 'inv-foot' }, foot) : null,
    closing,
  ]);
}

function block(label, body) {
  return el('div', { class: 'inv-foot__item' }, [
    el('div', { class: 'inv-party__label', text: label }),
    el('p', { text: body }),
  ]);
}
