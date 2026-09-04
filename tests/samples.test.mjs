import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const samples = await import(pathToFileURL(_resolve(ROOT, 'src/templates/samples.js')).href);
const starter = await import(pathToFileURL(_resolve(ROOT, 'src/templates/starter.js')).href);
const T = await import(pathToFileURL(_resolve(ROOT, 'src/templates/index.js')).href);
const lang = await import(pathToFileURL(_resolve(ROOT, 'src/doc/lang.js')).href);
const sample = await import(pathToFileURL(_resolve(ROOT, 'src/data/sample.js')).href);
const clip = await import(pathToFileURL(_resolve(ROOT, 'src/send/clipboard.js')).href);
const msg = await import(pathToFileURL(_resolve(ROOT, 'src/send/message.js')).href);
const email = await import(pathToFileURL(_resolve(ROOT, 'src/send/email-document.js')).href);
const store = await import(pathToFileURL(_resolve(ROOT, 'src/settings/store.js')).href);
const { normaliseDraft } = await import(pathToFileURL(_resolve(ROOT, 'src/model/draft.js')).href);

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

// ---------------------------------------------------------------------------------------------
// Every trade has a complete sample business. This is the data a first document is made of and
// the data a blog post shows, so it is checked trade by trade rather than spot-checked.
// ---------------------------------------------------------------------------------------------
const STATES = ['Draft', 'Overdue', 'Paid', 'Part paid', 'Sent'];
for (const t of T.TEMPLATES) {
  const s = samples.SAMPLES[t.id];
  ok(`${t.id}: has a sample`, !!s);
  if (!s) continue;
  ok(`${t.id}: the business is ANUPRESS-branded`, /^ANUPRESS /.test(s.business.name));
  ok(`${t.id}: with an address`, s.business.street1 && s.business.city && s.business.postcode && s.business.country === 'GB');
  ok(`${t.id}: an email on a reserved domain`, /@anupress\.example$/.test(s.business.email));
  ok(`${t.id}: a fictional phone number`, /^\+44 (117 496|20 7946) /.test(s.business.phone));
  // So the pay-online code shows on every starter's invoices, as it does in the public demo; on a
  // reserved domain, so a code left in by mistake scans to nothing.
  ok(`${t.id}: a payment link on a reserved domain`, /^https:\/\/pay\.anupress\.example\//.test(s.business.paymentLink));
  ok(`${t.id}: at least three clients`, s.clients.length >= 3);
  ok(`${t.id}: client names are distinct`, new Set(s.clients.map((c) => c.Name)).size === s.clients.length);
  ok(`${t.id}: every client has a two-letter country`, s.clients.every((c) => /^[A-Z]{2}$/.test(c.Country)));
  ok(`${t.id}: client emails are on example domains or empty`, s.clients.every((c) => !c.Email || /\.example$|example\.com$/.test(c.Email)));
  ok(`${t.id}: a language, where set, is one we speak`, s.clients.every((c) => !c.Language || lang.normaliseLanguage(c.Language) === c.Language));
  ok(`${t.id}: at least four priced products`, s.products.filter((p) => Number(p.Price) > 0).length >= 4);
  ok(`${t.id}: product SKUs are distinct`, new Set(s.products.map((p) => p.SKU)).size === s.products.length);
  eq(`${t.id}: five documents, one in each state`, s.invoices.map((i) => i.status).sort(), STATES);
  ok(`${t.id}: every document names an existing client`, s.invoices.every((i) => i.client >= 1 && i.client <= s.clients.length));
  ok(`${t.id}: every line names an existing product`, s.invoices.every((i) => i.lines.every(([p, q]) => p >= 0 && p < s.products.length && q > 0)));
  ok(`${t.id}: the overdue one is older than its terms`, s.invoices.find((i) => i.status === 'Overdue').age > s.invoices.find((i) => i.status === 'Overdue').terms);
  ok(`${t.id}: the draft is from today`, s.invoices.find((i) => i.status === 'Draft').age === 0);
  ok(`${t.id}: a preview line exists`, starter.SAMPLE_LINES[t.id].length > 0 && starter.SAMPLE_LINES[t.id][0].unitPrice > 0);
}
// Four trades show the language feature through a client abroad.
ok('some clients are abroad with a language', T.TEMPLATES.filter((t) => samples.SAMPLES[t.id].clients.some((c) => c.Language)).length >= 3);

// ---------------------------------------------------------------------------------------------
// The tables the starter builds from it
// ---------------------------------------------------------------------------------------------
for (const t of T.TEMPLATES) {
  const built = starter.starterTablesFor(t.id, { numberPrefix: 'INV-', grossOf: ({ lines }) => lines.reduce((a, l) => a + l.quantity * l.unitPrice, 0) * 1.2 });
  const by = Object.fromEntries(built.map((x) => [x.id, x]));
  eq(`${t.id}: four tables`, built.map((x) => x.id), ['Clients', 'Products', 'Invoices', 'InvoiceItems']);
  eq(`${t.id}: five invoices`, by.Invoices.records.length, 5);
  ok(`${t.id}: numbered in sequence`, by.Invoices.records.every((r, i) => r.InvoiceNumber.endsWith(String(i + 1).padStart(4, '0'))));
  ok(`${t.id}: every invoice has lines`, by.Invoices.records.every((_, i) => by.InvoiceItems.records.some((it) => it.Invoice === i + 1)));
  ok(`${t.id}: every line points at a real invoice`, by.InvoiceItems.records.every((it) => it.Invoice >= 1 && it.Invoice <= 5));
  ok(`${t.id}: every line is priced from the catalogue`, by.InvoiceItems.records.every((it) => by.Products.records.some((p) => p.Name === it.Description && p.Price === it.Price)));
  ok(`${t.id}: stored totals are the sum of the lines`, by.Invoices.records.every((r, i) => Math.abs(r.Total - by.InvoiceItems.records.filter((it) => it.Invoice === i + 1).reduce((a, it) => a + it.Total, 0)) < 0.001));
  const paid = by.Invoices.records.find((r) => r.Status === 'Paid');
  const part = by.Invoices.records.find((r) => r.Status === 'Part paid');
  ok(`${t.id}: paid means the gross was paid`, Math.abs(paid.AmountPaid - paid.Total * 1.2) < 0.02 && paid.PaidDate);
  ok(`${t.id}: part paid means half the gross`, Math.abs(part.AmountPaid - paid.Total * 0 - part.Total * 0.6) < 0.02);
  const sent = by.Invoices.records.find((r) => r.Status === 'Sent');
  ok(`${t.id}: a sent invoice remembers being sent`, sent.SentAt === sent.Issued && typeof sent.SentTo === 'string');
  const draft = by.Invoices.records.find((r) => r.Status === 'Draft');
  ok(`${t.id}: a draft has not been sent`, !draft.SentAt && !draft.AmountPaid);
  ok(`${t.id}: due dates follow issue dates`, by.Invoices.records.every((r) => r.Due >= r.Issued));
  ok(`${t.id}: the line table carries units`, by.InvoiceItems.columns.some((c) => c.id === 'Unit'));
  ok(`${t.id}: clients keep their language`, by.Clients.records.every((c) => 'Language' in c));
}
// The business identity the setup seeds.
const cafe = starter.sampleBusinessFor('restaurant');
eq('the café is ANUPRESS Café', cafe.name, 'ANUPRESS Café');
ok('with payment details of its own or none', typeof cafe.paymentDetails === 'string');
eq('an unknown trade gets the builder', starter.sampleBusinessFor('nonsense').name, 'ANUPRESS Works');

// The demo sender is the same business the construction starter builds.
eq('the demo sender is ANUPRESS Works', sample.SAMPLE_SENDER.name, 'ANUPRESS Works');
ok('with a payment page on a reserved domain', /^https:\/\/pay\.anupress\.example\//.test(sample.SAMPLE_SENDER.paymentLink));
ok('and no real address', !/Thornbury/.test(JSON.stringify(sample.SAMPLE_SENDER)));

// ---------------------------------------------------------------------------------------------
// The setup record survives sanitising
// ---------------------------------------------------------------------------------------------
{
  const s = store.sanitise({ setup: { trade: 'restaurant', sampleBusiness: 'ANUPRESS Café', sampleRows: { Clients: [1, 2, '3', 'x', -1], Invoices: [] } } });
  eq('the trade and the name survive', [s.setup.trade, s.setup.sampleBusiness], ['restaurant', 'ANUPRESS Café']);
  eq('row ids are integers, and an empty table is dropped', s.setup.sampleRows, { Clients: [1, 2, 3] });
  eq('nothing by default', store.sanitise({}).setup, { trade: '', sampleBusiness: '', sampleRows: {} });
}

// ---------------------------------------------------------------------------------------------
// Which sample rows are still there to remove
// ---------------------------------------------------------------------------------------------
{
  const writer = await import(pathToFileURL(_resolve(ROOT, 'src/grist/writer.js')).href);
  const provider = {
    tables: () => [{ id: 'Clients' }, { id: 'Invoices' }, { id: 'InvoiceItems' }],
    records: (t) => ({ Clients: [{ id: 1 }, { id: 2 }, { id: 7 }], Invoices: [{ id: 1 }], InvoiceItems: [{ id: 3 }, { id: 4 }] })[t] || [],
  };
  const todo = writer.sampleRowsPresent({ Clients: [1, 2, 3], Invoices: [1, 2], InvoiceItems: [3, 4], Products: [1] }, provider);
  eq('lines first, then invoices, then clients — a referenced row goes after the row pointing at it', todo.map((t) => t.table), ['InvoiceItems', 'Invoices', 'Clients']);
  eq('only rows that still exist', todo.find((t) => t.table === 'Clients').ids, [1, 2]);
  eq('a table that has gone is skipped', todo.some((t) => t.table === 'Products'), false);
  ok('a row typed in beside the sample is not on the list', !todo.find((t) => t.table === 'Clients').ids.includes(7));
  eq('nothing to remove is an empty list', writer.sampleRowsPresent({}, provider), []);
}

// ---------------------------------------------------------------------------------------------
// Links in the email
// ---------------------------------------------------------------------------------------------
eq('an https address becomes a link', clip.linkify('Pay at https://pay.example/inv'), 'Pay at <a href="https://pay.example/inv" style="color:#14509b;text-decoration:underline">https://pay.example/inv</a>');
ok('trailing punctuation stays outside it', clip.linkify('See https://pay.example/inv.').endsWith('</a>.'));
ok('an email becomes a mailto', clip.linkify('Write to accounts@anupress.example today').includes('<a href="mailto:accounts@anupress.example"'));
eq('plain http is left as text', clip.linkify('http://insecure.example/x'), 'http://insecure.example/x');
eq('a bare domain is left alone', clip.linkify('anupress.com is the site'), 'anupress.com is the site');
ok('the accent colours the link', clip.linkify('https://a.example', '#a33830').includes('color:#a33830'));

const draft = normaliseDraft({
  kind: 'invoice', number: 'INV-1', issued: '2026-09-01', due: '2026-09-15',
  sender: { name: 'ANUPRESS Works', email: 'accounts@anupress.example', website: 'anupress.com', paymentLink: 'https://pay.anupress.example/inv' },
  client: { name: 'Harbour Lane Bakery', email: 'accounts@harbourlane.example' },
  lines: [{ description: 'Work', quantity: 1, unitPrice: 100 }],
  totals: { subtotal: 100, taxTotal: 20, total: 120, amountPaid: 0, balance: 120, taxLines: [{ name: 'VAT', rate: 20, amount: 20 }], discounts: [], shipping: { amount: 0 } },
});
const m = msg.buildMessage('invoice_sent', draft, {}, { now: new Date('2026-09-02T09:00:00Z') });
ok('the payment link is in the message', m.body.includes('Pay online: https://pay.anupress.example/inv'));
eq('and available as a placeholder', m.values.payment_link, 'https://pay.anupress.example/inv');
eq('so is the website', m.values.website, 'anupress.com');
const noLink = msg.buildMessage('invoice_sent', normaliseDraft({ ...draft, sender: { name: 'X' } }), {}, { now: new Date('2026-09-02T09:00:00Z') });
ok('without a link the line vanishes', !noLink.body.includes('Pay online'));
const html = clip.messageToHtml(m, {});
ok('the formatted message links it', html.includes('<a href="https://pay.anupress.example/inv"'));
const doc = email.documentToEmailHtml(draft, { paymentDetails: 'Questions: accounts@anupress.example' });
ok('the document masthead links the website', doc.includes('<a href="https://anupress.com"'));
ok('the payment page is a link in the document', doc.includes('<a href="https://pay.anupress.example/inv"'));
ok('and an email in the payment details is a mailto', doc.includes('mailto:accounts@anupress.example'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
