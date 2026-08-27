// Posting the message straight to something of the user's own.
//
// The one route that reaches outside the browser at the moment it is used, and therefore the only
// one that touches the privacy promise. Everything here exists to make that honest rather than
// convenient:
//
//   • It is off until a URL is entered. There is no default and no suggestion.
//   • The destination HOST is shown before anything is sent, every time, not buried in settings.
//   • HTTPS only. A plain-http endpoint would put an invoice, an address and an email on the wire
//     in clear text, and "it is only my own server" is exactly when that goes unnoticed.
//   • Nothing is ever routed through ANUPRESS. There is no server of ours to route it through.
//
// It also cannot promise delivery, and says so. A cross-origin POST to somebody's automation is
// usually answered without the CORS headers a browser needs to let us read the reply — the request
// arrives perfectly well, but we are not allowed to see what came back. Reporting "sent" in that
// case would be a guess. See `confirmed` below.

const SECRET_LIKE = /(api[-_]?key|secret|token|password|passwd|bearer)/i;

/** Just the host, for showing someone where their invoice is about to go. */
export function destinationHost(url) {
  try { return new URL(String(url)).host; } catch { return ''; }
}

/**
 * Is this a usable destination?
 *
 * The credential check is the interesting one. A URL with an API key in its query string is a
 * pattern people copy from documentation without thinking, and it would then be stored in a Grist
 * table that every editor of the document can read — and sent in a referrer, and written to any
 * proxy log on the way. Webhook URLs with an opaque token in the PATH (Zapier, Make, Slack) are
 * fine and normal; a named key in the QUERY is not.
 */
export function checkEndpoint(url) {
  const raw = String(url || '').trim();
  if (!raw) return { ok: false, problem: 'No endpoint has been set.' };

  let parsed;
  try { parsed = new URL(raw); } catch { return { ok: false, problem: 'That is not a URL.' }; }

  // Loopback is exempt, and only loopback. A relay running on the same machine — n8n on a laptop,
  // a script on the server Grist itself is on — never puts anything on a network, and browsers
  // already treat localhost as a secure context for exactly this reason. Every other host has to
  // be https, because "it is only my own server" is precisely when a plain-http invoice full of
  // names and addresses goes unnoticed on the wire.
  const loopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]' || parsed.hostname === '::1';
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) {
    return { ok: false, problem: 'Only https endpoints are allowed — an invoice sent over plain http travels in clear text. The exception is a relay on this machine (localhost), which never reaches a network.' };
  }
  for (const [key] of parsed.searchParams) {
    if (SECRET_LIKE.test(key)) {
      return {
        ok: false,
        problem: `That URL carries "${key}" in its query string. Anything stored here is readable by everyone who can edit this document, so put credentials in your endpoint's own configuration instead.`,
      };
    }
  }
  return { ok: true, host: parsed.host };
}

/**
 * What gets posted.
 *
 * A flat, boring, self-describing shape. Whatever is at the far end was probably assembled in an
 * afternoon by somebody who is not a programmer, and every level of nesting is another place for
 * that to go wrong. `source` is included so a shared endpoint can tell our messages from anything
 * else pointed at it.
 */
export function buildPayload(message, { html = '', attachment = null } = {}) {
  const d = message.document || {};
  return {
    source: 'invoice-studio',
    version: 1,
    sentAt: new Date().toISOString(),
    to: message.to || '',
    cc: message.cc || '',
    bcc: message.bcc || '',
    replyTo: message.replyTo || '',
    fromName: message.fromName || '',
    subject: message.subject || '',
    text: message.body || '',
    html,
    document: {
      kind: d.kind || '', number: d.number || '', status: d.status || '',
      issued: d.issued || '', due: d.due || '',
      total: d.total ?? null, balance: d.balance ?? null, currency: d.currency || '',
      client: d.client || '',
    },
    // The whole document, as a file the far end can attach without fetching anything. `encoding`
    // is part of the contract: a PDF travels base64, and saying so is what stops whatever is at the
    // far end guessing and double-encoding it.
    attachment: attachment || null,
  };
}

/**
 * Send it.
 *
 * `confirmed` is the important part of the answer. A normal cross-origin POST that comes back
 * readable means the far end accepted it and said so. When the browser refuses to show us the
 * response — the usual case for a webhook that was never set up with CORS in mind — the request
 * still went, but we cannot prove it, and the caller must not claim otherwise.
 */
export async function postToEndpoint(url, payload, { allowOpaque = true, timeoutMs = 15000 } = {}) {
  const check = checkEndpoint(url);
  if (!check.ok) return { ok: false, confirmed: false, error: check.problem };

  const body = JSON.stringify(payload);
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller ? controller.signal : undefined,
      // No cookies, no credentials: this is our payload going to their endpoint, and nothing about
      // the viewer's session has any business travelling with it.
      credentials: 'omit',
      // A URL is not something to leak, and a webhook URL is close enough to a credential.
      referrerPolicy: 'no-referrer',
    });
    if (timer) clearTimeout(timer);
    if (!res.ok) {
      return { ok: false, confirmed: true, status: res.status, error: `The endpoint answered ${res.status}.` };
    }
    return { ok: true, confirmed: true, status: res.status, host: check.host };
  } catch (e) {
    if (timer) clearTimeout(timer);
    if (e && e.name === 'AbortError') {
      return { ok: false, confirmed: false, error: 'The endpoint did not answer in time.' };
    }
    if (!allowOpaque) {
      return { ok: false, confirmed: false, error: 'The endpoint could not be reached, or refused the browser’s cross-origin check.' };
    }

    // The failure above is almost always CORS rather than the network, and a no-cors POST still
    // arrives — the browser simply refuses to let us read the reply. Worth doing, never worth
    // reporting as a confirmed send.
    try {
      await fetch(url, {
        method: 'POST', mode: 'no-cors', body,
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },  // the only type no-cors allows
        credentials: 'omit', referrerPolicy: 'no-referrer',
      });
      return {
        ok: true, confirmed: false, host: check.host,
        note: 'Sent, but the endpoint did not allow this page to read its reply, so there is no confirmation it arrived. Check its own log.',
      };
    } catch (e2) {
      return { ok: false, confirmed: false, error: 'The endpoint could not be reached.' };
    }
  }
}
