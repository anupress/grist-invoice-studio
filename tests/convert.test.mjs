// Make invoice / Make receipt / Make credit note COPY the lines (1.26.4). Before, the converted draft
// kept the original's line row ids, and saving it re-pointed those rows at the new document: a quote
// turned into an invoice was left with no lines.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const d = await import(pathToFileURL(_resolve(ROOT, 'src/model/draft.js')).href);
const w = await import(pathToFileURL(_resolve(ROOT, 'src/model/write.js')).href);
const st = await import(pathToFileURL(_resolve(ROOT, 'src/templates/starter.js')).href);
const sc = await import(pathToFileURL(_resolve(ROOT, 'src/model/schema.js')).href);

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

// A saved quote: its own row, its own line rows
const quote = d.normaliseDraft({
  rowId: 6, number: 'QUO-2026-0001', kind: 'quote', clientRef: 2, status: 'Sent', issued: '2026-10-14',
  sentAt: '2026-10-14', sentTo: 'pay@kingfisherprint.example',
  lines: [
    { rowId: 10, description: 'Consultancy, day rate', quantity: 2, unitPrice: 550 },
    { rowId: 11, description: 'Travel to the client', quantity: 1, unitPrice: 85 },
  ],
});

for (const to of ['invoice', 'proforma']) {
  const inv = d.convertDraft(quote, to, { relatedTo: 'Quote QUO-2026-0001' });
  eq(`${to}: a new row`, inv.rowId, null);
  eq(`${to}: the lines are the quote's`, inv.lines.map((l) => [l.description, l.quantity, l.unitPrice]), [['Consultancy, day rate', 2, 550], ['Travel to the client', 1, 85]]);
  ok(`${to}: but none of the quote's line rows`, inv.lines.every((l) => l.rowId == null));
  eq(`${to}: not sent yet`, [inv.sentAt, inv.sentTo], ['', '']);
  eq(`${to}: names the quote`, inv.relatedTo, 'Quote QUO-2026-0001');

  // Saving it adds two line rows and touches none of the quote's
  const tables = st.starterTablesFor('freelancer', { empty: true });
  const schema = sc.detectSchema(tables.map(({ id, label, columns }) => ({ id, label, columns })));
  const plan = w.buildWritePlan({ ...inv, totals: inv.totals || {} }, schema, {
    invoiceColumns: tables.find((t) => t.id === 'Invoices').columns,
    lineColumns: tables.find((t) => t.id === 'InvoiceItems').columns,
    existingLineRows: [],
  });
  const lp = plan.lines || {};
  eq(`${to}: save adds both lines`, (lp.adds || lp.add || []).length, 2);
  eq(`${to}: and updates none`, (lp.updates || lp.update || []).length, 0);
  eq(`${to}: and removes none`, (lp.removes || lp.remove || []).length, 0);
}

// The same for the invoice's own conversions
const invoice = d.normaliseDraft({ rowId: 7, number: 'INV-2026-0006', kind: 'invoice', clientRef: 2, status: 'Sent',
  lines: [{ rowId: 12, description: 'Consultancy, day rate', quantity: 2, unitPrice: 550 }] });
for (const to of ['receipt', 'credit_note']) {
  const out = d.convertDraft(invoice, to, { relatedTo: 'Invoice INV-2026-0006' });
  ok(`${to}: the invoice's line rows stay the invoice's`, out.lines.every((l) => l.rowId == null));
  eq(`${to}: and its lines are copied`, out.lines.length, 1);
}
ok('the original draft is not changed by converting it', quote.lines.every((l) => l.rowId != null));

console.log(`convert: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
