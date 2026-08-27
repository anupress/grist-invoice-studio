/**
 * Invoice Studio → email, on a Cloudflare Worker.
 *
 * Receives either shape: the JSON array Grist posts from a webhook on the Outbox table, or the
 * single object the widget's Direct route posts from the browser. Sends each one through a provider
 * of your choosing, and answers straight away.
 *
 * Deploy:
 *   npm create cloudflare@latest invoice-relay -- --type=hello-world
 *   # replace src/index.js with this file
 *   npx wrangler secret put MAIL_API_KEY
 *   npx wrangler secret put SHARED_SECRET      # optional, see below
 *   npx wrangler deploy
 *
 * Then put the Worker's URL into Grist's webhook, or into the Direct endpoint box in the widget.
 *
 * The API key lives in a Worker secret and never goes near the browser or the Grist document.
 * That is the whole reason this file exists rather than the widget calling a mail API directly.
 */

const FROM = 'invoices@yourbusiness.example';   // must be a domain your provider has verified
const FROM_NAME = 'Your Business';

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
    if (request.method !== 'POST') return cors(new Response('POST only', { status: 405 }));

    // Optional shared secret. Grist can attach an Authorization header to its webhook; set the same
    // value as SHARED_SECRET and anything else that finds this URL is ignored. Worth doing: a
    // webhook URL is not a secret, and an open relay is somebody else's spam problem eventually.
    if (env.SHARED_SECRET) {
      const given = request.headers.get('Authorization') || '';
      if (given !== env.SHARED_SECRET) return cors(new Response('no', { status: 401 }));
    }

    let payload;
    try { payload = await request.json(); }
    catch { return cors(new Response('expected JSON', { status: 400 })); }

    const messages = normalise(payload);
    if (!messages.length) return cors(json({ ok: true, sent: 0, note: 'nothing to send' }));

    // Answer FIRST, send afterwards. Grist retries a webhook that does not answer promptly, and a
    // retry means the client gets the invoice twice.
    ctx.waitUntil(Promise.all(messages.map((m) => send(m, env))));
    return cors(json({ ok: true, accepted: messages.length }));
  },
};

/** Both payload shapes, flattened into one list. */
function normalise(payload) {
  const rows = Array.isArray(payload) ? payload : [payload];
  return rows.map((r) => ({
    to: r.ToEmail || r.to || '',
    cc: r.Cc || r.cc || '',
    bcc: r.Bcc || r.bcc || '',
    replyTo: r.ReplyTo || r.replyTo || '',
    subject: r.Subject || r.subject || '(no subject)',
    text: r.Body || r.text || '',
    html: r.BodyHtml || r.html || '',
    attachment: r.attachment || null,          // only the Direct route carries one inline
    reference: r.DocumentNumber || (r.document && r.document.number) || '',
  })).filter((m) => m.to);
}

/**
 * Send one.
 *
 * Written against Resend because it is the shortest example; MailChannels, Postmark, SendGrid and
 * Mailgun all take the same three things (to, subject, body) and differ only in the field names.
 */
async function send(m, env) {
  const body = {
    from: `${FROM_NAME} <${FROM}>`,
    to: [m.to],
    subject: m.subject,
    text: m.text,
    html: m.html || undefined,
  };
  if (m.cc) body.cc = [m.cc];
  if (m.bcc) body.bcc = [m.bcc];
  if (m.replyTo) body.reply_to = m.replyTo;
  if (m.attachment && m.attachment.content) {
    // The payload says how the content is encoded. A PDF arrives base64 already; HTML arrives as
    // text and has to be converted. Guessing instead of reading `encoding` is how a PDF gets
    // base64-encoded twice and arrives as a file no reader will open.
    const a = m.attachment;
    body.attachments = [{
      filename: a.fileName || 'invoice.pdf',
      content: a.encoding === 'base64' ? a.content : btoa(unescape(encodeURIComponent(a.content))),
    }];
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.MAIL_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.log('send failed', m.reference, res.status, await res.text());
  return res.ok;
}

const json = (o) => new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json' } });

/** The widget reads the reply to confirm delivery, and cannot without these. */
function cors(res) {
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return res;
}
