import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const n = await import(pathToFileURL(_resolve(ROOT, 'src/money/numbering.js')).href);

let pass = 0, fail = 0;
const eq = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${name}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };

const y2026 = new Date(2026, 2, 4);   // 4 March 2026, local
const y2025 = new Date(2025, 10, 20);
const FMT = { prefix: 'INV-{YYYY}-', suffix: '', padding: 4, start: 1, resetPeriod: 'yearly' };

// ---------------------------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------------------------
eq('the year token', n.renderTokens('INV-{YYYY}-', y2026), 'INV-2026-');
eq('the short year', n.renderTokens('{YY}/', y2026), '26/');
eq('month and day, padded', n.renderTokens('{YYYY}{MM}{DD}', y2026), '20260304');
eq('text with no tokens is left alone', n.renderTokens('INV-', y2026), 'INV-');

eq('a formatted number', n.formatNumber(7, FMT, y2026), 'INV-2026-0007');
eq('padding is respected', n.formatNumber(12345, FMT, y2026), 'INV-2026-12345');
eq('no padding', n.formatNumber(7, { ...FMT, padding: 0 }, y2026), 'INV-2026-7');
eq('a suffix', n.formatNumber(7, { ...FMT, suffix: '/A' }, y2026), 'INV-2026-0007/A');

// ---------------------------------------------------------------------------------------------
// Reading a number back — and the way the period scopes itself
// ---------------------------------------------------------------------------------------------
eq('the sequence comes back out', n.parseSequence('INV-2026-0007', FMT, y2026), 7);
// This is what makes a yearly reset work without a counter stored anywhere: last year's numbers
// simply do not match this year's rendered prefix.
eq('last year’s numbers are not this year’s sequence', n.parseSequence('INV-2025-0099', FMT, y2026), null);
eq('and they are, when read against last year', n.parseSequence('INV-2025-0099', FMT, y2025), 99);
eq('something from another scheme entirely', n.parseSequence('2026/17', FMT, y2026), null);
eq('nothing', n.parseSequence('', FMT, y2026), null);

// ---------------------------------------------------------------------------------------------
// The next one
// ---------------------------------------------------------------------------------------------
const existing = ['INV-2026-0003', 'INV-2026-0011', 'INV-2025-0099', 'not-an-invoice'];
eq('highest plus one', n.nextNumber(existing, FMT, y2026), { sequence: 12, number: 'INV-2026-0012' });
// Why highest-plus-one rather than count-plus-one. Two 2026 invoices exist, numbered 3 and 11 —
// there is a gap, because something was deleted. Counting them and adding one gives 3, which is
// already on a document somebody has received. A gap in the sequence is a question at an audit; a
// duplicate invoice number is a problem.
const seqs = existing.map((v) => n.parseSequence(v, FMT, y2026)).filter((v) => v != null);
eq('there are two, numbered with a gap', seqs, [3, 11]);
eq('counting them would suggest 3', seqs.length + 1, 3);
eq('which is already taken', seqs.includes(3), true);
eq('so the next one is 12, not 3', n.nextNumber(existing, FMT, y2026).sequence, 12);
eq('an empty year starts at the start', n.nextNumber(['INV-2025-0099'], FMT, y2026), { sequence: 1, number: 'INV-2026-0001' });
eq('a custom start', n.nextNumber([], { ...FMT, start: 500 }, y2026).number, 'INV-2026-0500');
eq('the new year restarts the sequence', n.nextNumber(existing, FMT, new Date(2027, 0, 2)).number, 'INV-2027-0001');

// Deleting an invoice does not renumber the others, and it does not always leave the sequence alone:
// the next number is the highest still in the table plus one, so a deleted MIDDLE invoice leaves a
// gap and a deleted NEWEST invoice frees its number for the next. The README and the upgrade text say
// so (cancel instead of deleting), so the rule is pinned here rather than left as a surprise.
const three = ['INV-2026-0001', 'INV-2026-0002', 'INV-2026-0003'];
eq('delete a middle invoice: the next one carries on after the highest', n.nextNumber(['INV-2026-0001', 'INV-2026-0003'], FMT, y2026).sequence, 4);
eq('delete the newest: its number is offered again', n.nextNumber(three.slice(0, 2), FMT, y2026).sequence, 3);
eq('cancel it instead (it stays in the table): the number stays taken', n.nextNumber(three, FMT, y2026).sequence, 4);

// The words that ship must not claim a deletion renumbers the later invoices. It is false (tested in
// Grist on 16 October 2026: later rows keep their ids and so their numbers), and it was in the
// upgrade text, its German version, a hover text, the README and a comment before 1.28.3.
import { readFileSync } from 'node:fs';
for (const file of ['README.md', 'src/model/schema.js', 'src/money/numbering.js', 'src/doc/render.js', 'src/i18n/de.js']) {
  const text = readFileSync(_resolve(ROOT, file), 'utf8');
  eq(file + ' does not say a deletion renumbers later invoices', /renumber(s|ing)? (every|all|the later)|nicht alle späteren neu nummeriert|will change it/i.test(text), false);
}

// ---------------------------------------------------------------------------------------------
// The rule that matters: assign once, and never again
// ---------------------------------------------------------------------------------------------
const held = n.assignNumber('INV-2026-0005', { existingNumbers: existing, format: FMT, date: y2026 });
eq('an invoice that has a number keeps it', held.number, 'INV-2026-0005');
eq('and nothing was assigned', held.assigned, false);
eq('even when it looks out of sequence', n.assignNumber('OLD-1', { existingNumbers: existing, format: FMT }).number, 'OLD-1');
eq('whitespace is not a number', n.assignNumber('   ', { existingNumbers: [], format: FMT, date: y2026 }).assigned, true);

