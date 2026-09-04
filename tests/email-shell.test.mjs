import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shell = await import(pathToFileURL(_resolve(ROOT, 'src/send/email-shell.js')).href);
const clip = await import(pathToFileURL(_resolve(ROOT, 'src/send/clipboard.js')).href);
const msg = await import(pathToFileURL(_resolve(ROOT, 'src/send/message.js')).href);
const store = await import(pathToFileURL(_resolve(ROOT, 'src/settings/store.js')).href);
const { normaliseDraft } = await import(pathToFileURL(_resolve(ROOT, 'src/model/draft.js')).href);

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

const SENDER = {
  name: 'ANUPRESS Works', email: 'accounts@anupress.example', phone: '+44 117 496 0139',
  website: 'anupress.com', street1: '4 Quarry Street', city: 'Bristol', postcode: 'BS1 5TF',
};
const settings = (over = {}) => ({ sender: SENDER, emailAccent: '#14509b', ...over });

// ---------------------------------------------------------------------------------------------
// Black or white on the accent, whichever can be read
// ---------------------------------------------------------------------------------------------
eq('white on our blue', shell.readableOn('#14509b'), '#ffffff');
eq('white on black', shell.readableOn('#000000'), '#ffffff');
eq('ink on white', shell.readableOn('#ffffff'), '#16212c');
eq('ink on a pale yellow', shell.readableOn('#ffe066'), '#16212c');
eq('white on a deep red', shell.readableOn('#a33830'), '#ffffff');
eq('shorthand hex works', shell.readableOn('#fff'), '#16212c');
eq('nonsense falls back to white', shell.readableOn('nope'), '#ffffff');

// ---------------------------------------------------------------------------------------------
// The four shells
// ---------------------------------------------------------------------------------------------
eq('four of them, with labels', shell.EMAIL_STYLES.map((s) => s.id), ['card', 'banded', 'slate', 'plain']);
ok('each says what it looks like', shell.EMAIL_STYLES.every((s) => s.label.includes('—')));
ok('a known style is known', shell.isEmailStyle('banded') && !shell.isEmailStyle('sparkly'));

