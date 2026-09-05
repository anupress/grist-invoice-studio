# Invoice Studio

[![License: MIT](https://img.shields.io/badge/License-MIT-2563EB.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.25.0-0F1B2D.svg)](CHANGELOG.md)

A Grist custom widget for creating, rendering and sending invoices from tables you already keep.
It runs entirely in the viewer's browser. There is no server and no third-party service.

## What it does

- Reads an existing Grist document and maps its columns to invoice fields. Grist's own Invoicing
  template needs no configuration at all.
- Creates and edits invoices, quotes, proformas, receipts, credit notes, statements, delivery notes
  and packing slips, and writes them back as rows.
- Calculates tax from a rate table, or from a single rate you enter; works out the EU reverse
  charge and prints the small-business exemption sentence your country expects.
- Writes the document in English, German, French, Spanish, Italian, Dutch, Polish or Portuguese,
  per client.
- Produces a PDF, a self-contained HTML file, or an email body, with a SEPA, UPI or payment-link
  QR code the client scans to pay.
- Sends through your mail client, the clipboard, a Grist webhook, or a POST to an endpoint of yours.

## Use it in Grist

1. Add a widget and choose **Custom**.
2. Paste `https://anupress.github.io/grist-invoice-studio/` into Enter Custom URL.
3. Set **Access** to **Full document access** in the creator panel on the right.

Step 3 is not optional. Invoice Studio reads four tables at once — invoices, their line items, your
clients and your product catalogue — and writes rows back to them. Below full access Grist refuses
to list the document's tables at all, and an unreadable document is indistinguishable from an empty
one, so the widget says so rather than reporting that you have no invoices.

Try it on a copy of your document first. Everything the widget writes is additive — rows it
creates, columns it adds, never a rename or a removal — but a copy costs nothing and a mistake in
a billing table does.

**Self-hosted Grist** can offer Invoice Studio and Advanced Charts in its Custom widget picker,
with nothing to paste: start Grist with `GRIST_WIDGET_LIST_URL` set to
`https://anupress.github.io/grist-invoice-studio/manifest.json`. The variable takes one URL and
replaces Grist's own list, so an installation that wants both copies the two entries into a list
of its own. [docs/gallery.md](docs/gallery.md) has the entries and the other places the widgets
can be listed.

## An empty document

Point it at a document with no invoice tables and it offers to build them: `Clients`, `Products`,
`Invoices` and `InvoiceItems`, filled with a complete sample business for the trade you pick — a
name and address (ANUPRESS Café, ANUPRESS Works, ANUPRESS Legal…), three or four clients, a
catalogue of what that trade sells, and five documents in five states: overdue, paid, part paid,
sent and draft. A builder gets labour and materials with job references; a café gets lunches and a
catering account; four trades have a client abroad whose documents come out in their language.
The wording, numbering, layout and tax settings come from the trade too.

The sample business is used only when the settings hold no business of your own, and the widget
keeps pointing at Settings → Business until it is replaced. When you are ready for your own data,
Data → "Remove the sample rows" deletes exactly the rows setup created — never a row you added,
never a table or a column. A table that already exists is never touched by setup either.

The chooser names trades, not documents — Retail shop, Online shop, Charity or nonprofit — and a
line under it says what the choice decides: the document it opens with, the layout, whether
prices include tax, how the numbers run. The sample document below the notice is drawn with those
settings and redrawn as the choice changes, so the preview is the explanation. An online shop
starts with invoices; its packing slips are made from them with Convert and numbered on their own.

Every trade's starter document can be seen without a Grist document: add `?trade=restaurant` (or
any trade id from `src/templates/index.js`) to the widget URL and the demo builds it in memory.

All sample data is invented. The businesses carry the ANUPRESS name so a screenshot says who made
the widget; the clients, addresses, phone numbers and tax numbers are fictional and the email
domains are reserved for examples.

If you already keep invoices in tables of your own, the Data drawer lets you point each part —
invoices, line items, clients, catalogue — at the table you use, and then, under each table, pin
any role to any column: a table whose client column is called *Kunde* and whose price is *Preis*
works exactly as well once it is described there. Detection is only a guess, and a choice always
beats it. A document that has invoices but no client or catalogue table can have one created,
empty, from the same drawer.

## Clients and the catalogue

The left column holds three lists — Invoices, Clients, Catalogue — and clients and catalogue items
are added and edited there, in the body, with a live preview of how the client's address block or
the item's thumbnail and price will print. A catalogue item takes a picture by drag-and-drop; on a
live document it is uploaded as a Grist attachment, in the demo it is kept in memory. Fields the
table has no column for are shown greyed with the reason, never hidden.

Every column the table has appears on the form, not only the ones the widget uses: a catalogue
with Colour, Size or Supplier gets those boxes too, with the right control for each. Where a field
has no column at all — a catalogue with nowhere to put a picture, a client table with no email —
one press adds it, and nothing else in the table changes.

Choosing something the document already bills adds to that line rather than starting a second one
— the quantity column is what a repeated item is for. The price has to agree: the same product at
two prices is a real document, so those stay apart and the widget says why. A document that
already carries duplicates, typed in the table next door, is offered a single press to combine
them.

Two shortcuts keep you on the invoice: the client picker ends with "+ New client…", which opens
the same form inline and selects the new client on save; and every line carries a star that adds
it to the catalogue, priced as it was typed. Most catalogues get built that way, one invoice at a
time.

## Grist's Invoicing template

[Grist's Invoicing template](https://www.getgrist.com/templates/invoicing-template/) is recognised by
column signature, so a renamed table still matches. The column vocabulary its own widget accepts
(`Number`, `Client`, `Items`, `Invoicer`, `Issued`, `Due`, `Subtotal`, `Taxes`, `Deduction`, `Total`,
`Note`, `Paid`) is supported, so swapping the widget URL is the whole migration.

That template has limits worth knowing about before you rely on it:

| Column | Behaviour |
|---|---|
| `Number` | A formula, `$id + 51371`. Deleting an invoice renumbers every later one. |
| `Invoicer` | A hardcoded dict inside a formula. Changing your address means editing code. |
| `Total` | Text, and empty on every row. The real total is in an auto-summary table. |
| `Businesses` | No email column, so nothing can be sent. |
| Currency | The widget hardcodes USD. |
| Status | Absent, along with a paid date. |

**Upgrade this document** adds the missing columns. It only adds: nothing is renamed, retyped or
removed. Existing invoice numbers are copied into the new stored column, and running it again does
nothing. Columns are added the way Grist's own "+" button adds them, so they appear on the page
that shows the table, not only in its raw data.

Versions before 1.20.1 added them to the raw data only, which left the catalogue's Image column
holding every picture and rendering them on every invoice while the Products page showed no such
column. The Data drawer now lists any of the widget's columns that are in a table but hidden on
its page, with one button that puts them there — a field at the right-hand end of the page, and
nothing changed in the table.

## Your business, once

Everything a business decides once lives in Settings, saved into the Grist document itself: who the
invoice is from — name, address, email, tax number — the logo, the accent colour, the layout, the
paper size, how numbers run, the payment wording, and how tax works. None of it is typed on an
invoice.

Line items can carry pictures: add an Image column (Attachments, a URL, or a data URI) to your line-item or product table and a thumbnail appears beside each description. Lines without their own picture borrow the catalogue's, matched by product name. A document with no pictures looks exactly as it always has — the column only exists when there is something to put in it.

The logo is uploaded in Settings and stored inside the document as a scaled-down data URI, so
nothing is hosted anywhere. It appears on every layout, in the email body, and in the downloaded
PDF. Only PNG and JPEG survive storage; anything else is dropped rather than rendered.

## Languages

The document's own words — Invoice, Due, Subtotal, the legends, the reverse-charge sentence — are
written in the client's language: English, German, French, Spanish, Italian, Dutch, Polish or
Portuguese. The language comes from the document itself if one was chosen for it, else from a
`Language` column on the client record, else from Settings → Document. Dates follow the language
("28. Aug. 2026", "28 août 2026"). What you type — notes, terms, payment details, the covering
email — is never translated; Settings → Messages is where a German-speaking business writes its
German.

## Getting paid

Settings → Money & tax → Getting paid takes an IBAN and BIC, a UPI id, or a payment link. A euro
document with an IBAN then carries the EPC "GiroCode" that European banking apps scan to pre-fill a
SEPA transfer with the amount and the invoice number; a rupee document with a UPI id carries a UPI
code; a payment link serves any currency. The code is drawn on screen and in the PDF, and the
account lines are printed beside it, in the email and in the plain text. It appears only on
documents that ask for money, and only while something is owed.

## The month after

- **Repeat a document.** On any saved invoice, choose Next week, month, quarter or year and press
  Raise it: a new draft with every date moved on by the period, the lines copied, nothing paid.
  Rent billed on the 31st is billed on the 28th in February and the 31st again in March.
- **Interest on a late payment.** On an overdue invoice, Add interest puts a line on it for the
  days since the due date, at the yearly rate in Settings → Getting paid, on the balance still
  owed. The rate is yours to set, because the law sets it differently everywhere.
- **A statement of account.** From any client's record, Draw up a statement: every open document
  for that client on one page, oldest first, with a running balance and the closing balance owed.
  It prints, exports and emails like any other document and is never saved, because it is a view
  of the ledger rather than an entry in it.
- **What is owed, at a glance.** Above the invoice list: the total still open, and how much of it
  is past its due date.

## Bringing data in

`docs/import/` holds a CSV per table — clients, products, invoices, invoice items — each as a
filled sample and as a blank with the headers alone, plus a zip of the lot for one download.
Grist's own Import from file adds the rows
to a table and matches columns by name; the headers are the widget's column ids, so a table the
widget set up matches column for column. The README there walks through it, and through moving
a spreadsheet from another tool.

## Issued documents

Once a saved document's status has moved past Draft it opens read-only, because in most of Europe
an issued invoice may not be altered. The composer says so and offers the three things to do
instead: make a credit note, which names the invoice it reverses; duplicate as a new document; or
edit anyway. Settings → Document turns the lock off.

## Electronic invoices

Germany, France, Belgium, Poland and the Nordics are moving to structured invoices that a
receiving system reads without a person. Settings → Sending → Electronic invoices chooses the
rulebook your clients expect — EN 16931 (the European standard), XRechnung 3.0 (Germany) or Peppol
BIS Billing 3.0 — and the Send panel then offers three formats alongside the ordinary PDF:

| Format | What it is | Who reads it |
|---|---|---|
| Factur-X / ZUGFeRD | A PDF/A-3 with the invoice embedded as CII XML. One file, readable by a person and a machine. | German and French accounting systems, and anyone with a PDF reader |
| UBL 2.1 XML | The bare structured invoice, Peppol's syntax | Peppol access points, XRechnung (UBL), the Nordics, Belgium, the Netherlands |
| CII XML | The bare structured invoice, UN/CEFACT syntax | XRechnung (CII), ZUGFeRD tooling |

Before each send a check lists what a receiver's validator would reject, in words, with the
setting that fixes it: a country spelled out instead of a two-letter code, a VAT number without
its country prefix, a missing buyer reference (the Leitweg-ID a German public body requires). The
output follows EN 16931's arithmetic to the cent — VAT categories, the reverse charge as `AE`,
allowances and charges — and is built to the published schema order.

It has been checked against the rules and against the official tools. Twelve sample documents —
invoices, credit notes, the reverse charge, discounts with shipping and part payment, a service
date — pass the EN 16931 validation artefacts (release 1.3.16) and the KoSIT XRechnung 3.0.2
schematron (2.6.0) in both UBL and CII with zero failed assertions; the KoSIT validator itself,
with the XRechnung 3.0.2 configuration German public bodies run, accepts every XRechnung file;
Peppol BIS Billing 3.0's own rules pass; and Mustang confirms every Factur-X file as PDF/A-3b
conformant with valid XMP and XML. `scripts/validate-einvoice.mjs` repeats all of it from a
scratch folder — the Schematron level in Node alone, the official tools with a portable Java
runtime it downloads — so the claim can be rechecked after any change. Validate a first file with
your receiver's own validator all the same, as every sender does.

**Peppol addresses.** The Peppol network addresses a party by a scheme and an identifier, and an
email is not one it knows. Under the Peppol profile a VAT number stands in for most countries
(9930 for a German one, 9957 for a French one); a Peppol ID typed as scheme:identifier —
0204:991-12345-67 for a Leitweg-ID, 0208 for a Belgian enterprise number — wins everywhere, in
Settings → Electronic invoices for you and on the client record for them. Sweden, Denmark and
Norway address by organisation number and need it typed.

A **service date** — when the work was done or the goods delivered — can be set on any document.
German law asks for it on every invoice, and an XRechnung is refused without a delivery date, so
the e-invoice carries it as the actual delivery date and uses the issue date when it is empty. It
prints, in the document's language, only when set.

The widget transmits nothing itself. An e-invoice goes out by whichever route you use today, and
the Direct route's payload carries XML as `utf8` and Factur-X as `base64`, exactly as it carries
a PDF. Transmission over the Peppol network needs an access point; hand the UBL file to one.

## Tax

Tax works one of three ways: a single rate you type in, a table of rates matched to the customer, or
none at all. It is a setting, configured once, in the demo exactly as on a connected document.

In table mode, rows match on country, state, postcode and city, resolved by priority, with compound
rates, per-line tax classes and a per-row flag for whether shipping is taxed. Presets cover the EU
(27 states, standard and reduced, each under its local name), 30 further countries, India GST (CGST
and SGST within your state, IGST outside it), Canada including Quebec's compound QST, the UK,
Australia, the UAE, Singapore and South Africa.

A single document can override the calculation with a fixed tax amount.

The EU reverse charge is worked out rather than ticked: a sale to a client in another EU state who
has produced a VAT number charges no VAT and says so, citing Article 196 of the VAT Directive, in
the document's language. A business trading under the small-business scheme sets Settings → Money
& tax → VAT exemption and the document carries the sentence its country expects (§ 19 UStG, art.
293 B du CGI, and so on), or its own wording. A legal line — registration number, court, managing
director — goes in Settings → Business and prints at the foot of every document.

Presets are a starting point, dated in `src/money/tax/rates.js`. They are not tax advice, and rates
change. Brazil and US sales tax are deliberately not included, since neither reduces to a small
table.

## Sending

A browser cannot send email, and Grist's own email action only reaches people with access to the
document, so it cannot email a client. The four routes reflect that:

## The email itself

The covering message is built the way a designed transactional email is built: nested tables and
inline styles, because that is the only thing every mail client renders the same way. Four shells,
chosen in Settings → Sending:

| Style | What it looks like |
|---|---|
| Card | A white card on a tinted ground, an accent rule across the top. The default. |
| Banded | Your accent as a full-width header band, your name reversed out of it |
| Slate | The same band in ink — the most formal |
| Plain | Hairlines on white, the way a letter is typed |

Whichever it is, what it carries is yours: your logo, your name, your accent colour, your address
and contact line in the footer. Above the message sits a summary — the document, the amount, the
due date — because that is what a client answers, and it should not need scrolling to. One small
line at the very bottom credits Invoice Studio, and Settings → Sending turns it off.

What travels with a message is two separate questions. **Attach** is the file the client keeps —
a PDF, or one of the e-invoice formats. **Show the invoice under your message** puts the whole
invoice in the email itself, below your text, laid out with tables so it survives Gmail and
Outlook. A client who will not open an attachment can still read it.

| Route | Setup | Leaves the browser | Runs unattended |
|---|---|---|---|
| Mail client | none | no, the OS takes over | no |
| Clipboard | none | no | no |
| Download PDF or HTML | none | no | no |
| Outbox | one Grist webhook | Grist sends it | yes |
| Direct POST | an endpoint URL | yes, to your host | no |

The Outbox is a table in your own document. Queueing writes a held row; releasing it sets a boolean,
which is the transition a Grist webhook fires on. [`recipes/`](recipes/) contains the far end: a
Cloudflare Worker, a Node relay that speaks SMTP, and setup notes for n8n, Make, Zapier and Grist.

What travels with the message is your choice: a PDF, an HTML file, or nothing — and separately, whether the invoice is laid out in the body of the email. Set the default in Settings → Sending, change it for one send in the Send panel.

The covering message for each event — sent, reminders, final notice, payment received — can be reworded in Settings → Messages, WooCommerce-style, with {placeholders} filled in per document. `{payment_link_line}` puts "Pay online: …" in the message when the business has a payment page and nothing when it has not, and in the formatted message every web address and email is a link the client can tap.

No SMTP password or API key is ever stored. Settings live in your Grist document, readable by anyone
who can edit it, so credentials belong in whatever you run at the far end. Endpoints must be HTTPS
unless they are on localhost.

## Documents

One table holds every kind. The starter's Invoices table has a **Kind** column — Invoice, Quote,
Credit note, Receipt, and the rest, as words — and a document with one opens each row as what it
is: a café's table holds till receipts beside the catering account's invoices, and a credit note
saved from an invoice reopens as a credit note. The Data drawer offers the column to a document
that lacks one; until it has one, every row shows as whatever the bar's kind chooser says, which
is what every row meant before there was a column to say otherwise. A column called Type or
DocumentType is recognised as the same thing.

Eight document kinds and eight layouts — Classic, Banded, Letterhead, Minimal, Slate, Headline, Rail and Centred. Layouts differ in the masthead and share one body, so every layout benefits from every future fix. A delivery note and a packing slip show no prices; a quote
carries an expiry rather than a due date; a receipt shows no payment details.

Paper: A4, US Letter, US Legal, A5, and 80mm or 58mm till rolls, which switch to a single-column
layout. Three densities. The choice applies to the PDF and to browser printing.

**Print** prints the invoice and nothing else: no bar, no sidebar, no hint strip, and none of the
browser's own furniture — the date, the page title, the URL and the page count it normally puts in
the page margin. There is no switch a page can flip to stop that, so the sheet's margin is zero
and the document makes its own 14mm inside it, on every page, by sitting in a table whose header
and footer rows repeat wherever the page breaks. A PDF saved from the print dialog is named after
the document, the same name the Download button gives it.

The PDF writer is part of this repository rather than a dependency. A document that stays within
Latin-1 uses the standard PDF fonts, embeds no font data and is around 6KB. A document that needs
more — a Polish name, a Czech street, Greek, Cyrillic, Vietnamese, `₹` — embeds a subset of DejaVu
Sans holding only the glyphs on the page (about 20KB), as a Type 0 font with a ToUnicode map so the
text still searches and copies. The font is fetched once, from `fonts/`, only by documents that need
it; Settings → Document can force it for every PDF. `scripts/subset-fonts.mjs` rebuilds the shipped
faces from the full DejaVu files (Bitstream Vera licence, in `fonts/LICENSE_DEJAVU`). Scripts DejaVu
does not cover — CJK, Arabic, Devanagari — are still out of reach, and their characters draw as the
missing-glyph box.

## Development

No build step. `index.html` loads `src/` as native ES modules, and all libraries are vendored.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/serve.ps1
# http://127.0.0.1:4178/
```

```bash
npm test        # 14 suites, no framework
npm run build   # esbuild + obfuscator into dist/, which CI deploys to Pages
```

### The shared core

`src/core/` is copied from [Advanced Charts](https://github.com/anupress/grist-advanced-charts) by
`scripts/sync-core.mjs` and is read-only here.

```bash
npm run sync         # copy from ../WidgetIdea and refresh core.lock.json
npm run sync:check   # fail if src/core/ has been edited, or has moved on upstream
npm run sync:list    # what is shared, and where each file lands
```

`sync:check` runs in CI. To change a core file, change it upstream and re-sync. If a change belongs
only to Invoice Studio it does not belong in core; move it into a module here and drop it from
`core.manifest.json`.

Settings are stored in `ANUPRESS_Config` under the key `invoiceStudio`. Advanced Charts uses `site`
for its dashboard design, so the two coexist in one document. Do not call the core's `saveConfig()`
from this repository; `tests/settings.test.mjs` checks the keys still differ.

## Privacy

Everything is composed in the viewer's browser. ANUPRESS runs no server and receives nothing.

The exception is the Direct route. If you enter an endpoint URL, the page posts the invoice, the
client's name and address and the message to that URL. It is inactive until you enter one, and the
destination host is shown on screen before each send.

## Repository

```
src/core/       copied from Advanced Charts, read-only
src/model/      schema recognition, column roles, drafts, and the write plan
src/money/      rounding, tax rates, shipping, discounts, totals, numbering
src/doc/        document kinds, field visibility, layouts, renderer
src/compose/    composer and send panel
src/send/       message templating and each delivery route
src/export/     HTML file and PDF writer
src/templates/  fourteen trades
src/settings/   settings and their storage
fonts/          the embedded PDF faces, subset from DejaVu Sans
src/grist/      the only code that writes to Grist
recipes/        Worker, SMTP relay, n8n, Make, Zapier, Grist setup
tests/          plain ES modules, one verdict per file
```

## License

[MIT](LICENSE) © 2026 ANUPRESS
