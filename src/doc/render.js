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

import { el, fromHTML } from '../core/util.js';
import { formatMoney } from '../money/currency.js';
import { fieldsFor, lineColumns, totalLabels } from './fields.js';
import { labelOr, localiseStatus, formatDate } from './lang.js';
import { paymentCode, accountLines, qrSvg } from './payment.js';
import { firstAttachmentId } from '../core/grist/bridge.js';
import { renderMasthead, isWindowed } from './layouts.js';
import { addressLines } from './address.js';

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
export function docDate(v, lang = 'en') {
  if (v == null || v === '') return '—';
  if (typeof v === 'number' && isFinite(v)) return fromEpoch(v, lang);

  const s = String(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) {
    if (!lang || lang === 'en') return `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}`;
    return formatDate(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])), lang);
  }
  if (/^\d{9,13}$/.test(s)) return fromEpoch(Number(s), lang);
  return s;
}

function fromEpoch(n, lang) {
  // Seconds or milliseconds: anything past 1e11 seconds would be the year 5138, so it is millis.
  const d = new Date(Math.abs(n) > 1e11 ? n : n * 1000);
  if (isNaN(d.getTime())) return String(n);
  // Read in UTC, matching how the write side stores a day — otherwise a date west of Greenwich
  // renders as the day before the one that was typed.
  return formatDate(d, lang);
}

/** Money, in the currency the document is actually in. See money/currency.js for the real rules. */
export function money(value, currency = 'USD') {
  return formatMoney(value, { currency });
}

