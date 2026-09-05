// CSV files for bringing data into the four tables by Grist's own importer.
//
// Two of each: a sample filled with one trade's starter business, and a blank with the headers
// alone. The headers are the column ids the widget creates, so a file imported into a table the
// widget set up maps column for column with nothing to match by hand; a table of somebody's own
// maps by name in Grist's import dialog, which is what it is for. References travel as text —
// the client's name, the invoice's number — because that is what a spreadsheet holds, and the
// widget resolves both.
//
//   node scripts/export-import-csv.mjs            writes docs/import/*.csv, README.md and the zip of them all
//
// Everything in the sample is invented: see src/templates/samples.js.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import zlib from 'node:zlib';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const OUT = path.join(REPO, 'docs', 'import');
const { starterTablesFor } = await import(pathToFileURL(path.join(REPO, 'src/templates/starter.js')).href);

const cell = (v) => {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const csv = (headers, rows) => [headers.join(','), ...rows.map((r) => headers.map((h) => cell(r[h])).join(','))].join('\r\n') + '\r\n';

const tables = starterTablesFor('construction', { numberPrefix: 'INV-', grossOf: ({ lines }) => lines.reduce((a, l) => a + l.quantity * l.unitPrice, 0) * 1.2 });
const byId = Object.fromEntries(tables.map((t) => [t.id, t]));
const clientName = (n) => byId.Clients.records[n - 1]?.Name || '';
const invoiceNumber = (n) => byId.Invoices.records[n - 1]?.InvoiceNumber || '';

const FILES = {
  clients: {
    headers: byId.Clients.columns.map((c) => c.id),
    rows: byId.Clients.records,
  },
  products: {
    // No picture column: a CSV cannot carry one. Drop a photo onto the item in the widget afterwards.
    headers: byId.Products.columns.filter((c) => c.id !== 'Image').map((c) => c.id),
    rows: byId.Products.records,
  },
  invoices: {
    headers: byId.Invoices.columns.filter((c) => c.id !== 'Document').map((c) => c.id),
    rows: byId.Invoices.records.map((r) => ({ ...r, Client: clientName(r.Client) })),
  },
  'invoice-items': {
    headers: byId.InvoiceItems.columns.map((c) => c.id),
    rows: byId.InvoiceItems.records.map((r) => ({ ...r, Invoice: invoiceNumber(r.Invoice) })),
  },
};

fs.mkdirSync(OUT, { recursive: true });
for (const [name, f] of Object.entries(FILES)) {
  fs.writeFileSync(path.join(OUT, `${name}-sample.csv`), csv(f.headers, f.rows));
  fs.writeFileSync(path.join(OUT, `${name}-blank.csv`), csv(f.headers, []));
  console.log(`${name}: ${f.rows.length} rows, ${f.headers.length} columns`);
}

fs.writeFileSync(path.join(OUT, 'README.md'), `# Importing your data

Four CSV files, one per table the widget uses. Each comes twice: \`*-sample.csv\` filled with the
construction trade's starter business (every name and address invented), and \`*-blank.csv\` with
the headers alone for your own data. \`invoice-studio-import-csv.zip\` is all of them in one download.

| File | Table | What each row is |
|---|---|---|
| clients | Clients | One client: name, contact, address, tax number, language |
| products | Products | One catalogue item: SKU, name, price, unit, stock, tax class |
| invoices | Invoices | One document: number, client (by name), dates, status, kind, totals |
| invoice-items | InvoiceItems | One line: the invoice it belongs to (by number), description, quantity, price |

## In Grist

1. Open your document and choose **Add New → Import from file**.
2. Pick a file. Grist shows a preview with a destination: choose **the existing table** of that
   name to add rows to it, or a new table if you are starting from the CSV alone.
3. Grist matches columns by name. The headers are the widget's column ids, so a table the widget
   set up matches column for column; in a table of your own, pick the matching column for each.
4. Import. Then press **Refresh** in the widget.

## What the widget does with references

- \`Client\` in the invoices file is the client's **name**. The widget matches it to the Clients
  table by name, and keeps working if the column is a reference instead.
- \`Invoice\` in the items file is the invoice **number**. The widget matches lines to their
  invoice by number as text, or by row reference where the column is one.
- Dates are \`YYYY-MM-DD\`. \`Kind\` is the document's word: Invoice, Quote, Credit note, Receipt.
- Pictures cannot travel in a CSV. Drop a photo onto the item in the widget's Catalogue list.

## A spreadsheet from another tool

Export clients, items and invoices from the old tool as CSV, open each in a spreadsheet, and
rename its headers to the ones in the blank files. Columns the old tool did not have can stay
empty; columns it had that these files lack can be kept — the widget shows every column of a
table on its forms and only reads the ones it knows.
`);
// A zip of the whole kit, so a web page can offer one download instead of eight files that a
// browser would rather display than save. Plain zip: local headers, deflate, a central directory.
function zipFiles(entries) {
  const crcTable = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c; }
  const crc32 = (buf) => { let c = -1; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const dosTime = (d) => ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
  const dosDate = (d) => (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
  const now = new Date();
  const locals = [], centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(8, 8);
    head.writeUInt16LE(dosTime(now), 10); head.writeUInt16LE(dosDate(now), 12); head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(deflated.length, 18); head.writeUInt32LE(data.length, 22); head.writeUInt16LE(nameBuf.length, 26); head.writeUInt16LE(0, 28);
    locals.push(head, nameBuf, deflated);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(8, 10);
    cen.writeUInt16LE(dosTime(now), 12); cen.writeUInt16LE(dosDate(now), 14); cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(deflated.length, 20); cen.writeUInt32LE(data.length, 24); cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt16LE(0, 30); cen.writeUInt16LE(0, 32); cen.writeUInt16LE(0, 34); cen.writeUInt16LE(0, 36); cen.writeUInt32LE(0, 38); cen.writeUInt32LE(offset, 42);
    centrals.push(cen, nameBuf);
    offset += head.length + nameBuf.length + deflated.length;
  }
  const cenSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cenSize, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, ...centrals, end]);
}

const ZIP = 'invoice-studio-import-csv.zip';
const kit = fs.readdirSync(OUT).filter((f) => f.endsWith('.csv') || f === 'README.md').sort()
  .map((name) => ({ name, data: fs.readFileSync(path.join(OUT, name)) }));
fs.writeFileSync(path.join(OUT, ZIP), zipFiles(kit));
console.log(`${ZIP}: ${kit.length} files`);
console.log('wrote', OUT);
