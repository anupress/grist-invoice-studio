// The shell the message travels in.
//
// Until now a covering email was a bare div of paragraphs: correct, and plainly unfinished beside
// what a shop sends. This wraps it the way a designed transactional email is built — a card on a
// tinted ground, the business's own mark at the top, a quiet footer under it — and it is assembled
// out of nested tables with inline styles, because that is the only thing every mail client
// renders the same way. It looks like 1999 because email is 1999.
//
// Four shells, matching the document's own layouts rather than inventing a second vocabulary:
//
//   card    a white card on a tinted ground, an accent rule across the top. The default.
//   banded  the accent as a full-width header band with the name reversed out of it.
//   slate   the same band in ink rather than colour, for the most formal correspondence.
//   plain   no card and no ground: hairline rules on white, the way a letter is typed.
//
// Everything is the SENDER'S: their logo, their accent, their address in the footer. This is a
// message from them to their client, and a widget that put itself at the top of it would be
// putting itself in the middle of that relationship. The one line of ours sits at the very bottom,
// small, and can be turned off.
//
// The hardening below is the standard set every serious template carries, and each line is there
// because a client needs it: iOS resizes text without the size-adjust rules, Outlook adds its own
// spacing around tables without the mso rules, iOS turns dates and addresses into blue links
// without the data-detector reset, and Gmail introduces a stray margin the last rule removes.

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const EMAIL_STYLES = [
  { id: 'card', label: 'Card — a white card on a tinted ground' },
  { id: 'banded', label: 'Banded — a coloured header with your name in it' },
  { id: 'slate', label: 'Slate — a dark header, the most formal' },
  { id: 'plain', label: 'Plain — hairlines on white, like a letter' },
];

export const isEmailStyle = (id) => EMAIL_STYLES.some((s) => s.id === id);

const INK = '#16212c';
const MUTED = '#5f7285';
const RULE = '#dfe5ec';
const GROUND = '#f4f6f8';
const WIDTH = 600;

const F = "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * Black or white, whichever can be read on this colour.
 *
 * Relative luminance, the same test WooCommerce makes before reversing a title out of a shop's
 * chosen accent: a business that picks a pale yellow must not end up with white text on it.
 */
export function readableOn(hex) {
  const h = String(hex || '').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  if (!isFinite(n) || full.length !== 6) return '#ffffff';
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.42 ? INK : '#ffffff';
}

/** The logo, but only when it is a picture an email may carry. */
function logoTag(sender, height = 34) {
  const src = String(sender?.logoData || '');
  if (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(src)) return '';
  return `<img src="${src}" alt="" height="${height}" style="display:block;border:0;max-height:${height}px" />`;
}

