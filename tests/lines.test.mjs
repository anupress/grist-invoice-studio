import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const grid = await import(pathToFileURL(_resolve(ROOT, 'src/compose/lines-grid.js')).href);

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

const L = (description, quantity, unitPrice, extra = {}) => ({
  description, quantity, unitPrice, amount: quantity * unitPrice, taxClass: '', hsn: '', unit: '', ...extra,
});

// ---------------------------------------------------------------------------------------------
// Choosing something the document already bills adds to its line
// ---------------------------------------------------------------------------------------------
{
  // The case from the screenshot: a throw at 68, then the same throw picked onto a fresh line.
  const draft = { lines: [L('Wool throw, sage', 2, 68), L('', 1, 0)] };
  const res = grid.mergeIntoExisting(draft, 1, 'Wool throw, sage', 68);
  ok('it merges', res && res.merged);
  eq('into one line', draft.lines.length, 1);
  eq('with the quantities added', draft.lines[0].quantity, 3);
  eq('and the amount recomputed', draft.lines[0].amount, 204);
  eq('the caller is told the new quantity', res.quantity, 3);
}
{
  // The blank line's own quantity is what is added, not always one.
  const draft = { lines: [L('Consultation', 1, 550), L('', 4, 0)] };
  grid.mergeIntoExisting(draft, 1, 'Consultation', 550);
  eq('four more makes five', draft.lines[0].quantity, 5);
}
{
  // Matching is on the name as a person reads it, not as they typed it.
  const draft = { lines: [L('Set lunch', 2, 18.5), L('', 1, 0)] };
  ok('case and spacing do not matter', grid.mergeIntoExisting(draft, 1, '  SET LUNCH ', 18.5).merged);
  eq('and the first line keeps its own spelling', draft.lines[0].description, 'Set lunch');
}
{
  // A price that disagrees is a real second line: a discounted unit, a different rate.
  const draft = { lines: [L('Labour', 3, 280), L('', 1, 0)] };
  const res = grid.mergeIntoExisting(draft, 1, 'Labour', 240);
  eq('two prices are not merged', [res.blocked, res.price, draft.lines.length], [true, 280, 2]);
}
{
  const draft = { lines: [L('Site survey', 1, 320), L('', 1, 0)] };
  eq('something new merges with nothing', grid.mergeIntoExisting(draft, 1, 'Electrical certification', 210), null);
  eq('and the lines are untouched', draft.lines.length, 2);
  eq('a line never merges with itself', grid.mergeIntoExisting(draft, 0, 'Site survey', 320), null);
}
{
  // Merging the only other line must not leave the grid with nothing to type into.
  const draft = { lines: [L('Coffee', 1, 3.2), L('Coffee', 1, 3.2)] };
  grid.mergeIntoExisting(draft, 1, 'Coffee', 3.2);
  eq('one line remains', draft.lines.length, 1);
  eq('carrying both', draft.lines[0].quantity, 2);
}
{
  // Pence, not floats: 18.50 and 18.5 are the same price.
  const draft = { lines: [L('Set lunch', 1, 18.5), L('', 1, 0)] };
  ok('the price is compared in whole pence', grid.mergeIntoExisting(draft, 1, 'Set lunch', 18.50).merged);
}

// ---------------------------------------------------------------------------------------------
// A document that already has duplicates
// ---------------------------------------------------------------------------------------------
{
  const draft = { lines: [L('Wool throw, sage', 2, 68), L('Tracked delivery', 1, 4.95), L('Wool throw, sage', 1, 68)] };
  eq('the later line is the duplicate', grid.duplicateLines(draft), [2]);
  const merged = grid.combineDuplicates(draft);
  eq('one line was folded in', merged, 1);
  eq('two lines remain, in their original order', draft.lines.map((l) => l.description), ['Wool throw, sage', 'Tracked delivery']);
  eq('with the quantities added', draft.lines[0].quantity, 3);
  eq('and the amount right', draft.lines[0].amount, 204);
  eq('nothing left to combine', grid.duplicateLines(draft), []);
}
{
  // The first line is the one kept, so a saved row is updated rather than both being rewritten.
  const draft = { lines: [L('Coffee', 1, 3.2, { rowId: 11 }), L('Coffee', 2, 3.2, { rowId: 12 })] };
  grid.combineDuplicates(draft);
  eq('the first row survives', draft.lines[0].rowId, 11);
  eq('holding the whole quantity', draft.lines[0].quantity, 3);
}
{
  const draft = { lines: [L('Labour', 1, 280), L('Labour', 1, 240)] };
  eq('different prices are not duplicates', grid.duplicateLines(draft), []);
  eq('and are left alone', grid.combineDuplicates(draft), 0);
}
{
  const draft = { lines: [L('', 1, 0), L('', 1, 0)] };
  eq('empty lines are not duplicates of each other', grid.duplicateLines(draft), []);
  grid.combineDuplicates(draft);
  eq('and both are kept, because they are what you type into', draft.lines.length, 2);
}
{
  const draft = { lines: [L('A', 1, 10), L('A', 1, 10), L('A', 2, 10)] };
  eq('three of the same fold into one', grid.combineDuplicates(draft), 2);
  eq('carrying all of it', draft.lines[0].quantity, 4);
}
{
  const draft = { lines: [] };
  grid.combineDuplicates(draft);
  eq('an empty document gets a line to type into', draft.lines.length, 1);
  eq('a blank one', draft.lines[0].description, '');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
