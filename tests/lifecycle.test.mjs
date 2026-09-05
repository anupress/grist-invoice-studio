import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => import(pathToFileURL(_resolve(ROOT, p)).href);
const lc = await load('src/model/lifecycle.js');
const { normaliseDraft, recalc } = await load('src/model/draft.js');
const { simpleRate } = await load('src/money/tax/rates.js');
const f = await load('src/doc/fields.js');
const email = await load('src/send/email-document.js');
const store = await load('src/settings/store.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

const settings = { money: { currency: 'GBP', taxEnabled: true, taxMode: 'simple', taxRates: simpleRate({ rate: 20, name: 'VAT' }), homeCountry: 'GB' } };
const draft = (over = {}) => recalc(normaliseDraft({
  kind: 'invoice', rowId: 7, number: 'INV-2026-0014', issued: '2026-07-31', due: '2026-08-30', serviceDate: '2026-07-28', status: 'Sent', reference: 'PO-1',
  sender: { name: 'ANUPRESS Works', country: 'GB' }, client: { name: 'Harbour Lane Bakery', country: 'GB' },
  lines: [{ rowId: 41, description: 'Monthly rent', quantity: 1, unitPrice: 950 }, { rowId: 42, description: 'Parking', quantity: 2, unitPrice: 40 }],
  ...over,
}), settings);

// ---------------------------------------------------------------------------------------------
// Dates move on by a period, and the day of the month survives where it can
// ---------------------------------------------------------------------------------------------
eq('a month on', lc.addPeriod('2026-07-15', 'month'), '2026-08-15');
eq('the 31st becomes the 30th in a short month', lc.addPeriod('2026-08-31', 'month'), '2026-09-30');
eq('and February clamps to the 28th', lc.addPeriod('2026-01-31', 'month'), '2026-02-28');
eq('a leap year gets the 29th', lc.addPeriod('2028-01-31', 'month'), '2028-02-29');
eq('a quarter', lc.addPeriod('2026-11-30', 'quarter'), '2027-02-28');
eq('a year', lc.addPeriod('2024-02-29', 'year'), '2025-02-28');
eq('a week', lc.addPeriod('2026-12-28', 'week'), '2027-01-04');
eq('nonsense is empty', lc.addPeriod('soon', 'month'), '');

// ---------------------------------------------------------------------------------------------
// The next document
// ---------------------------------------------------------------------------------------------
{
  const paid = draft({ status: 'Paid', amountPaid: 1236 });
  const next = lc.nextDocument(paid, 'month');
  eq('a new draft, not the old row', [next.rowId, next.number, next.status], [null, '', 'Draft']);
  eq('every date moved on', [next.issued, next.due, next.serviceDate], ['2026-08-31', '2026-09-30', '2026-08-28']);
  eq('nothing paid on it yet', next.amountPaid, 0);
  eq('the lines copied', next.lines.map((l) => [l.description, l.quantity, l.unitPrice]), [['Monthly rent', 1, 950], ['Parking', 2, 40]]);
  ok('without their row ids, so saving adds rows', next.lines.every((l) => l.rowId === undefined));
  eq('the client stays', next.client.name, 'Harbour Lane Bakery');
  eq('the original is untouched', [paid.rowId, paid.issued, paid.lines[0].rowId], [7, '2026-07-31', 41]);
  eq('a year on', lc.nextDocument(paid, 'year').issued, '2027-07-31');
}

// ---------------------------------------------------------------------------------------------
// Interest on a late payment
// ---------------------------------------------------------------------------------------------
{
  const asAt = new Date('2026-09-29T12:00:00Z');   // 30 days after the due date
  const fee = lc.lateFee(draft(), { rate: 8, asAt });
  eq('thirty days', fee.days, 30);
  eq('on the gross balance', fee.balance, 1236);
  eq('simple interest, to the penny', fee.amount, Math.round(1236 * 0.08 * 30 / 365 * 100) / 100);
  ok('the description says what it is', /30 days overdue at 8% a year/.test(fee.description));
  const line = lc.lateFeeLine(fee);
  eq('as a zero-rated line', [line.quantity, line.unitPrice, line.taxClass], [1, fee.amount, 'zero']);

  eq('nothing before the due date', lc.lateFee(draft(), { asAt: new Date('2026-08-30T00:00:00Z') }), null);
  eq('nothing on a paid invoice', lc.lateFee(draft({ amountPaid: 1236 }), { asAt }), null);
  eq('nothing on a quote', lc.lateFee(draft({ kind: 'quote' }), { asAt }), null);
  eq('a part payment reduces the base', lc.lateFee(draft({ amountPaid: 1000 }), { rate: 8, asAt }).balance, 236);
  eq('at zero per cent there is nothing to add', lc.lateFee(draft(), { rate: 0, asAt }), null);
}

// ---------------------------------------------------------------------------------------------
// A statement of account
// ---------------------------------------------------------------------------------------------
{
  const docs = [
    draft({ number: 'INV-3', issued: '2026-08-01', status: 'Overdue', amountPaid: 0 }),                    // owes 1236
    draft({ number: 'INV-1', issued: '2026-06-01', status: 'Part paid', amountPaid: 1000 }),              // owes 236
    draft({ number: 'INV-2', issued: '2026-07-01', status: 'Paid', amountPaid: 1236 }),                   // owes nothing
    draft({ number: 'Q-9', kind: 'quote', issued: '2026-08-15', status: 'Sent' }),                        // asks nothing
    draft({ number: 'INV-4', issued: '2026-09-01', status: 'Draft' }),                                    // not issued
    draft({ number: 'INV-5', issued: '2026-05-01', status: 'Cancelled' }),                                // never
  ];
  const st = lc.buildStatement({ client: { name: 'Harbour Lane Bakery', country: 'GB' }, documents: docs, asAt: new Date('2026-09-05T00:00:00Z'), sender: { name: 'ANUPRESS Works' }, currency: 'GBP', number: 'STM-2026-0001' });
  eq('a statement', st.kind, 'statement');
  eq('as at today', st.issued, '2026-09-05');
  eq('only the open documents, oldest first', st.lines.map((l) => l.description), ['Invoice INV-1', 'Invoice INV-3']);
  eq('each with its charge and what was paid', st.lines.map((l) => [l.charge, l.paid]), [[1236, 1000], [1236, 0]]);
  eq('and a running balance', st.lines.map((l) => l.balance), [236, 1472]);
  eq('the closing balance is what is owed', st.totals.balance, 1472);
  const fields = f.fieldsFor(st, settings);
  eq('the document lists documents, not items', fields.kind.lineMode, 'documents');
  const html = email.documentToEmailHtml(st, settings);
  ok('and renders them', html.includes('Invoice INV-1') && html.includes('Invoice INV-3') && !html.includes('Q-9'));
  eq('nothing open, an empty statement', lc.buildStatement({ client: { name: 'X' }, documents: [docs[2], docs[3]] }).lines.length, 0);
}

// ---------------------------------------------------------------------------------------------
// The sidebar's one line
// ---------------------------------------------------------------------------------------------
{
  const asAt = new Date('2026-09-05T00:00:00Z');
  const docs = [
    draft({ status: 'Sent', due: '2026-09-20' }),                       // open, not yet due
    draft({ status: 'Sent', due: '2026-08-20' }),                       // open, past due by date
    draft({ status: 'Overdue', due: '2026-12-01' }),                    // says so itself
    draft({ status: 'Paid', amountPaid: 1236 }),
    draft({ status: 'Draft' }),
  ];
  const ag = lc.aging(docs, asAt);
  eq('three open documents', ag.count, 3);
  eq('owing three balances', ag.outstanding, 3708);
  eq('two of them late', ag.overdueCount, 2);
  eq('owing two balances', ag.overdue, 2472);
  eq('nothing open, nothing owed', lc.aging([docs[3], docs[4]], asAt), { outstanding: 0, overdue: 0, count: 0, overdueCount: 0 });
}

// ---------------------------------------------------------------------------------------------
// The setting
// ---------------------------------------------------------------------------------------------
eq('eight per cent by default', store.sanitise({}).money.lateFeeRate, 8);
eq('a typed rate survives', store.sanitise({ money: { lateFeeRate: 9.5 } }).money.lateFeeRate, 9.5);
eq('nonsense falls back', store.sanitise({ money: { lateFeeRate: 'lots' } }).money.lateFeeRate, 8);
eq('and it is capped', store.sanitise({ money: { lateFeeRate: 900 } }).money.lateFeeRate, 100);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
