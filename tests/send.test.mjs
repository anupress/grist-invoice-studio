import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const msg = await import(pathToFileURL(_resolve(ROOT, 'src/send/message.js')).href);
const mailto = await import(pathToFileURL(_resolve(ROOT, 'src/send/mailto.js')).href);
const outbox = await import(pathToFileURL(_resolve(ROOT, 'src/send/outbox.js')).href);
const rules = await import(pathToFileURL(_resolve(ROOT, 'src/send/rules.js')).href);
const endpoint = await import(pathToFileURL(_resolve(ROOT, 'src/send/endpoint.js')).href);
const file = await import(pathToFileURL(_resolve(ROOT, 'src/export/html-file.js')).href);
const { normaliseDraft } = await import(pathToFileURL(_resolve(ROOT, 'src/model/draft.js')).href);

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

const NOW = new Date('2026-08-27T09:00:00Z');

const draft = (over = {}) => normaliseDraft({
  kind: 'invoice', number: 'INV-2026-0001', issued: '2026-07-20', due: '2026-08-19', status: 'Sent',
  currency: 'GBP', format: { currency: 'GBP' }, terms: 'Net 30',
  sender: { name: 'Thornbury Works', email: 'accounts@thornburyworks.example' },
  client: { name: 'Kingfisher Print Works', email: 'pay@kingfisher.example' },
  lines: [{ description: 'Press setup', quantity: 1, unitPrice: 1250 }],
  totals: { subtotal: 1250, taxTotal: 250, total: 1500, amountPaid: 0, balance: 1500, taxLines: [], discounts: [] },
  ...over,
});

// ---------------------------------------------------------------------------------------------
// Templating
// ---------------------------------------------------------------------------------------------
const m = msg.buildMessage('invoice_sent', draft(), { paymentDetails: 'Acc 12345678, sort 01-02-03' }, { now: NOW });

eq('the recipient comes from the client', m.to, 'pay@kingfisher.example');
eq('the subject names the document and the sender', m.subject, 'Invoice INV-2026-0001 from Thornbury Works');
ok('the body carries the total', m.body.includes('£1,500.00'));
ok('and the payment details', m.body.includes('Acc 12345678'));
ok('and the terms line', m.body.includes('Payment terms: Net 30.'));
// Most people end a sentence. Adding a full stop unconditionally gave "Net 30.." on every invoice.
ok('terms that already end in a stop do not get a second one',
  msg.buildMessage('invoice_sent', draft({ terms: 'Net 30 from the date of invoice.' }), {}, { now: NOW })
    .body.includes('Payment terms: Net 30 from the date of invoice.\n'));
eq('and never a double stop',
  /\.\./.test(msg.buildMessage('invoice_sent', draft({ terms: 'Net 30 from the date of invoice.' }), {}, { now: NOW }).body), false);
eq('no problems when there is somewhere to send it', m.problems, []);

// A company is addressed by its name; only something that looks like a person's name is shortened.
ok('a company keeps its whole name', m.body.includes('Hello Kingfisher Print Works,'));
const person = msg.buildMessage('invoice_sent', draft({ client: { name: 'Margaret Ellery', email: 'm@e.example' } }), {}, { now: NOW });
ok('a person is greeted by their first name', person.body.includes('Hello Margaret,'));

// An unknown placeholder is left visible rather than emptied — a hole in a message tells nobody
// anything, but "{clientname}" tells whoever wrote the template exactly what they got wrong.
eq('an unknown placeholder survives', msg.fill('Hi {clientname} and {client_name}', { client_name: 'Ada' }), 'Hi {clientname} and Ada');
eq('a stray brace is left alone', msg.fill('Save {50%} today', {}), 'Save {50%} today');

// Optional lines leave blank space behind when they are empty; one template has to work for a
// business that has filled everything in and one that has not.
const bare = msg.buildMessage('invoice_sent', draft({ terms: '' }), {}, { now: NOW });
eq('no run of blank lines is left behind', /\n{3,}/.test(bare.body), false);
eq('and it does not end in whitespace', bare.body, bare.body.trim());

// No email address is a problem worth stating, not an empty field to discover later.
const noEmail = msg.buildMessage('invoice_sent', draft({ client: { name: 'Cash Sale' } }), {}, { now: NOW });
eq('a client with no address is reported', noEmail.problems.length, 1);
ok('and says why', /no email address/.test(noEmail.problems[0]));

// What the user types wins over the template.
const edited = msg.buildMessage('invoice_sent', draft(), {}, { subject: 'Your bill, {number}', now: NOW });
eq('an edited subject is still filled in', edited.subject, 'Your bill, INV-2026-0001');

eq('days between two dates', msg.daysBetween('2026-08-19', '2026-08-27'), 8);
eq('backwards is negative', msg.daysBetween('2026-08-27', '2026-08-19'), -8);
eq('nonsense is null', msg.daysBetween('', '2026-08-27'), null);

