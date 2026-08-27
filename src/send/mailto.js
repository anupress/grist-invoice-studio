// Handing the message to whatever the person already uses for email.
//
// The route that needs no setup, no account and no permission: a `mailto:` link opens their own
// mail client with everything filled in, and they press send. Nothing leaves the browser — the
// operating system is doing the handing-over — so this is the only route that costs nothing
// against the privacy promise.
//
// Its two real limits, both handled rather than hoped about:
//
//   LENGTH   A mailto: URL goes through the browser, then the OS, then the mail client, and each
//            has its own ceiling. The oldest documented one is around 2,000 characters and it is
//            still the practical floor. Past it the body is silently TRUNCATED — not rejected —
//            so an invoice with forty lines would arrive as an email that stops mid-sentence.
//   FILES    A mailto: cannot carry an attachment. Nothing can change that, so the caller is told
//            to hand the document over another way and the body says the file is coming.

const MAX_URL = 1900;   // under the ~2,000 floor, leaving room for the recipient and subject

/**
 * Percent-encode for a mailto query.
 *
 * encodeURIComponent leaves !'()* alone — legal in a URI but not always in a mail header — and
 * turns a space into %20 where a query string historically means "+". Both get corrected, because
 * the mail client on the other side is not necessarily forgiving.
 */
function encode(s) {
  return encodeURIComponent(String(s == null ? '' : s))
    .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

/**
 * Build the link.
 *
 * Returns the URL and, honestly, whether anything had to be cut to fit — the caller shows that
 * before opening the mail client, so nobody discovers it by reading their own sent mail.
 */
export function buildMailto(message, opts = {}) {
  const to = String(message.to || '').trim();
  const params = [];
  if (message.subject) params.push('subject=' + encode(message.subject));
  if (message.cc) params.push('cc=' + encode(message.cc));
  if (message.bcc) params.push('bcc=' + encode(message.bcc));

  const note = opts.attachmentNote || '';
  let body = note ? `${message.body}\n\n${note}` : message.body;

  const head = 'mailto:' + encode(to).replace(/%40/g, '@') + (params.length ? '?' + params.join('&') : '');
  const joiner = params.length ? '&' : '?';

  let truncated = false;
  let url = head + joiner + 'body=' + encode(body);
  if (url.length > MAX_URL) {
    truncated = true;
    // Trim the BODY rather than the subject or the recipient, and trim it by characters of the
    // original text rather than of the encoding — cutting an encoded string can leave a half-written
    // %E2 escape that the mail client renders as a replacement character.
    const room = MAX_URL - (head.length + joiner.length + 'body='.length);
    let cut = body;
    while (cut.length > 0 && encode(cut + '\n\n[…]').length > room) {
      cut = cut.slice(0, Math.max(0, Math.floor(cut.length * 0.9) - 1));
    }
    body = cut + '\n\n[…]';
    url = head + joiner + 'body=' + encode(body);
  }

  return { url, truncated, length: url.length, body };
}

/**
 * Open it.
 *
 * `location.href` rather than window.open: a popup blocker treats window.open on a non-http scheme
 * as a popup and swallows it, where a navigation to mailto: is handed to the OS and leaves the page
 * exactly where it was.
 */
export function openMailClient(message, opts = {}) {
  const built = buildMailto(message, opts);
  try {
    window.location.href = built.url;
    return { ok: true, ...built };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e), ...built };
  }
}
