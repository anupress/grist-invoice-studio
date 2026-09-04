// Putting the message on the clipboard, formatted.
//
// The most underrated route of the lot. Paste into Gmail, Outlook or anything else and the message
// arrives with its layout intact, ready to send from the address the client already recognises —
// no account, no endpoint, no permission beyond the clipboard itself, and nothing transmitted.
//
// Rich text is written ALONGSIDE plain text rather than instead of it. A clipboard entry carries
// several flavours at once, and the receiving application picks; offering only HTML means anything
// that wants plain text gets nothing, and offering only text throws the formatting away.

import { emailShell, emailPage } from './email-shell.js';

/** Minimal escaping for text going into HTML. */
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Already-escaped text with its web addresses and emails made clickable.
 *
 * A payment link a client has to select, copy and paste is a payment that happens tomorrow.
 * Only https and mailto targets are made: a plain-http address stays text, and anything that
 * merely looks like a domain is left alone rather than guessed at. Trailing punctuation belongs
 * to the sentence, not the link.
 */
export function linkify(escapedText, color = '#14509b') {
  return String(escapedText || '')
    .replace(/https:\/\/[^\s<>"']+/g, (raw) => {
      const m = /^(.*?)([.,;:!?)]*)$/.exec(raw);
      const url = m[1], tail = m[2];
      return `<a href="${url}" style="color:${color};text-decoration:underline">${url}</a>${tail}`;
    })
    .replace(/(^|[\s(>])([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g, (all, before, mail) =>
      `${before}<a href="mailto:${mail}" style="color:${color};text-decoration:underline">${mail}</a>`);
}

/**
 * The message as email-ready HTML.
 *
 * Inline styles only, and no stylesheet: every mail client strips or ignores a `<style>` block, and
 * several rewrite class names. Inline is the only thing that survives the journey, which is why
 * email HTML looks like 1999 and will continue to.
 */
export function messageToHtml(message, settings = {}, opts = {}) {
  const accent = settings.emailAccent || '#14509b';
  const ink = settings.emailInk || '#16212c';

  const paragraphs = String(message.body || '')
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.55;color:${ink}">${linkify(esc(p), accent).replace(/\n/g, '<br>')}</p>`)
    .join('');

  const d = message.document || {};
  // What the message is about, in one line, for a client who reads three words and a number. The
  // amount is the part they are looking for, so it is the part that is large.
  const summary = d.number
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 18px;border-collapse:collapse">
<tr><td style="padding:12px 14px;background:#f2f5f8;border-left:3px solid ${accent};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#5f7285">${esc(d.kindWord || (d.kind === 'quote' ? 'Quote' : 'Invoice'))} ${esc(d.number)}</div>
${d.amount ? `<div style="font-size:20px;font-weight:700;color:${ink};padding-top:2px">${esc(d.amount)}</div>` : ''}
${d.due && d.due !== '—' ? `<div style="font-size:12px;color:#5f7285;padding-top:2px">Due ${esc(d.due)}</div>` : ''}
</td></tr></table>`
    : '';

  // The whole document, below the covering note, when asked for. The summary box stays: it names
  // the amount and the date in a glance, which is what a client answers, and the table under it
  // is what their bookkeeper reads.
  const document = opts.document || '';

  const body = `${summary}${paragraphs}${document ? `<div style="margin:20px 0 0">${document}</div>` : ''}`;
  const fragment = emailShell(body, settings, { sender: opts.sender || settings.sender });
  return opts.full ? emailPage(fragment, { title: message.subject || '', accent }) : fragment;
}

/**
 * Copy the message, rich and plain together.
 *
 * The async Clipboard API is tried first because it is the only way to write two flavours at once.
 * It needs a secure context and a user gesture, and Firefox has historically not supported
 * ClipboardItem for text/html — so a plain-text write is the fallback, and saying which one
 * happened matters: a person who was promised formatting and got none should be told, not left to
 * discover it in a sent email.
 */
export async function copyMessage(message, settings = {}, opts = {}) {
  const html = messageToHtml(message, settings, opts);
  const text = message.body || '';

  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard && navigator.clipboard.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      })]);
      return { ok: true, rich: true };
    } catch (e) { /* fall through to plain text */ }
  }

  try {
    await navigator.clipboard.writeText(text);
    return { ok: true, rich: false, note: 'Copied as plain text — this browser would not take the formatted version.' };
  } catch (e) {
    return { ok: false, error: 'The browser would not let the page write to the clipboard.' };
  }
}