// ---------------------------------------------------------------------------------------------
// Which message a document is asking for
// ---------------------------------------------------------------------------------------------
eq('a quote asks for the quote message', rules.suggestTemplate(draft({ kind: 'quote' }), NOW), 'quote_sent');
eq('a paid invoice asks for a receipt', rules.suggestTemplate(draft({ status: 'Paid' }), NOW), 'payment_received');
eq('eight days late is the overdue reminder', rules.suggestTemplate(draft({ due: '2026-08-19' }), NOW), 'reminder_overdue');
// Ordered longest-first: something forty days late is not also due a gentle nudge.
eq('forty days late is the final notice', rules.suggestTemplate(draft({ due: '2026-07-18' }), NOW), 'reminder_final');
eq('due in two days is the early nudge', rules.suggestTemplate(draft({ due: '2026-08-29' }), NOW), 'reminder_due_soon');
eq('due next month is just an invoice', rules.suggestTemplate(draft({ due: '2026-10-01' }), NOW), 'invoice_sent');
eq('overdue by nothing yet', rules.overdueBy(draft({ due: '2026-08-27' }), NOW), 0);
eq('overdue by eight', rules.overdueBy(draft({ due: '2026-08-19' }), NOW), 8);

const overdueMsg = msg.buildMessage('reminder_overdue', draft({ due: '2026-08-19' }), {}, { now: NOW });
ok('the reminder counts the days', overdueMsg.body.includes('8 days overdue'));
// The covering email spells dates the way the document does. One saying "2026-08-19" beside an
// invoice saying "19 Aug 2026" reads as though it came from somewhere else.
ok('and writes the date as the document does', overdueMsg.body.includes('fell due on 19 Aug 2026'));
ok('the terms line too', msg.buildMessage('invoice_sent', draft({ terms: '' }), {}, { now: NOW }).body.includes('due by 19 Aug 2026'));

// ---------------------------------------------------------------------------------------------
// What sending records
// ---------------------------------------------------------------------------------------------
const stamp = rules.stampAfterSend(draft({ status: 'Draft' }), m, { now: NOW, route: 'mail client' });
eq('a draft becomes sent', stamp.status, 'Sent');
eq('dated', stamp.sentAt, '2026-08-27');
eq('and addressed', stamp.sentTo, 'pay@kingfisher.example');
// The status only moves forward: emailing a receipt for a paid invoice must not un-pay it.
const paidStamp = rules.stampAfterSend(draft({ status: 'Paid' }), m, { now: NOW });
eq('a paid invoice stays paid', paidStamp.status, 'Paid');
const receiptStamp = rules.stampAfterSend(draft({ status: 'Sent' }), { ...m, templateId: 'payment_received' }, { now: NOW });
eq('sending a receipt marks it paid', receiptStamp.status, 'Paid');
const overdueStamp = rules.stampAfterSend(draft({ status: 'Overdue' }), { ...m, templateId: 'reminder_overdue' }, { now: NOW });
eq('chasing an overdue invoice does not reset it to sent', overdueStamp.status, 'Overdue');

// ---------------------------------------------------------------------------------------------
// The mail client
// ---------------------------------------------------------------------------------------------
const link = mailto.buildMailto(m);
ok('it is a mailto', link.url.startsWith('mailto:pay@kingfisher.example?'));
ok('the subject is encoded', link.url.includes('subject=Invoice%20INV-2026-0001%20from%20Thornbury%20Works'));
ok('and the body is there', link.url.includes('&body='));
eq('nothing was cut', link.truncated, false);

// The limit is real and silent: past roughly 2,000 characters the body is TRUNCATED by the mail
// client rather than rejected, so an email would arrive stopping mid-sentence.
const huge = mailto.buildMailto({ ...m, body: 'x'.repeat(5000) });
eq('a long body is cut', huge.truncated, true);
ok('to something that fits', huge.url.length <= 1900);
ok('and it says where it stopped', huge.body.endsWith('[…]'));

const withNote = mailto.buildMailto(m, { attachmentNote: 'The invoice is attached.' });
ok('an attachment note can be appended', withNote.body.includes('The invoice is attached.'));

// ---------------------------------------------------------------------------------------------
// The document, in the body of the email
// ---------------------------------------------------------------------------------------------
const emailDoc = await import(pathToFileURL(_resolve(ROOT, 'src/send/email-document.js')).href);
const clip = await import(pathToFileURL(_resolve(ROOT, 'src/send/clipboard.js')).href);