/** The masthead, per shell. Returns a full-width row of the card's table. */
function header(style, sender, accent) {
  const name = esc(sender?.name || '');
  const site = String(sender?.website || '').trim();
  const href = site ? (/^https?:\/\//i.test(site) ? site : 'https://' + site) : '';
  const logo = logoTag(sender, style === 'banded' || style === 'slate' ? 30 : 34);

  if (style === 'banded' || style === 'slate') {
    const bg = style === 'slate' ? INK : accent;
    const on = style === 'slate' ? '#ffffff' : readableOn(accent);
    // A logo on a coloured ground needs a plate of its own: a transparent PNG disappears into it
    // and a flattened JPEG arrives as a white rectangle either way.
    const mark = logo ? `<span style="display:inline-block;background:#ffffff;padding:5px 8px;border-radius:4px">${logo}</span><br />` : '';
    return `<tr><td align="left" style="background:${bg};padding:22px 28px;border-radius:4px 4px 0 0">
${mark}<div style="${F};font-size:18px;font-weight:700;color:${on};line-height:1.3">${name}</div>
${site ? `<div style="${F};font-size:12px;padding-top:3px"><a href="${esc(href)}" style="color:${on};opacity:.8;text-decoration:none">${esc(site)}</a></div>` : ''}
</td></tr>`;
  }

  // card and plain: the mark and the name on the paper itself.
  return `<tr><td align="left" style="padding:${style === 'plain' ? '0 0 18px' : '26px 28px 18px'};${style === 'plain' ? `border-bottom:2px solid ${accent}` : ''}">
${logo ? logo + '<div style="height:8px;line-height:8px">&nbsp;</div>' : ''}
<div style="${F};font-size:18px;font-weight:700;color:${INK};line-height:1.3">${name}</div>
${site ? `<div style="${F};font-size:12px;padding-top:2px"><a href="${esc(href)}" style="color:${MUTED};text-decoration:none">${esc(site)}</a></div>` : ''}
</td></tr>`;
}

/** The footer under the card: who sent it, how to reach them, and our one line. */
function footer(sender, accent, credit) {
  const bits = [
    esc(sender?.name || ''),
    [sender?.street1, sender?.city, sender?.postcode].map((x) => esc(String(x || '').trim())).filter(Boolean).join(', '),
  ].filter(Boolean);
  const contact = [
    sender?.email ? `<a href="mailto:${esc(sender.email)}" style="color:${MUTED};text-decoration:underline">${esc(sender.email)}</a>` : '',
    sender?.phone ? esc(sender.phone) : '',
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');

  // Ours, last and smallest, and only when the business has left it on. An invoice is their
  // document going to their client; a credit that shouted would be us using their post.
  const ours = credit
    ? `<div style="${F};font-size:11px;color:#94a3b3;padding-top:8px">Made with <a href="https://anupress.com" style="color:#94a3b3;text-decoration:underline">Invoice Studio by ANUPRESS</a></div>`
    : '';

  if (!bits.length && !contact && !ours) return '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:${WIDTH}px;border-collapse:collapse">
<tr><td align="center" style="padding:18px 24px 0">
${bits.length ? `<div style="${F};font-size:12px;color:${MUTED};line-height:1.6">${bits.join(' &nbsp;·&nbsp; ')}</div>` : ''}
${contact ? `<div style="${F};font-size:12px;color:${MUTED};line-height:1.6">${contact}</div>` : ''}
${ours}
</td></tr></table>`;
}

/**
 * Wrap a body in the shell.
 *
 * `body` is already HTML — the covering message's paragraphs, and the invoice under it when one
 * is being shown. Returns a fragment: a table, not a page, so it can be pasted into a mail
 * client's composer as well as sent as a whole document by something at the far end.
 */
export function emailShell(body, settings = {}, opts = {}) {
  const style = isEmailStyle(settings.emailStyle) ? settings.emailStyle : 'card';
  const accent = settings.emailAccent || settings.accent || '#14509b';
  const sender = opts.sender || settings.sender || {};
  const credit = settings.emailCredit !== false;
  const plain = style === 'plain';

  const card = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${WIDTH}" style="width:${WIDTH}px;max-width:100%;background:#ffffff;${plain ? '' : `border:1px solid ${RULE};border-radius:4px;`}${style === 'card' ? `border-top:4px solid ${accent};` : ''}border-collapse:separate">
${header(style, sender, accent)}
<tr><td align="left" style="padding:${plain ? '20px 0 0' : '4px 28px 26px'};${F};font-size:15px;color:${INK};line-height:1.55">
${body}
</td></tr>
</table>`;

  // The ground the card sits on. `plain` has none — that is what makes it read as a letter rather
  // than as a mailing.
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;${plain ? '' : `background:${GROUND};`}">
<tr><td align="center" style="padding:${plain ? '0' : '24px 12px 28px'}">
${card}
${footer(sender, accent, credit)}
</td></tr></table>`;
}

/**
 * The same thing as a whole page, for something that sends raw HTML.
 *
 * The outbox and the direct route hand their HTML to a mail service, which wants a document. The
 * clipboard does not: pasting a page into a composer is how a stray `<style>` block ends up as
 * text, so that route takes the fragment above instead.
 */
export function emailPage(fragment, { title = '', accent = '#14509b' } = {}) {
  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="color-scheme" content="light" />
<title>${esc(title)}</title>
<style type="text/css">
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  table { border-collapse: collapse !important; }
  img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
  body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
  /* iOS turns dates, addresses and reference numbers into links of its own and restyles them. */
  a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }
  /* Gmail adds a margin around anything it thinks is a paragraph block. */
  div[style*="margin: 16px 0"] { margin: 0 !important; }
  @media only screen and (max-width: 620px) {
    .inv-email-pad { padding-left: 16px !important; padding-right: 16px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${GROUND};">
${fragment}
</body>
</html>`;
}
