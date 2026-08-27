# Changelog

## 1.3.0

### Branding

- A logo can now be uploaded in Settings, under Your business. It is scaled down on the way in and
  stored inside the document as a data URI, so it needs no hosting and travels with the document.
  It appears at the top of every layout, in the email body, and in the downloaded PDF.
- The PDF writer learned to embed JPEG images. Uploaded logos keep a flattened JPEG copy for this;
  a PNG stays PNG on screen so transparency survives. Greyscale JPEGs are declared as greyscale,
  CMYK is refused rather than embedded inverted.
- Only well-formed PNG or JPEG data URIs are ever stored or rendered. An external URL, an SVG, or
  anything else found in the stored settings is dropped, because the logo is replayed into every
  document, email and PDF these settings produce.
- On the banded and letterhead layouts the logo sits on a white plate, so it reads the same
  whether it was transparent or flattened.

### Settings, not per-invoice

- The tax regime chooser in the top bar is now demo-only. On a connected document it silently
  overwrote the saved tax settings with sample ones; tax is set up once, in Settings.
- A connected document with no business details shows where they come from: the From block, the
  logo and the tax setup are all Settings, entered once, not typed on each invoice.
- Enable editing now goes through the same access check as everything else, and reloads the
  saved settings once access is granted.

## 1.2.1

### Access

- The widget now asks Grist for full access, and checks whether it was given. It never did either.
  The shared core connects at `read table` and nothing escalated from there, so every write path was
  refused against a live document: saving an invoice, upgrading a document, the outbox, and creating
  tables.
- Below full access Grist refuses to list the document's tables, and the core reports that refusal
  as an empty list. A document full of invoices therefore read as empty, and the widget offered to
  build the tables it already had. It now tells you access is missing, says which Grist control
  grants it, and offers to check again.
- The table list is re-read after access is granted, before any table is created, so a document
  cannot end up with a second `Clients` beside the one it already had.
- `grist.ready()` resolves whether or not the user allows what it asked for, so the recorded access
  level states the request rather than the answer. Write guards now establish the answer by trying
  something that needs it, once per session.

## 1.2.0

### Setting up an empty document

- A document with no invoice tables in it now offers to build them rather than only reporting that
  it found nothing. It creates `Clients`, `Products`, `Invoices` and `InvoiceItems` with four sample
  invoices: one overdue, one paid, one sent, one still a draft. A table that already exists is
  skipped, never overwritten.
- The trade picked at that point sets the line items, the catalogue, the wording, the numbering
  prefix, the layout, the document kind and the tax settings, so a builder gets labour and materials
  and a shop gets a till receipt.
- The sample data is invented. No real business, person or address appears in it.
- The amount paid on the settled sample invoice is the tax-inclusive figure, so it renders as
  settled rather than short by exactly the VAT.
- Reference columns, dates and the choice list survive creation. The attachments column is added
  after the table rather than inside the atomic create, because a type Grist refuses inside that
  bundle would silently retry the whole table as plain text.

## 1.1.0

First public release. Versions below 1.1.0 were development builds and were never published.

### Reading a document

- Recognises Grist's Invoicing template by column signature, so a renamed table still matches, and
  supports the column vocabulary that template's own widget accepts.
- Falls back to matching column names for any other document, and reports what it could not place.
- Detects a product catalogue for the line-item picker.
- `Upgrade this document` adds the columns the Grist template lacks: status, paid date, amount paid,
  currency, terms, reference, a stored invoice number, an attachment column, and an email column on
  clients. It only adds, copies existing invoice numbers into the new stored column, and is
  idempotent.

### Money

- Rounding modes: half up, half to even, up, down. Rounding per line or once at the subtotal.
- Tax by rate table: country, state, postcode and city, resolved by priority, with compound rates,
  tax classes and a per-row flag for shipping. Or a single rate entered by hand, or none.
- Presets for the EU (27 states, standard and reduced, under local names), 30 further countries,
  India GST, Canada including Quebec's compound QST, the UK, Australia, the UAE, Singapore and
  South Africa. A per-document override accepts a fixed tax amount.
- Tax-inclusive pricing preserves the advertised total exactly.
- Shipping zones and methods, with WooCommerce's cost syntax including `[qty]` and `[fee]`. The
  formula parser is hand-written; `eval` is not used.
- Order and line discounts, sequential or against the original price. Fixed amounts are apportioned
  across lines so each line's taxable base falls correctly.
- Invoice numbers are assigned once and stored, never recomputed, with a separate sequence per
  document kind.

### Documents

- Eight kinds: quote, proforma, invoice, receipt, credit note, statement, delivery note, packing
  slip. Delivery notes and packing slips show no prices.
- Four layouts. Field visibility is derived from the tax regime and the data rather than configured,
  so HSN codes and tax registration numbers appear when they are required.
- Paper: A4, US Letter, US Legal, A5, 80mm and 58mm till rolls. Three densities. Applies to both the
  PDF and browser printing.
- PDF writer included in the repository. Standard fonts only, so no font data is embedded and an
  invoice is around 6KB. WinAnsi coverage; symbols outside it are transliterated.

### Composing and sending

- Composer with a client picker, line grid, product picker, live totals and a live document preview.
- Writes are planned before they are performed. Formula columns are never written to, values that do
  not fit a column's type are refused rather than coerced, and anything that cannot be saved is
  listed before saving.
- Message templates per event, with the appropriate one selected from the document's state.
- Four send routes: mail client, clipboard, Grist outbox, and a direct POST. The invoice can be
  included in the email body as table-based HTML that survives Outlook and Gmail.
- `recipes/` contains a Cloudflare Worker, a Node SMTP relay, and setup notes for n8n, Make, Zapier
  and Grist.

### Settings and templates

- Business details, currency and number formatting, tax, numbering, document appearance and sending,
  stored in the user's own document under a key that does not collide with Advanced Charts.
- Fourteen trade templates. None of them modify the business name or address.
- Optional stock decrement: off by default, applied once per document, and refused if it would take
  a product below zero.

### Development

- `src/core/` is synced from Advanced Charts and verified in CI. Hashes are taken over
  line-ending-normalised content, so the check reports edits rather than checkout differences.
- 13 test suites, no framework.