const fresh = n.assignNumber('', { existingNumbers: existing, format: FMT, date: y2026 });
eq('an invoice without one gets the next', fresh.number, 'INV-2026-0012');
eq('and says it assigned it', fresh.assigned, true);
eq('with no complaints about the format', fresh.warnings, []);

// ---------------------------------------------------------------------------------------------
// A format that cannot do what it claims
// ---------------------------------------------------------------------------------------------
eq('a yearly reset with a year token is fine', n.validateFormat(FMT).ok, true);
// Without a year in the number, nothing distinguishes this year's 0001 from last year's, so
// restarting the sequence would produce duplicate invoice numbers.
eq('a yearly reset with no year token cannot work', n.validateFormat({ ...FMT, prefix: 'INV-' }).ok, false);
eq('and says why', n.validateFormat({ ...FMT, prefix: 'INV-' }).problems.length, 1);
eq('a monthly reset needs the month', n.validateFormat({ ...FMT, resetPeriod: 'monthly' }).problems.length, 1);
eq('a monthly reset with both is fine', n.validateFormat({ prefix: 'INV-{YYYY}{MM}-', padding: 3, resetPeriod: 'monthly' }).ok, true);
eq('never resetting needs no tokens at all', n.validateFormat({ prefix: 'INV-', padding: 4, resetPeriod: 'never' }).ok, true);

// A format that cannot honour its reset period still assigns a number — it warns rather than
// refusing, because refusing to number an invoice is worse than numbering it with a caveat.
const warned = n.assignNumber('', { existingNumbers: [], format: { ...FMT, prefix: 'INV-' }, date: y2026 });
eq('a doubtful format still produces a number', warned.number, 'INV-0001');
eq('and carries the warning with it', warned.warnings.length, 1);


// ---------------------------------------------------------------------------------------------
// A number built from the record: the client's ledger account, the reference, an own column
// ---------------------------------------------------------------------------------------------
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${name}`); } };
const V = { reference: 'PO 5087', 'client.Konto': 10001, Konto: '8400' };
eq('a client column in the prefix', n.renderTokens('RE-{YYYY}-{client.Konto}-', y2026, V), 'RE-2026-10001-');
eq('the reference and an own column', n.renderTokens('{Konto}/{reference}/', y2026, V), '8400/PO 5087/');
eq('a figure is its digits', n.renderTokens('{client.Konto}', y2026, { 'client.Konto': 10001 }), '10001');
eq('a token nobody can fill stays as typed', n.renderTokens('RE-{client.Konto}-', y2026, {}), 'RE-{client.Konto}-');
eq('an empty value counts as missing', n.renderTokens('{reference}-', y2026, { reference: '  ' }), '{reference}-');
eq('no values at all is the old behaviour', n.renderTokens('INV-{YYYY}-', y2026), 'INV-2026-');
eq('the missing ones are named, once each', n.unresolvedTokens('RE-{client.Konto}-{YYYY}-{reference}-{client.Konto}', { reference: 'x' }), ['client.Konto']);
eq('date tokens are never missing', n.unresolvedTokens('{YYYY}{MM}{DD}{YY}', {}), []);

// The prefix carries the account, so the sequence runs per account — which is what numbering by
// ledger account means. Last year's and the other account's numbers do not match this prefix.
const KF = { prefix: 'RE-{YYYY}-{client.Konto}-', padding: 3, resetPeriod: 'yearly' };
const perAccount = ['RE-2026-10001-003', 'RE-2026-10002-009', 'RE-2025-10001-044'];
eq('the sequence runs per account', n.nextNumber(perAccount, KF, y2026, { 'client.Konto': 10001 }).number, 'RE-2026-10001-004');
eq('and separately for the other account', n.nextNumber(perAccount, KF, y2026, { 'client.Konto': 10002 }).number, 'RE-2026-10002-010');
eq('a new account starts at the start', n.nextNumber(perAccount, KF, y2026, { 'client.Konto': 10003 }).number, 'RE-2026-10003-001');
eq('a stored number is read back under its own values', n.parseSequence('RE-2026-10001-003', KF, y2026, { 'client.Konto': 10001 }), 3);
eq('and not under another account’s', n.parseSequence('RE-2026-10001-003', KF, y2026, { 'client.Konto': 10002 }), null);

const withClient = n.assignNumber('', { existingNumbers: perAccount, format: KF, date: y2026, values: { 'client.Konto': 10001 } });
eq('assigning with a client fills the account in', withClient.number, 'RE-2026-10001-004');
eq('and complains about nothing', withClient.warnings, []);
const noClient = n.assignNumber('', { existingNumbers: perAccount, format: KF, date: y2026, values: {} });
eq('without a client the token is left in the number, visibly', noClient.number, 'RE-2026-{client.Konto}-001');
ok('and the warning names the column and says what was done', noClient.warnings.length === 1 && /\{client\.Konto\}/.test(noClient.warnings[0]) && /Konto/.test(noClient.warnings[0]) && /left in the number/.test(noClient.warnings[0]));
const noRef = n.assignNumber('', { existingNumbers: [], format: { prefix: '{reference}-', padding: 2, resetPeriod: 'never' }, date: y2026, values: {} });
ok('a missing reference is explained as a reference', /no reference/.test(noRef.warnings[0]));
const noCol = n.assignNumber('', { existingNumbers: [], format: { prefix: '{Konto}-', padding: 2, resetPeriod: 'never' }, date: y2026, values: {} });
ok('a missing own column is explained as one', /called Konto/.test(noCol.warnings[0]));
eq('a held number is still never touched', n.assignNumber('RE-2026-10001-002', { existingNumbers: perAccount, format: KF, date: y2026, values: {} }).number, 'RE-2026-10001-002');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