const body = emailDoc.documentToEmailHtml(draft(), { paymentDetails: 'Acc 12345678' });
ok('it says what it is', body.includes('Invoice') && body.includes('INV-2026-0001'));
ok('who it is from', body.includes('Thornbury Works'));
ok('and to', body.includes('Kingfisher Print Works'));
ok('the lines are there', body.includes('Press setup'));
ok('the total', body.includes('£1,500.00'));
ok('and how to pay', body.includes('Acc 12345678'));

// Mail clients — Outlook above all, which renders with Word — strip these outright. A document
// using them arrives as a column of unstyled text in roughly the wrong order.
eq('no flexbox', /display\s*:\s*flex/.test(body), false);
eq('no grid', /display\s*:\s*grid/.test(body), false);
eq('no stylesheet block, which every client strips', /<style/.test(body), false);
eq('no class names to be rewritten', /class=/.test(body), false);
ok('laid out with tables, like email actually works', body.includes('<table'));
ok('and styled inline', body.includes('style="'));
// 600px is what every email design settled on: it fits Outlook's reading pane without a scrollbar.
ok('600px wide', body.includes('width="600"'));

// A name with an ampersand or a bracket in it must not break the markup.
const risky = emailDoc.documentToEmailHtml(draft({ client: { name: 'A & B <Ltd>', email: 'x@y.example' } }), {});
ok('markup is escaped', risky.includes('A &amp; B &lt;Ltd&gt;'));
eq('and no raw tag leaks through', /<Ltd>/.test(risky), false);

// The kinds rule holds here as it does on screen and in the PDF, from the same description.
const dnBody = emailDoc.documentToEmailHtml(draft({ kind: 'delivery_note' }), {});
ok('a delivery note lists the goods', dnBody.includes('Press setup'));
eq('and carries no prices', /1,250\.00|1,500\.00/.test(dnBody), false);

// Folded into the covering note.
const withDoc = clip.messageToHtml(m, {}, { document: body });
ok('the note comes first', withDoc.indexOf('Hello') < withDoc.indexOf('<table'));
ok('then the document', withDoc.includes('Press setup'));
// The three-line summary box would be repeating what the table underneath says in full.
eq('and the summary box is dropped', (withDoc.match(/Invoice INV-2026-0001<\/strong>/g) || []).length, 0);
const withoutDoc = clip.messageToHtml(m, {});
ok('without it, the summary box stays', withoutDoc.includes('<strong>'));
eq('and there is no line table', withoutDoc.includes('Press setup'), false);

// ---------------------------------------------------------------------------------------------
// The outbox
// ---------------------------------------------------------------------------------------------
const row = outbox.buildOutboxRow(m, { html: '<div>hi</div>' });
// Held, not ready. The false→true transition is what a Grist webhook actually fires on, and it
// gives a person a chance to look before anything leaves.
eq('a queued message is held, not ready', row.Ready, false);
eq('and says so', row.Status, 'Held');
eq('the recipient', row.ToEmail, 'pay@kingfisher.example');
eq('the document travels with it', row.DocumentNumber, 'INV-2026-0001');
eq('including the total, so nothing has to be looked up', row.DocumentTotal, 1500);
eq('and the currency', row.DocumentCurrency, 'GBP');
ok('queued at a real time', /^\d{4}-\d{2}-\d{2}T/.test(row.QueuedAt));

eq('releasing flips exactly the ready column', outbox.releaseActions([3, 4])[0][0], 'BulkUpdateRecord');
eq('for those rows', outbox.releaseActions([3, 4])[0][2], [3, 4]);
eq('to true', outbox.releaseActions([3, 4])[0][3].Ready, [true, true]);
eq('nothing to release is no action', outbox.releaseActions([]), []);

const create = outbox.createOutboxActions();
eq('the table is created in one action', create.length, 1);
ok('with a Ready column, which is the whole mechanism', create[0][2].some((c) => c.id === 'Ready' && c.type === 'Bool'));
ok('and an attachment column for the document', create[0][2].some((c) => c.id === 'Attachment' && c.type === 'Attachments'));

const setup = outbox.setupInstructions({ endpoint: 'https://relay.example/send' });
ok('the instructions name the table', setup.steps[1].text.includes('ANUPRESS_Outbox'));
ok('and the ready column', setup.steps[1].text.includes('Ready column     Ready'));
ok('and the endpoint they gave', setup.steps[1].text.includes('https://relay.example/send'));
ok('a sample payload is shown so nobody has to guess the keys', setup.samplePayload.includes('ToEmail'));

