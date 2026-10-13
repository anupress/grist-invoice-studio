// The invoice list's order and filters — model/listing.js.
//
// Four thousand imported invoices put the one just created at the bottom of the list, after the
// oldest row of 2019. Newest first is the order a billing tool is read in; the rest are the
// orders somebody asks for by name.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const L = await import(pathToFileURL(_resolve(ROOT, 'src/model/listing.js')).href);

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

const rows = [
  { id: 1, created: 1, number: 'INV-2024-0001', client: 'Zed Ltd', issued: '2024-03-01', status: 'Paid', total: 100 },
  { id: 2, created: 2, number: 'INV-2025-0002', client: 'Alpha GmbH', issued: '2025-06-10', status: 'Sent', total: 2500 },
  { id: 3, created: 3, number: 'INV-2025-0010', client: 'Beta AG', issued: '2025-01-15', status: 'Overdue', total: 75.5 },
  { id: 4, created: 4, number: 'INV-2026-0003', client: 'alpha gmbh', issued: '2026-02-01', status: 'Draft', total: null },
  { id: 5, created: 5, number: 'INV-2026-0002', client: 'Gamma', issued: '', status: 'paid', total: 10 },
];
const ids = (list) => list.map((r) => r.id);

// ---------------------------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------------------------
eq('the default is newest first', L.DEFAULT_SORT, 'newest');
ok('every order is listed with a label', L.SORTS.every((s) => L.isSort(s.id) && typeof s.label === 'string' && s.label.length > 3));
ok('and nonsense is not one', !L.isSort('sideways') && !L.isSort(null));

eq('newest first, by issue date, undated last', ids(L.sortInvoices(rows, 'newest')), [4, 2, 3, 1, 5]);
eq('oldest first, undated still last', ids(L.sortInvoices(rows, 'oldest')), [1, 3, 2, 4, 5]);
eq('last created first is the row order, backwards', ids(L.sortInvoices(rows, 'created')), [5, 4, 3, 2, 1]);
// 0010 is ten, not "one-zero" after "one": numbers inside a number compare as numbers.
eq('highest number first, numerically', ids(L.sortInvoices(rows, 'number')), [4, 5, 3, 2, 1]);
eq('client A to Z, case-blind, newest first within a client', ids(L.sortInvoices(rows, 'client')), [4, 2, 3, 5, 1]);
eq('largest amount first, no amount last', ids(L.sortInvoices(rows, 'amount')), [2, 1, 3, 5, 4]);
eq('as in the table', ids(L.sortInvoices(rows, 'table')), [1, 2, 3, 4, 5]);
eq('an unknown order is the default', ids(L.sortInvoices(rows, 'sideways')), ids(L.sortInvoices(rows, L.DEFAULT_SORT)));
ok('the list handed in is left alone', ids(rows).join() === '1,2,3,4,5');
eq('an empty list sorts to an empty list', L.sortInvoices([], 'newest'), []);
eq('and so does nothing', L.sortInvoices(null, 'newest'), []);
// Two rows on one day: the later row first, which is what "newest" means between them.
eq('the same day: the later row first', ids(L.sortInvoices([{ id: 1, created: 1, issued: '2026-01-01' }, { id: 2, created: 2, issued: '2026-01-01' }], 'newest')), [2, 1]);
eq('an epoch date sorts with the day strings', ids(L.sortInvoices([{ id: 1, issued: '2026-01-01' }, { id: 2, issued: Date.UTC(2026, 5, 1) / 1000 }], 'newest')), [2, 1]);

// ---------------------------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------------------------
eq('the search matches the client', ids(L.filterInvoices(rows, { query: 'alpha' })), [2, 4]);
eq('and the number', ids(L.filterInvoices(rows, { query: '0010' })), [3]);
eq('the status is matched whole and case-blind', ids(L.filterInvoices(rows, { status: 'PAID' })), [1, 5]);
eq('the year reads the issue date', ids(L.filterInvoices(rows, { year: '2025' })), [2, 3]);
eq('all three together', ids(L.filterInvoices(rows, { query: 'inv', year: '2026', status: 'draft' })), [4]);
eq('nothing asked, nothing removed', L.filterInvoices(rows, {}).length, 5);
eq('nothing asked at all', L.filterInvoices(rows).length, 5);
eq('an empty year is no filter', ids(L.filterInvoices(rows, { year: '' })).length, 5);

eq('the years, newest first, undated rows adding none', L.yearsOf(rows), ['2026', '2025', '2024']);
eq('no rows, no years', L.yearsOf([]), []);

// ---------------------------------------------------------------------------------------------
// Dates, however a row holds them
// ---------------------------------------------------------------------------------------------
eq('a day string is itself', L.dayOf('2026-01-02'), '2026-01-02');
eq('a timestamp string keeps its day', L.dayOf('2026-01-02T10:00:00'), '2026-01-02');
eq('epoch seconds are a day', L.dayOf(Date.UTC(2026, 0, 2) / 1000), '2026-01-02');
eq('milliseconds too', L.dayOf(Date.UTC(2026, 0, 2)), '2026-01-02');
eq('digits in a string as well', L.dayOf(String(Date.UTC(2026, 0, 2) / 1000)), '2026-01-02');
eq('nonsense is nothing', L.dayOf('soon'), '');
eq('and so is nothing', L.dayOf(null), '');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
