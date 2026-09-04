// A way to pay, scannable.
//
// The gap between "here is an invoice" and "here is the money" is where a small business spends
// its afternoons. Three things close most of it without anybody running a server:
//
//   EPC   the European Payments Council's QR for a SEPA transfer — the "GiroCode". Nearly every
//         banking app in the euro area scans it and pre-fills the transfer: account, amount,
//         reference. The standard is euro-only, so it appears on euro documents with an IBAN.
//   UPI   India's equivalent, a upi:// link with the payee address and the amount. Rupee
//         documents with a UPI id.
//   link  any payment page the business already has — a Stripe payment link, PayPal.me, a bank's
//         own request page. A URL as a QR, with the URL printed beside it for anyone typing.
//
// Everything here is data in, data out: the payload text, the QR matrix, and the lines to print
// next to it. The renderers draw it — as SVG on screen, as vector squares in the PDF — and none
// of it leaves the browser, because none of it needs to.

import { encodeQR } from '../core/qr/encoder.js';
import { labels } from './lang.js';

const clean = (s) => String(s == null ? '' : s).trim();

/** An IBAN as the standard wants it: upper case, no spaces. */
export const normaliseIban = (s) => clean(s).replace(/\s+/g, '').toUpperCase();

/** Roughly an IBAN — country, two check digits, then up to thirty more. Not a checksum. */
export const looksLikeIban = (s) => /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(normaliseIban(s));

/** An IBAN in the groups of four a person reads it in. */
export function formatIban(s) {
  return normaliseIban(s).replace(/(.{4})/g, '$1 ').trim();
}

/**
 * The EPC069-12 payload, version 002.
 *
 * Line by line, exactly: service tag, version, encoding (1 = UTF-8), SCT, BIC (may be empty in
 * version 002), beneficiary name (70), IBAN (34), amount as EURn.nn, purpose (empty), structured
 * reference (empty), unstructured remittance (140), information (empty). Line feeds between,
 * none after the last.
 */
export function epcPayload({ name, iban, bic = '', amount, remittance = '' }) {
  const eur = Number(amount);
  const amountText = isFinite(eur) && eur > 0 && eur <= 999999999.99 ? `EUR${eur.toFixed(2)}` : '';
  return [
    'BCD', '002', '1', 'SCT',
    clean(bic).toUpperCase().slice(0, 11),
    clean(name).slice(0, 70),
    normaliseIban(iban).slice(0, 34),
    amountText,
    '',
    '',
    clean(remittance).slice(0, 140),
    '',
  ].join('\n').replace(/\n+$/, '');
}

/** A upi://pay link. Amount to two places; the note is the document number. */
export function upiPayload({ vpa, name, amount, note = '' }) {
  const p = new URLSearchParams();
  p.set('pa', clean(vpa));
  if (clean(name)) p.set('pn', clean(name).slice(0, 50));
  const n = Number(amount);
  if (isFinite(n) && n > 0) p.set('am', n.toFixed(2));
  p.set('cu', 'INR');
  if (clean(note)) p.set('tn', clean(note).slice(0, 60));
  return 'upi://pay?' + p.toString();
}

/**
 * Encode, fitting the code the encoder can make.
 *
 * The shared encoder stops at version 6 — about a hundred bytes at level M — which an EPC payload
 * with a long name and a long remittance can exceed. The ladder is: level M as the standard asks;
 * then M with the remittance cut to the bare number; then L, which holds a third more; then
 * nothing, and the renderers print the account details as text instead. A code that cannot be
 * made is never a code that scans wrongly.
 */
function encodeFitting(makePayload, remittances) {
  for (const level of ['M', 'L']) {
    for (const r of remittances) {
      try {
        const text = makePayload(r);
        return { text, code: encodeQR(text, level), level };
      } catch { /* too long at this level with this remittance; try the next */ }
    }
  }
  return null;
}

/**
 * What to put on the document, or null when there is nothing to put.
 *
 * `fields` is the document description from ./fields.js — the localised kind and its words.
 * Only for documents that ask for money, only while something is owed, and only when the
 * business has set up a way. The choice between ways is by currency: euros with an IBAN get the
 * EPC code, rupees with a UPI id get UPI, and a payment link serves everything else.
 */
export function paymentCode(draft, settings = {}, fields = {}) {
  if (settings.showPayQr === false) return null;
  const kind = fields.kind;
  if (!kind || !kind.demandsPayment) return null;
  const sender = draft?.sender || {};
  const t = draft?.totals || {};
  const owed = Number(t.balance != null ? t.balance : t.total);
  if (!(owed > 0)) return null;
  const currency = String(draft.currency || t.currency || settings.money?.currency || '').toUpperCase();
  const L = fields.L || labels('en');
  const number = clean(draft.number);
  const remittance = [kind.word, number].filter(Boolean).join(' ');
  const holder = clean(sender.accountHolder) || clean(sender.name);

  const iban = normaliseIban(sender.iban);
  if (currency === 'EUR' && looksLikeIban(iban)) {
    const made = encodeFitting(
      (r) => epcPayload({ name: holder, iban, bic: sender.bic, amount: owed, remittance: r }),
      [remittance, number, ''],
    );
    if (made) {
      return {
        kind: 'epc', ...made,
        caption: L.scanToPay,
        lines: [
          `IBAN ${formatIban(iban)}`,
          clean(sender.bic) ? `BIC ${clean(sender.bic).toUpperCase()}` : '',
          holder,
          number ? `${L.paymentReference}: ${number}` : '',
        ].filter(Boolean),
      };
    }
  }

  const vpa = clean(sender.upiId);
  if (currency === 'INR' && /^[\w.\-]{2,}@[a-z][\w]*$/i.test(vpa)) {
    const made = encodeFitting((r) => upiPayload({ vpa, name: holder, amount: owed, note: r }), [remittance, number, '']);
    if (made) {
      return { kind: 'upi', ...made, caption: L.scanToPay, lines: [`UPI ${vpa}`, holder, number ? `${L.paymentReference}: ${number}` : ''].filter(Boolean) };
    }
  }

  const link = clean(sender.paymentLink);
  if (/^https:\/\/\S+$/i.test(link)) {
    const made = encodeFitting(() => link, ['']);
    if (made) return { kind: 'link', ...made, caption: L.payOnline, lines: [link] };
  }

  return null;
}

/**
 * The matrix as an SVG string, one path for every dark module and a four-module quiet zone.
 *
 * `label` becomes the accessible name: a code is content, not decoration, and a screen reader
 * user should be handed the text it encodes rather than "image".
 */
export function qrSvg(code, size = 96, label = '') {
  const quiet = 4;
  const total = code.size + quiet * 2;
  let d = '';
  for (let r = 0; r < code.size; r++) {
    for (let c = 0; c < code.size; c++) if (code.modules[r][c]) d += `M${c + quiet},${r + quiet}h1v1h-1z`;
  }
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="${esc(label)}"><rect width="${total}" height="${total}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
