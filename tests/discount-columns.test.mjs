// A discount and a shipping charge typed in the composer are kept (1.26.3). The starter tables had no
// column for either: both were dropped on save while the stored Total still counted them, so the
// list said 1,362 and the reopened document said 1,422.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const w = await import(pathToFileURL(_resolve(ROOT, 'src/model/write.js')).href);
const st = await import(pathToFileURL(_resolve(ROOT, 'src/templates/starter.js')).href);
const sc = await import(pathToFileURL(_resolve(ROOT, 'src/model/schema.js')).href);
const mig = await import(pathToFileURL(_resolve(ROOT, 'src/model/migrate.js')).href);

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

for (const empty of [true, false]) {
  const tables = st.starterTablesFor('freelancer', { empty });
  const inv = tables.find((t) => t.id === 'Invoices');
  ok(`starter (${empty ? 'empty' : 'sample'}) has a Discount column`, inv.columns.some((c) => c.id === 'Discount' && c.type === 'Numeric'));
  ok(`starter (${empty ? 'empty' : 'sample'}) has a Shipping column`, inv.columns.some((c) => c.id === 'Shipping' && c.type === 'Numeric'));
  const schema = sc.detectSchema(tables.map(({ id, label, columns }) => ({ id, label, columns })));
  eq('the discount role finds it', schema.invoice.roles.discount, 'Discount');
  eq('the shipping role finds it', schema.invoice.roles.shipping, 'Shipping');

  const draft = {
    rowId: null, number: 'QUO-2026-0001', kind: 'quote', clientRef: 2, issued: '2026-10-14', status: 'Draft',
    totals: { subtotal: 1135, taxTotal: 229.4, total: 1376.4, amountPaid: 0, discountTotal: 50, shipping: { amount: 12 } },
    lines: [{ description: 'Consultancy, day rate', quantity: 2, unitPrice: 550, amount: 1100 }, { description: 'Travel to the client', quantity: 1, unitPrice: 85, amount: 85 }],
  };
  const plan = w.buildWritePlan(draft, schema, { invoiceColumns: inv.columns, lineColumns: tables.find((t) => t.id === 'InvoiceItems').columns, existingLineRows: [] });
  eq('the discount is written', plan.invoice.fields.Discount, 50);
  eq('the shipping is written', plan.invoice.fields.Shipping, 12);
  ok('nothing about them is skipped', !plan.skipped.some((s) => s.role === 'discount' || s.role === 'shipping'));
}

// The migration target (Choose the tables / create what is missing) carries them too
const migInv = mig.STARTER_TABLES.find((t) => t.id === 'Invoices');
ok('the tables created for a fresh document have Discount', migInv.columns.some((c) => c.id === 'Discount' && c.type === 'Numeric'));
ok('and Shipping', migInv.columns.some((c) => c.id === 'Shipping' && c.type === 'Numeric'));

// An older document without the columns is offered them by Upgrade this document
const old = sc.detectSchema([
  { id: 'Invoices', label: 'Invoices', columns: [
    { id: 'InvoiceNumber', type: 'Text' }, { id: 'Client', type: 'Ref:Clients' }, { id: 'Issued', type: 'Date' }, { id: 'Total', type: 'Numeric' }] },
  { id: 'InvoiceItems', label: 'Invoice items', columns: [
    { id: 'Invoice', type: 'Ref:Invoices' }, { id: 'Description', type: 'Text' }, { id: 'Quantity', type: 'Numeric' }, { id: 'Price', type: 'Numeric' }] },
  { id: 'Clients', label: 'Clients', columns: [{ id: 'Name', type: 'Text' }] },
]);
const todo = sc.upgradeChecklist(old).invoice.map((i) => i.id);
ok('Upgrade this document offers Discount', todo.includes('Discount'));
ok('and Shipping', todo.includes('Shipping'));

console.log(`discount-columns: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