/** "VAT 20%", or just the name when there is no single rate worth printing. */
export function taxLabel(line, fallback = 'Tax') {
  const rate = line.rate;
  if (rate == null || !isFinite(Number(rate))) return line.name || fallback;
  return `${line.name || fallback} ${Number(rate)}%`;   // trailing zeros off: 20%, not 20.000%
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

// The address lines come from ./address.js, which knows which countries write the postcode
// before the town — shared with the PDF and the email so the three cannot disagree.

/** One cell of the lines table, by column id. */
function lineCell(line, col, M, lang, index = 0) {
  switch (col.id) {
    case 'position': return String(index + 1);
    case 'description': return text(line.description) || '—';
    case 'hsn': return text(line.hsn) || '—';
    case 'quantity': return String(line.quantity ?? '');
    case 'unit': return text(line.unit);
    case 'unitPrice': return M(line.unitPrice);
    case 'discount': return line.discountAmount ? '−' + M(line.discountAmount) : '';
    case 'amount': return M(line.amount);
    // Statement columns
    case 'date': return docDate(line.date, lang);
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

  const fields = fieldsFor(draft, settings, overrides);
  const { kind, L, lang } = fields;
  const cols = lineColumns(fields);
  const TL = totalLabels(fields, draft.totals);
  const t = draft.totals || {};
  const sender = draft.sender || {};
  const client = draft.client || {};
  const fmt = draft.format || { currency: draft.currency };
  const M = (v) => formatMoney(v, fmt);
  const date = (v) => docDate(v, lang);
  const taxIdLabel = labelOr(settings.taxNumberLabel, 'Tax ID', L.taxId);

  // The chip keeps the raw status as its data attribute — that is what the colours key on — and
  // shows the word in the document's language when it is one of the standard six.
  const statusPill = draft.status
    ? el('span', { class: 'inv-status', dataset: { status: draft.status.toLowerCase().replace(/\s+/g, '-') }, text: localiseStatus(draft.status, lang) })
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

  // The ledger and the DIN sheets: the client in the window, the sender in the foot.
  const windowed = isWindowed(draft.layout);
  const address = (p) => addressLines(p, lang);
  const clientLabel = kind.showsMoney ? L.billTo : L.deliverTo;
  const clientMeta = [
    client.email, client.phone,
    fields.showClientTaxNumber ? `${taxIdLabel}: ${client.taxNumber}` : '',
  ].filter(Boolean);

  // What the reader looks up: dates, references, the amount. One list, so the meta column of the
  // usual layouts and the grid of the ledger cannot disagree about what is on the document.
  const metas = [
    { label: kind.dateLabels.issued, value: date(draft.issued) },
    fields.showSecondDate ? { label: kind.dateLabels.second, value: date(draft.due) } : null,
    fields.showServiceDate ? { label: L.serviceDate, value: date(draft.serviceDate) } : null,
    // The client's own reference. Accounts payable match on this, not on our number, so an
    // invoice without it can sit unpaid while nobody is doing anything wrong.
    fields.showReference ? { label: labelOr(settings.referenceLabel, 'Your reference', L.yourReference), value: draft.reference } : null,
    fields.showRelated ? { label: L.refersTo, value: draft.relatedTo } : null,
    fields.showTotals ? { label: kind.totalLabel, value: M(fields.showPaid ? t.balance : t.total), cls: 'is-total' } : null,
  ].filter(Boolean);

  const head = renderMasthead(draft.layout, {
    logoPlate: settings.logoPlate !== false,
    logoOnly: !!settings.logoOnly,
    sender, word: kind.word, number: draft.number, statusPill, numberWarning, lang,
    // For the windowed layouts only: the client goes in the window and the number joins the
    // grid, first, because the reference the ledger copies keeps "Rechnungsnummer" there and
    // not in a title, and a DIN information block starts with it for the same reason.
    client, clientLabel, clientLines: address(client), clientMeta,
    clientTax: fields.showClientTaxNumber ? { label: taxIdLabel, value: client.taxNumber } : null,
    metas: windowed ? [{ label: L.number || 'Number', value: draft.number || '—', extra: numberWarning }, ...metas] : metas,
  });

  // Ship-to only when it differs from bill-to. Printing the same address twice under two headings
  // makes a reader check whether they have misread one of them.
  const shipTo = draft.shipTo && draft.shipTo.name && draft.shipTo.name !== client.name ? draft.shipTo : null;

  // The ledger's masthead has already said who the client is and what the numbers are, and its
  // foot will say who the sender is; the spread would repeat all three.
  const parties = windowed ? null : el('section', { class: 'inv-parties' + (shipTo ? ' has-shipto' : '') }, [
    party(L.from, sender.name, address(sender), [
      sender.email, sender.phone,
      fields.showSenderTaxNumber ? `${taxIdLabel}: ${sender.taxNumber}` : '',
    ]),
    party(clientLabel, client.name, address(client), clientMeta),
    shipTo ? party(L.shipTo, shipTo.name, address(shipTo), []) : null,
    el('div', { class: 'inv-metas' }, metas.map((m) => metaField(m.label, m.value, m.cls))),
  ]);

  // The thumbnail column exists only when there is at least one thumbnail to put in it, so a
  // document without pictures is exactly the document it was before pictures existed.
  const showImages = !!fields.showImages;
  const table = el('table', { class: 'inv-lines' }, [
    el('thead', {}, [el('tr', {}, [
      showImages ? el('th', { scope: 'col', class: 'is-img', 'aria-label': L.columns.image }) : null,
      ...cols.map((c) => el('th', { scope: 'col', class: c.numeric ? 'is-num' : c.id === 'position' ? 'is-pos' : null, text: c.label })),
    ])]),
    el('tbody', {}, (draft.lines || []).map((line, index) => {
      const src = showImages ? imageSrc(line.image, overrides.resolveImage) : null;
      return el('tr', {}, [
        showImages ? el('td', { class: 'is-img' }, src ? [el('img', { class: 'inv-lines__img', src, alt: '', loading: 'lazy' })] : []) : null,
        ...cols.map((c) => el('td', { class: c.numeric ? 'is-num' : c.id === 'position' ? 'is-pos' : null, text: lineCell(line, c, M, lang, index) })),
      ]);
    })),
  ]);

  const totals = fields.showTotals
    ? el('section', { class: 'inv-totals' }, [
        totalRow(TL.subtotal, M((t.discountTotal ? (t.subtotalBeforeDiscount ?? t.subtotal) : t.subtotal))),
        t.discountTotal ? totalRow(TL.discount, '−' + M((t.discountShown ?? t.discountTotal))) : null,
        t.shipping?.amount ? totalRow(TL.shipping, M(t.shipping.amount)) : null,
        // Every tax line, in the order it was applied. A split tax has to be shown split — an
        // Indian invoice reading "Tax 180" instead of CGST 90 and SGST 90 is not a valid document.
        ...(fields.showTax ? (t.taxLines || []) : []).map((l) => totalRow(taxLabel(l, L.tax), M(l.amount))),
        // An exemption is not the same as no tax, and the reason has to be on the document — a
        // reverse-charged invoice that simply omits VAT looks like one that forgot to charge it.
        t.exempt ? el('div', { class: 'inv-total inv-total--note', text: t.exempt.reason }) : null,
        totalRow(TL.total, M(t.total), 'is-grand'),
        fields.showPaid ? totalRow(TL.paid, '−' + M(t.amountPaid)) : null,
        fields.showPaid ? totalRow(kind.totalLabel, M(t.balance), 'is-grand') : null,
      ])
    : null;

  // The standing statements: what this document is, how to pay it, what was agreed.
  const foot = [];
  if (fields.legend) foot.push(el('p', { class: 'inv-legend', text: fields.legend }));
  if (fields.showNote) foot.push(block(L.note, draft.note));
  if (fields.showTerms) foot.push(block(L.paymentTerms, draft.terms));
  if (fields.showPaymentDetails) foot.push(block(labelOr(settings.paymentDetailsLabel, 'How to pay', L.howToPay), settings.paymentDetails));
  // A way to pay, scannable: the SEPA code, the UPI code, or the payment link. Only on documents
  // that ask for money, only while something is owed — see ./payment.js.
  const pay = paymentCode(draft, settings, fields);
  if (pay) {
    foot.push(el('div', { class: 'inv-pay' }, [
      fromHTML(qrSvg(pay.code, 96, `${pay.caption}: ${pay.lines.join(', ')}`)),
      el('div', { class: 'inv-pay__text' }, [
        el('div', { class: 'inv-party__label', text: pay.caption }),
        ...pay.lines.map((l) => el('div', { class: 'inv-pay__line', text: l })),
      ]),
    ]));
  }
  // The account in words when no code carried it: an IBAN on a non-euro document, or beside a
  // payment link. The EPC block above already prints these lines, so it is skipped there.
  const bank = accountLines(draft, settings, fields);
  if (bank && !(pay && pay.kind === 'epc')) {
    foot.push(el('div', { class: 'inv-foot__item inv-bank' }, [
      el('div', { class: 'inv-party__label', text: bank.caption }),
      ...bank.lines.map((l) => el('div', { class: 'inv-pay__line', text: l })),
    ]));
  }
  if (fields.showSignature) {
    foot.push(el('div', { class: 'inv-sign' }, [
      el('div', { class: 'inv-sign__rule' }),
      el('div', { class: 'inv-party__label', text: L.receivedBy }),
    ]));
  }

  const closing = text(settings.closingText)
    ? el('p', { class: 'inv-closing', text: settings.closingText }) : null;
  // The legal line last and smallest: registration, court, director — read by the people who
  // look for it and invisible to everyone else. The ledger carries it in its foot instead.
  const legal = text(sender.legalText) && !windowed ? el('p', { class: 'inv-legal', text: sender.legalText }) : null;

  // The ledger's foot: the sender in three columns the way commercial stationery prints it —
  // who and where, the registrations, how to reach them. This is where its masthead's missing
  // From block went, so nothing a reader needs about the sender has left the document.
  const colophon = windowed ? el('footer', { class: 'inv-colophon' }, [
    el('div', { class: 'inv-colophon__col' }, [
      el('div', { class: 'inv-colophon__name', text: sender.name || 'Your business' }),
      ...address(sender).map((l) => el('div', { text: l })),
    ]),
    el('div', { class: 'inv-colophon__col' }, [
      text(sender.taxNumber) ? el('div', { text: `${taxIdLabel}: ${sender.taxNumber}` }) : null,
      ...text(sender.legalText).split(/\n+/).filter(Boolean).map((l) => el('div', { text: l })),
    ]),
    el('div', { class: 'inv-colophon__col' }, [
      sender.email ? el('div', { text: sender.email }) : null,
      sender.phone ? el('div', { text: sender.phone }) : null,
      sender.website ? el('div', { text: sender.website }) : null,
    ]),
  ]) : null;

  // On the ledger the totals share a row with the delivery address, the way a shop's invoice
  // closes: where it went on the left, what it cost on the right.
  const close = windowed && (shipTo || totals)
    ? el('section', { class: 'inv-ledger__close' }, [
        shipTo ? party(L.shipTo, shipTo.name, address(shipTo), []) : el('div'),
        totals,
      ])
    : totals;
  // Who made the tool, in the document's own language, smaller than the legal line and last of
  // all. Off unless the shell asks for it: the free web version turns it on because that is what
  // it is paid in, and the widget leaves it alone because somebody else's invoice is not our
  // advertising hoarding. Either way it is one setting away from gone.
  const credit = settings.creditLine ? el('p', { class: 'inv-credit', text: L.madeWith }) : null;

  const article = el('article', {
    class: `inv-doc is-${draft.layout || 'classic'} is-kind-${kind.id}`,
    lang,
  }, [
    head,
    parties,
    el('section', { class: 'inv-linesbox' }, [table]),
    close,
    foot.length ? el('section', { class: 'inv-foot' }, foot) : null,
    closing,
    legal,
    colophon,
    credit,
  ]);

  // setProperty, not el()'s style prop: a CSS CUSTOM property assigned through Object.assign onto
  // a style declaration is silently dropped — it becomes a plain JS property on the object and
  // never reaches the element. That is why a chosen accent colour used to render as the
  // stylesheet's default. (The shared el() has been fixed upstream too; this stays because it is
  // the one line that has to be right whichever version of the core is in place.)
  if (settings.accent) article.style.setProperty('--doc-accent', settings.accent);
  // The logo's height, one variable every masthead reads.
  const logoH = { small: '32px', normal: '46px', large: '68px' }[settings.logoSize];
  if (logoH) article.style.setProperty('--logo-h', logoH);
  return article;
}

function block(label, body) {
  return el('div', { class: 'inv-foot__item' }, [
    el('div', { class: 'inv-party__label', text: label }),
    el('p', { text: body }),
  ]);
}
