# Importing your data

Four CSV files, one per table the widget uses. Each comes twice: `*-sample.csv` filled with the
construction trade's starter business (every name and address invented), and `*-blank.csv` with
the headers alone for your own data.

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

- `Client` in the invoices file is the client's **name**. The widget matches it to the Clients
  table by name, and keeps working if the column is a reference instead.
- `Invoice` in the items file is the invoice **number**. The widget matches lines to their
  invoice by number as text, or by row reference where the column is one.
- Dates are `YYYY-MM-DD`. `Kind` is the document's word: Invoice, Quote, Credit note, Receipt.
- Pictures cannot travel in a CSV. Drop a photo onto the item in the widget's Catalogue list.

## A spreadsheet from another tool

Export clients, items and invoices from the old tool as CSV, open each in a spreadsheet, and
rename its headers to the ones in the blank files. Columns the old tool did not have can stay
empty; columns it had that these files lack can be kept — the widget shows every column of a
table on its forms and only reads the ones it knows.
