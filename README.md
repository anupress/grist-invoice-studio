# Invoice Studio

[![License: MIT](https://img.shields.io/badge/License-MIT-2563EB.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.18.0-0F1B2D.svg)](CHANGELOG.md)

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

Test on a copy of your document first. The write path has not yet run against a live Grist document.

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

Every trade's starter document can be seen without a Grist document: add `?trade=restaurant` (or
any trade id from `src/templates/index.js`) to the widget URL and the demo builds it in memory.

All sample data is invented. The businesses carry the ANUPRESS name so a screenshot says who made
the widget; the clients, addresses, phone numbers and tax numbers are fictional and the email
domains are reserved for examples.

If you already keep invoices in tables of your own, the Data drawer lets you point each part —
invoices, line items, clients, catalogue — at the table you use. Detection is only a guess, and a
choice always beats it; columns inside a chosen table are still matched by name.

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
nothing.

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
allowances and charges — and is built to the published schema order; validate a first file with
your receiver's own validator before relying on it, as every sender does.

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

Eight document kinds and eight layouts — Classic, Banded, Letterhead, Minimal, Slate, Headline, Rail and Centred. Layouts differ in the masthead and share one body, so every layout benefits from every future fix. A delivery note and a packing slip show no prices; a quote
carries an expiry rather than a due date; a receipt shows no payment details.

Paper: A4, US Letter, US Legal, A5, and 80mm or 58mm till rolls, which switch to a single-column
layout. Three densities. The choice applies to the PDF and to browser printing.

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
