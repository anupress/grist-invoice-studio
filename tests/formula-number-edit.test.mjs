// Editing an invoice whose number a Grist formula works out (1.28.4).
//
// Found by trying the setup a German user described, in a real Grist document: a numbering formula
// that counts per ledger account, and a Reference column to the ledger chosen under "Also in this
// table". Saving worked and the formula recounted, but every EDIT of a saved invoice said "1 field
// on this form cannot be saved" before the save and "Saved — but 1 field could not be kept: number"
// after it. Nothing was lost: the number is the formula's, the composer shows it read-only, and it
// is read back. The warning was noise, and noise in that list is how people learn to ignore it.
//
// What stays: a number typed for a NEW invoice into a formula column is still reported, and every
// other formula column (a due date the template computes) still is.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => import(pathToFileURL(_resolve(ROOT, p)).href);

const W = await load('src/model/write.js');
const { detectSchema } = await load('src/model/schema.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

// ---- a document shaped like the one that was tried --------------------------------------------
const columns = (numberIsFormula, dueIsFormula = false) => ({
  Invoices: [
    { id: 'Number', type: 'Text', isFormula: numberIsFormula },
    { id: 'Client', type: 'Ref:Clients' },
    { id: 'Issued', type: 'Date' },
    { id: 'Due', type: 'Date', isFormula: dueIsFormula },
    { id: 'Status', type: 'Text' },
    { id: 'Ledger', type: 'Ref:Ledger' },
    { id: 'Currency', type: 'Text' },
  ],
  InvoiceItems: [
    { id: 'Invoice', type: 'Ref:Invoices' }, { id: 'Description', type: 'Text' },
    { id: 'Quantity', type: 'Numeric' }, { id: 'Price', type: 'Numeric' }, { id: 'Total', type: 'Numeric' },
  ],
  Clients: [{ id: 'Name', type: 'Text' }, { id: 'Email', type: 'Text' }],
  Ledger: [{ id: 'Account', type: 'Text' }, { id: 'Name', type: 'Text' }],
});

function planFor(draft, { numberIsFormula = true, dueIsFormula = false } = {}) {
  const cols = columns(numberIsFormula, dueIsFormula);
  const tables = Object.entries(cols).map(([id, c]) => ({ id, label: id, columns: c }));
  const schema = detectSchema(tables);
  return {
    schema,
    plan: W.buildWritePlan(draft, schema, { invoiceColumns: cols.Invoices, lineColumns: cols.InvoiceItems, existingLineRows: [] }),
  };
}

const base = {
  clientRef: 1, issued: '2026-10-16', due: '2026-11-15', status: 'Draft', currency: 'EUR',
  extra: { Ledger: 2 },
  totals: { subtotal: 900, taxTotal: 180, total: 1080, amountPaid: 0, discountTotal: 0, shipping: { amount: 0 } },
  lines: [{ description: 'Site survey, half day', quantity: 2, unitPrice: 450, amount: 900 }],
};

{
  const { schema } = planFor({ ...base, rowId: null, number: '' });
  eq('the number is found as the formula column', schema.invoice.roles.number, 'Number');
}

// ---- an invoice that already exists -----------------------------------------------------------
{
  const { plan } = planFor({ ...base, rowId: 4, number: 'RE-4710-001' });
  eq('the formula number is never written', plan.invoice.fields.Number, undefined);
  eq('and is not reported as lost', plan.skipped.some((s) => s.role === 'number'), false);
  eq('nothing at all is reported', plan.skipped, []);
  eq('the ledger chosen under "Also in this table" is written', plan.invoice.fields.Ledger, 2);
  ok('the plan is otherwise whole', plan.ok !== false && plan.problems.length === 0);
  eq('the line stays linked to the invoice by row id', plan.lines.adds[0].Invoice, 4);
}

// ---- a new invoice ----------------------------------------------------------------------------
{
  const { plan } = planFor({ ...base, rowId: null, number: '' });
  eq('a new invoice leaves the number to Grist and says nothing', plan.skipped, []);
  eq('its ledger is written with it', plan.invoice.fields.Ledger, 2);
}
{
  const { plan } = planFor({ ...base, rowId: null, number: 'RE-9999-001' });
  ok('a number typed for a NEW invoice into a formula column is still reported',
    plan.skipped.some((s) => s.role === 'number' && /formula/.test(s.reason)));
  eq('and still not written', plan.invoice.fields.Number, undefined);
}

// ---- only the number is let off ---------------------------------------------------------------
{
  const { plan } = planFor({ ...base, rowId: 4, number: 'RE-4710-001' }, { dueIsFormula: true });
  ok('a due date the document computes is still reported on an edit',
    plan.skipped.some((s) => s.role === 'due' && /formula/.test(s.reason)));
  eq('and it is the only thing reported', plan.skipped.map((s) => s.role), ['due']);
}

// ---- a stored number is untouched by all this -------------------------------------------------
{
  const { plan } = planFor({ ...base, rowId: 4, number: 'RE-4710-001' }, { numberIsFormula: false });
  eq('a stored number on an existing invoice is written as before', plan.invoice.fields.Number, 'RE-4710-001');
  eq('with nothing reported', plan.skipped, []);
}

console.log(`formula-number-edit: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