for (const style of ['card', 'banded', 'slate', 'plain']) {
  const html = shell.emailShell('<p>Hello</p>', settings({ emailStyle: style }));
  ok(`${style}: the message is in it`, html.includes('<p>Hello</p>'));
  ok(`${style}: the business is named`, html.includes('ANUPRESS Works'));
  ok(`${style}: built from tables, not divs`, html.startsWith('<table') && html.includes('role="presentation"'));
  ok(`${style}: every table is presentational`, (html.match(/<table/g) || []).length === (html.match(/role="presentation"/g) || []).length);
  ok(`${style}: constrained to 600px`, html.includes('max-width:100%') && html.includes('600'));
  ok(`${style}: the footer carries the address`, html.includes('4 Quarry Street') && html.includes('Bristol'));
  ok(`${style}: and a way to reply`, html.includes('mailto:accounts@anupress.example'));
  ok(`${style}: the website is a link`, html.includes('https://anupress.com'));
  ok(`${style}: tags are balanced`, (html.match(/<table/g) || []).length === (html.match(/<\/table>/g) || []).length);
  ok(`${style}: no stylesheet to be stripped`, !html.includes('<style'));
  ok(`${style}: no class a client could lose`, !/class="/.test(html.replace(/class="inv-email-pad"/g, '')));
}

// What distinguishes them.
{
  const card = shell.emailShell('<p>x</p>', settings({ emailStyle: 'card' }));
  ok('card: an accent rule across the top', card.includes('border-top:4px solid #14509b'));
  ok('card: on a tinted ground', card.includes('background:#f4f6f8'));
  ok('card: the name in ink, on the paper', card.includes('color:#16212c'));

  const banded = shell.emailShell('<p>x</p>', settings({ emailStyle: 'banded' }));
  ok('banded: the accent is the header', banded.includes('background:#14509b'));
  ok('banded: with the name reversed out of it', banded.includes('color:#ffffff'));

  const slate = shell.emailShell('<p>x</p>', settings({ emailStyle: 'slate' }));
  ok('slate: the header is ink, not the accent', slate.includes('background:#16212c'));

  const plain = shell.emailShell('<p>x</p>', settings({ emailStyle: 'plain' }));
  ok('plain: no card border', !plain.includes('border:1px solid #dfe5ec'));
  ok('plain: no tinted ground', !plain.includes('background:#f4f6f8'));
  ok('plain: a hairline under the name instead', plain.includes('border-bottom:2px solid #14509b'));

  // A pale accent must not end up with white text on it.
  const pale = shell.emailShell('<p>x</p>', settings({ emailStyle: 'banded', emailAccent: '#ffe066' }));
  ok('a pale band takes dark text', pale.includes('background:#ffe066') && pale.includes('color:#16212c'));
}

// The logo: only a real one, and never left to rot on a coloured ground.
{
  const jpg = 'data:image/jpeg;base64,AAAA';
  const withLogo = shell.emailShell('<p>x</p>', settings({ emailStyle: 'card' }), { sender: { ...SENDER, logoData: jpg } });
  ok('a data-URI logo is carried', withLogo.includes(`src="${jpg}"`));
  ok('and the name stays beside it, for clients that strip images', withLogo.includes('ANUPRESS Works'));
  const banded = shell.emailShell('<p>x</p>', settings({ emailStyle: 'banded' }), { sender: { ...SENDER, logoData: jpg } });
  ok('on a band the logo gets a white plate', banded.includes('background:#ffffff;padding:5px 8px'));
  const hosted = shell.emailShell('<p>x</p>', settings({}), { sender: { ...SENDER, logoData: 'https://evil.example/x.png' } });
  ok('anything that is not an image data URI is refused', !hosted.includes('evil.example'));
}

// The credit: ours, small, last, and theirs to remove.
{
  const on = shell.emailShell('<p>x</p>', settings({}));
  ok('the credit is there by default', on.includes('Invoice Studio by ANUPRESS') && on.includes('https://anupress.com'));
  ok('and it comes after their own details', on.indexOf('4 Quarry Street') < on.indexOf('Invoice Studio by ANUPRESS'));
  const off = shell.emailShell('<p>x</p>', settings({ emailCredit: false }));
  ok('turned off, it is gone', !off.includes('Invoice Studio'));
  ok('their own footer stays', off.includes('4 Quarry Street'));
}

// A business with nothing filled in yet must not produce an empty grey box.
{
  const bare = shell.emailShell('<p>Hello</p>', { emailStyle: 'card', emailCredit: false }, { sender: {} });
  ok('no footer at all when there is nothing to put in it', !bare.includes('padding:18px 24px 0'));
  ok('and the message still arrives', bare.includes('Hello'));
}

// ---------------------------------------------------------------------------------------------
// The whole page, for the routes that send raw HTML
// ---------------------------------------------------------------------------------------------
{
  const page = shell.emailPage('<table role="presentation"></table>', { title: 'Invoice INV-1 <script>', accent: '#14509b' });
  ok('a document, not a fragment', page.startsWith('<!DOCTYPE html>') && page.includes('</html>'));
  ok('the title is escaped', page.includes('&lt;script&gt;') && !page.includes('<script>'));
  ok('iOS is stopped from resizing the text', page.includes('-webkit-text-size-adjust: 100%'));
  ok('Outlook is stopped from spacing the tables', page.includes('mso-table-lspace'));
  ok('iOS is stopped from linking dates and addresses', page.includes('a[x-apple-data-detectors]'));
  ok('Gmail’s stray margin is removed', page.includes('div[style*="margin: 16px 0"]'));
  ok('images do not carry a border', page.includes('img { border: 0'));
  ok('and it narrows on a phone', page.includes('@media only screen and (max-width: 620px)'));
}

// ---------------------------------------------------------------------------------------------
// The message, through the shell
// ---------------------------------------------------------------------------------------------
const draft = normaliseDraft({
  kind: 'invoice', number: 'INV-2026-0001', issued: '2026-08-01', due: '2026-08-31',
  sender: SENDER, client: { name: 'Harbour Lane Bakery', email: 'a@b.example' },
  lines: [{ description: 'Site survey', quantity: 1, unitPrice: 320 }],
  totals: { subtotal: 320, taxTotal: 64, total: 384, amountPaid: 0, balance: 384, taxLines: [{ name: 'VAT', rate: 20, amount: 64 }], discounts: [], shipping: { amount: 0 } },
});
const m = msg.buildMessage('invoice_sent', draft, { sender: SENDER }, { now: new Date('2026-08-02T09:00:00Z') });

{
  eq('the message knows the document’s own word', m.document.kindWord, 'Invoice');
  eq('and its amount, already formatted', m.document.amount, '$384.00');

  const html = clip.messageToHtml(m, settings());
  ok('the shell is around it', html.includes('ANUPRESS Works') && html.includes('role="presentation"'));
  ok('the summary names the document', html.includes('INV-2026-0001'));
  ok('and shows what is owed, large', html.includes('font-size:20px') && html.includes('384.00'));
  ok('the due date is there', html.includes('Due 31 Aug 2026'));
  ok('the body is in it', html.includes('Hello Harbour Lane Bakery'));
  ok('a fragment by default, for pasting', !html.startsWith('<!DOCTYPE'));

  const page = clip.messageToHtml(m, settings(), { full: true });
  ok('a whole page when asked for', page.startsWith('<!DOCTYPE html>'));
  ok('carrying the same shell', page.includes('ANUPRESS Works') && page.includes('INV-2026-0001'));
  ok('and the subject as its title', page.includes('<title>Invoice INV-2026-0001 from ANUPRESS Works</title>'));

  // A German invoice says Rechnung in the summary too — the word comes from the document.
  const de = msg.buildMessage('invoice_sent', { ...draft, language: 'de' }, { sender: SENDER }, { now: new Date('2026-08-02T09:00:00Z') });
  ok('the summary follows the document’s language', clip.messageToHtml(de, settings()).includes('Rechnung INV-2026-0001'));
}

// ---------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------
{
  eq('the card is the default', store.sanitise({}).delivery.emailStyle, 'card');
  eq('a real style survives', store.sanitise({ delivery: { emailStyle: 'slate' } }).delivery.emailStyle, 'slate');
  eq('nonsense falls back', store.sanitise({ delivery: { emailStyle: 'sparkly' } }).delivery.emailStyle, 'card');
  eq('the credit is on by default', store.sanitise({}).delivery.emailCredit, true);
  eq('and can be turned off', store.sanitise({ delivery: { emailCredit: false } }).delivery.emailCredit, false);
  eq('a good accent survives', store.sanitise({ delivery: { emailAccent: '#a33830' } }).delivery.emailAccent, '#a33830');
  eq('so does shorthand', store.sanitise({ delivery: { emailAccent: '#abc' } }).delivery.emailAccent, '#abc');
  // A colour that is not one would land in a style attribute and take the declaration with it.
  eq('but not a colour that is not one', store.sanitise({ delivery: { emailAccent: 'red; }' } }).delivery.emailAccent, '#14509b');
  eq('nor an empty one', store.sanitise({ delivery: { emailAccent: '' } }).delivery.emailAccent, '#14509b');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