// ---------------------------------------------------------------------------------------------
// The endpoint — the one route that leaves the browser
// ---------------------------------------------------------------------------------------------
eq('nothing set is not an endpoint', endpoint.checkEndpoint('').ok, false);
eq('nor is a non-URL', endpoint.checkEndpoint('not a url').ok, false);
// An invoice carries a name, an address and an amount. Over plain http that is all in clear text.
eq('http is refused', endpoint.checkEndpoint('http://relay.example/send').ok, false);
ok('and says why', /clear text/.test(endpoint.checkEndpoint('http://relay.example/send').problem));
eq('https is fine', endpoint.checkEndpoint('https://relay.example/send').ok, true);
// Loopback is the one exemption: a relay on the same machine never puts anything on a network,
// which is why browsers treat localhost as a secure context too.
eq('a relay on this machine is allowed over http', endpoint.checkEndpoint('http://localhost:4300/send').ok, true);
eq('so is the numeric form', endpoint.checkEndpoint('http://127.0.0.1:4300/send').ok, true);
eq('but not some other host that merely mentions localhost', endpoint.checkEndpoint('http://localhost.evil.example/send').ok, false);
eq('and reports the host', endpoint.checkEndpoint('https://relay.example/send').host, 'relay.example');

// A key in the query string would be stored in a table every editor of the document can read.
eq('a named credential in the query is refused', endpoint.checkEndpoint('https://relay.example/send?api_key=abc123').ok, false);
ok('naming the offending parameter', /api_key/.test(endpoint.checkEndpoint('https://relay.example/send?api_key=abc123').problem));
eq('so is a token parameter', endpoint.checkEndpoint('https://x.example/?token=abc').ok, false);
// An opaque token in the PATH is how Zapier, Make and Slack hooks are shaped, and is normal.
eq('an opaque path is fine', endpoint.checkEndpoint('https://hooks.zapier.com/hooks/catch/12345/abcdef/').ok, true);

const attachment = { fileName: 'invoice.pdf', contentType: 'application/pdf', encoding: 'base64', content: 'JVBERi0=' };
const payload = endpoint.buildPayload(m, { html: '<div>hi</div>', attachment });
eq('the payload announces itself', payload.source, 'invoice-studio');
eq('and is versioned, because somebody will parse it', payload.version, 1);
eq('the recipient', payload.to, 'pay@kingfisher.example');
eq('the document', payload.document.number, 'INV-2026-0001');
eq('the file travels with it, so the far end fetches nothing', payload.attachment.fileName, 'invoice.pdf');
// The far end has to be TOLD how the content is encoded. Guessing is how a PDF gets base64-encoded
// twice and arrives as a file no reader will open.
eq('and says how it is encoded', payload.attachment.encoding, 'base64');
eq('with no file, there is no attachment key to trip over', endpoint.buildPayload(m).attachment, null);

// ---------------------------------------------------------------------------------------------
// The file
// ---------------------------------------------------------------------------------------------
eq('a findable filename', file.fileNameFor(draft()), 'invoice_INV-2026-0001_Kingfisher-Print-Works.html');
// Anything a filesystem dislikes is replaced rather than dropped, or two documents collapse into
// one name and the second silently overwrites the first.
eq('awkward characters are replaced, not removed',
  file.fileNameFor(normaliseDraft({ kind: 'invoice', number: 'INV/2026\\01', client: { name: 'A & B: Ltd' } })),
  'invoice_INV-2026-01_A-B-Ltd.html');
eq('an unsaved document still gets a name', file.fileNameFor(normaliseDraft({ kind: 'quote' })), 'quote_draft.html');

// ---------------------------------------------------------------------------------------------
// Saved wordings. Three layers: typed for this send, saved in Settings, built-in — in that order.
// ---------------------------------------------------------------------------------------------
{
  const saved = { messages: { invoice_sent: { subject: 'Bill {number} from {sender_name}', body: 'Here is {number} for {total}.' } } };
  const s = { ...saved, paymentDetails: '' };
  const withSaved = msg.buildMessage('invoice_sent', draft(), s, { now: NOW });
  ok('a saved subject is used', withSaved.subject.startsWith('Bill '));
  ok('and its placeholders still fill', /INV-|51372|\d/.test(withSaved.subject) && !withSaved.subject.includes('{number}'));
  ok('a saved body is used', withSaved.body.startsWith('Here is '));

  // What is typed in the Send panel for one send still beats the saved wording.
  const typed = msg.buildMessage('invoice_sent', draft(), s, { now: NOW, subject: 'One-off subject' });
  eq('a per-send subject wins over the saved one', typed.subject, 'One-off subject');
  ok('while the saved body still applies underneath', typed.body.startsWith('Here is '));

  // A template with no saved entry is untouched.
  const other = msg.buildMessage('reminder_overdue', draft(), s, { now: NOW });
  ok('other events keep their built-in wording', /overdue/i.test(other.subject));
  // And no saved messages at all is exactly the old behaviour.
  const stock = msg.buildMessage('invoice_sent', draft(), { paymentDetails: '' }, { now: NOW });
  ok('no overrides means the built-in text', /from/.test(stock.subject) && !stock.subject.startsWith('Bill '));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
