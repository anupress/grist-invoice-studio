/**
 * Invoice Studio → your own SMTP server.
 *
 * This is the honest answer to "can it send over SMTP". A browser cannot: SMTP is a raw TCP
 * protocol and a page cannot open a socket, so anything claiming otherwise is posting your mail
 * password to somebody else's server. A small service like this one can, because it runs where
 * SMTP belongs — on a machine, with the credentials in its environment and not in a document.
 *
 * Run it:
 *   npm init -y && npm install nodemailer
 *   SMTP_HOST=mail.yourhost.example SMTP_USER=you SMTP_PASS=… MAIL_FROM="You <you@example.com>" \
 *   SHARED_SECRET=something-long node relay.mjs
 *
 * Put it behind HTTPS — a reverse proxy you already run, or a tunnel — unless it lives on the same
 * machine as the browser using it. The widget refuses plain http for anything but localhost, on
 * purpose: an invoice carries a name, an address and an amount.
 */

import http from 'node:http';
import nodemailer from 'nodemailer';

const PORT = Number(process.env.PORT || 4300);
const SECRET = process.env.SHARED_SECRET || '';
const FROM = process.env.MAIL_FROM || 'invoices@example.com';

const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE || '') === 'true',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

/** Grist posts an array of rows; the widget's Direct route posts one object. */
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
    attachment: r.attachment || null,
    reference: r.DocumentNumber || (r.document && r.document.number) || '',
  })).filter((m) => m.to);
}

async function send(m) {
  const mail = {
    from: FROM, to: m.to, subject: m.subject, text: m.text,
    ...(m.html ? { html: m.html } : {}),
    ...(m.cc ? { cc: m.cc } : {}),
    ...(m.bcc ? { bcc: m.bcc } : {}),
    ...(m.replyTo ? { replyTo: m.replyTo } : {}),
  };
  if (m.attachment && m.attachment.content) {
    // `encoding` is part of the payload contract: a PDF arrives base64, HTML arrives as text.
    // Reading it rather than guessing is what stops a PDF being encoded twice and arriving broken.
    const a = m.attachment;
    mail.attachments = [{
      filename: a.fileName || 'invoice.pdf',
      content: a.encoding === 'base64' ? Buffer.from(a.content, 'base64') : a.content,
      contentType: a.contentType || 'application/pdf',
    }];
  }
  const info = await mailer.sendMail(mail);
  console.log(`sent ${m.reference || '(no ref)'} to ${m.to} — ${info.messageId}`);
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }
  if (req.method !== 'POST') { res.writeHead(405, CORS); res.end('POST only'); return; }
  if (SECRET && (req.headers.authorization || '') !== SECRET) {
    res.writeHead(401, CORS); res.end('no'); return;
  }

  let body = '';
  // A cap, because this endpoint is reachable and an unbounded read is a way to be knocked over.
  req.on('data', (c) => { body += c; if (body.length > 5e6) req.destroy(); });
  req.on('end', async () => {
    let payload;
    try { payload = JSON.parse(body); }
    catch { res.writeHead(400, CORS); res.end('expected JSON'); return; }

    const messages = normalise(payload);
    // Answer before sending. Grist retries a webhook that does not reply promptly, and a retry is
    // the client receiving the same invoice twice.
    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, accepted: messages.length }));

    for (const m of messages) {
      try { await send(m); }
      catch (e) { console.error(`failed ${m.reference || ''} to ${m.to}:`, e.message); }
    }
  });
}).listen(PORT, () => console.log(`relay listening on ${PORT}`));
