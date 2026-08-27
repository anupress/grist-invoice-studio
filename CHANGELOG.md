# Changelog

## 1.1.0 — Europe in full, tax you can just type, paper that fits, and the invoice in the email

**The invoice can now go in the body of the email**, not only as an attachment. It could not just be
dropped in: the on-screen document is laid out with CSS grid and flexbox, and mail clients — Outlook
above all, which renders with Word — strip both, along with `<style>` blocks and class names.
Pasting it in produces a column of unstyled text in roughly the wrong order.

So `src/send/email-document.js` is the same document expressed the way email actually works: nested
tables, inline styles, widths as attributes, 600px wide. It reads the same kinds and fields
descriptions as the screen and the PDF, so a delivery note carries no prices here for exactly the
reason it carries none there. A client who will not open an attachment can still read the invoice —
and a `mailto:` link cannot attach anything at all, which is what makes this matter.

The covering note's three-line summary box is dropped when the document is included, since it would
be repeating in three lines what the table underneath says in full. It is a toggle, defaulting on.

Fixed on the way: terms ending in a full stop got a second one — "Net 30 from the date of invoice.."
— on every invoice sent by anyone who ends a sentence.


**Tax has three modes now, and the default is the simplest one.**

- **One rate I type in.** A sole trader registered in one country does not need a table of
  twenty-seven, and making them pick a preset and then check it is asking for work that has no
  bearing on their invoices. Type `20`, call it `VAT`, done. It is still an ordinary wildcard rate
  *row* underneath, so it goes through exactly the same engine — no second code path means no second
  set of rounding behaviour to disagree with the first.
- **A table of countries**, for anyone selling across borders.
- **I do not charge tax**, which is a real answer and not the same as a rate of zero.

The rate grid only appears in table mode. A rate table sitting under "one rate I type in" is an
invitation to fill in something that will never be read.

**And a per-document escape hatch.** Sometimes the answer is not a rate at all — an accountant has
given a figure, an old invoice is being reproduced, or a rounding elsewhere has to be matched
exactly. Type the tax on that one invoice and the rate table is skipped for it. It prints as a bare
name with no percentage after it, because there isn't one.

**Europe, properly.** All 27 member states with their standard *and* main reduced rate, each under
its own name — a German invoice says **MwSt**, a French one **TVA**, an Italian one **IVA**,
Hungarian **ÁFA**. Denmark gets no reduced rate because it genuinely has none, rather than a row
pretending otherwise. Plus thirty more countries: the UK, Switzerland, Norway, Iceland, Turkey,
Serbia, Ukraine, Japan, Korea, China, Singapore, Thailand, Vietnam, Indonesia, the Philippines,
Malaysia, Australia, New Zealand, the Gulf, Israel, Egypt, South Africa, Nigeria, Kenya, Morocco,
Mexico, Argentina, Chile, Colombia.

Brazil and US sales tax are still deliberately absent. A plausible-looking wrong table is worse than
an empty one that makes somebody go and look the answer up.

**Paper that fits what it is for.** A4, US Letter, US Legal, A5 — and **till rolls**, 80mm and 58mm.
A roll is a different *shape* rather than a smaller sheet, so it gets its own layout: one narrow
column, a centred masthead, no From-and-Bill-to spread — anyone holding a receipt is standing in
front of the business already. Widths are the printable area (72mm on an 80mm roll) because a
thermal mechanism does not reach the edge of its own paper. Plus a **density** setting — compact,
normal, roomy — which scales the type and the leading together so the page stays in tune.

All of it applies to the PDF *and* the printed page: `@page` cannot be scoped by a selector, so the
page rule is managed at runtime. Choosing a till roll and pressing Print produces a till roll, not
an A4 sheet with a receipt in the corner.

## 1.0.0 — phase 6, and the plan is finished

A real PDF, fourteen trades, and stock. 840 assertions across thirteen suites.

**A PDF writer, written here.** No library: a PDF of an invoice is text, rules and a logo, and the
packages that do this weigh several hundred kilobytes because they also do things this will never
ask for. `src/export/pdf/` is the format itself — objects, a cross-reference table, a content
stream — and the published Adobe font metrics, because a right-aligned total is right-aligned only
if we measured the text correctly. An invoice comes out at about 6KB and embeds no font data, since
every viewer already has Helvetica.

Verified structurally *and* visually: the tests parse the finished file, confirm every
cross-reference offset genuinely points at the object it claims, and confirm every stream's declared
`/Length` is its real length — the two classic reasons a hand-written PDF opens blank. Then it was
rendered in Chrome's own PDF engine, which also read the title out of the metadata.

**The honest limit, handled rather than hidden.** Standard PDF fonts are WinAnsi: they can write £,
€ and ü, and cannot write ₹, ৳ or a word of Devanagari. So text is transliterated rather than
dropped — an Indian invoice reads `Rs.2,867.40`, because a hole where the amount should be is far
worse than being slightly less pretty. Anything genuinely unrepresentable becomes a visible `?`
rather than nothing at all.

**Fourteen trades** — freelancer, agency, SaaS, retail, restaurant, e-commerce, construction, auto
repair, clinic, legal, tuition, charity, rental, logistics. A template sets the handful of things
that actually differ by trade: what the document is called, the wording, how numbers run, whether
prices include tax. A shop gets tax-inclusive prices and issues receipts; a charity charges no tax
and states that no goods were given in return. **A template never touches your name or address**,
and it shows you what it will change before it changes it.

**Stock**, and it is the most constrained thing here because it is the most destructive: off unless
you turn it on, never applied twice to one invoice, and never below zero unless explicitly allowed.
Repeated lines for one product are added together rather than the second overwriting the first, and
matching is by SKU or exact name — never fuzzy, because guessing would be right most of the time and
the times it was wrong would move stock on the wrong product.

Fixed on the way: the bar's layout chooser always beat the stored layout, so a template that set one
appeared to do nothing; and the "Applied" message was destroyed by the rebuild that applying a
template triggers.

## 0.6.0 — phase 5, settings

Everything a business decides once, in one panel, stored in its own document. 653 assertions across
eleven suites.

**It stores under its own key, and that is not a detail.** The shared core's `saveConfig()` writes
to `ANUPRESS_Config` under the key `site`, and to the widget option `anupressSiteConfig` — which is
where Advanced Charts keeps its entire dashboard design. Both widgets on one document is a perfectly
ordinary thing to want, and calling that function from here would have overwritten somebody's
dashboard the first time they changed a tax rate. Invoice Studio writes to the same table under
`invoiceStudio`, so the two coexist. A test asserts the core still uses the keys we think it does,
so this cannot rot quietly.

**Seven sections**, named the way WooCommerce names the same things:

- **Your business** — the sender, as ordinary data. Grist's template keeps this in a Python formula,
  so changing your own address means editing code.
- **Money** — currency, symbol position in all four variants, separators, decimals, rounding mode.
- **Tax** — charge tax or not, prices entered with or without it, which address decides, round per
  line or at the subtotal, itemised or single.
- **Tax rates** — the editable rate table: country, state, postcode, rate, name, **priority**,
  **compound**, **applies to shipping**, class. Load a preset to fill it, then edit — and editing
  turns a preset into your own table, so your changes are never rebuilt over.
- **Numbering** — digits, start, reset period, and a separate prefix per document kind.
- **The document** — layout, accent, labels, how to pay, closing line.
- **Sending** — reply-to, always-Cc, always-Bcc, your endpoint.

**Two things are live rather than described**, because both are settings people get wrong silently:
the currency sample redraws as you change separators, and the numbering sample shows the real next
number for the real sequence. Anyone who can see `INV-2026-0012` cannot mis-set padding.

**Merging keeps keys it does not recognise.** Settings written by a later version get read by an
earlier one the moment two people are on different releases, and dropping unknown keys is how a
colleague's setting silently disappears when you save.

Fixed on the way: a stored format object also carried a `currency`, and spreading it last let that
stale copy shadow the real one — so changing the currency setting visibly did nothing to the symbol
on the document. Two copies of one fact always eventually disagree; there is now one.

## 0.5.0 — phase 4, delivery

The billing loop closes. 602 assertions across ten suites.

**One message, several ways out.** The message is composed once — recipient, subject, body — and
every route takes the same object, so what you read on screen is exactly what leaves. Routes are
ordered by what they cost you, cheapest first, which is also the order most people will need them:

- **Open in your mail client** — nothing transmitted, your OS does the handover.
- **Copy the message** — rich and plain text together, paste straight into Gmail with the formatting
  intact.
- **Download the document** — one self-contained HTML file, no fonts or stylesheets to lose, prints
  to PDF from any browser.
- **Outbox** — a real, visible table in your own document. This is the one that works when nobody is
  watching.
- **Direct** — post to an endpoint of your own.

**The outbox is the interesting one.** Grist can fire a webhook unattended, but its own email action
only reaches people with access to the document — so it cannot email your client. The widget writes
the message into `ANUPRESS_Outbox` **held**, and releasing it flips a `Ready` boolean. That flip is
not a status field we invented: false→true on a ready column is precisely what a Grist webhook fires
on. So the review step and the trigger are the same action.

**Messages choose themselves.** An eight-day-overdue invoice opens on the overdue reminder; forty
days opens on the final notice; a paid one opens on a receipt; a quote on the quote message.
Thresholds match the automation conditions written out in `recipes/grist-automation.md`, so what
Grist sends unattended is what you would have sent by hand.

**`recipes/`** ships the far end, ready to paste: a Cloudflare Worker, a Node relay that speaks real
SMTP, and setup steps for n8n, Make, Zapier and Grist itself. The two code recipes both answer the
request *before* sending, because Grist retries a webhook that is slow and a retry means the client
gets the invoice twice.

**Refusals, deliberate:** no SMTP password or mail-provider API key is ever stored — it would sit in
a table every editor of your document can read, and browsers cannot call those APIs anyway. No plain
`http` endpoint unless it is on your own machine, since an invoice carries a name, an address and an
amount. And a URL with a named credential in its query string is rejected with the parameter named.

**Honesty about delivery.** A cross-origin POST to somebody's automation usually comes back
unreadable — the request arrives, but the browser will not let us see the reply. That reports as
"sent, but not confirmed", never as sent.

Also: mailto links are truncated by the mail client past roughly 2,000 characters, silently, so a
long body is cut here instead and says where it stopped. The README's privacy section now names the
one route that leaves the browser, because it would otherwise be untrue.

## 0.4.0 — phase 3, the composer

It writes now. 519 assertions across nine suites.

**The composer** sits above the document and edits it live: type on the left, watch the document
build itself below. Editing a value never rebuilds the form, so the cursor stays where it is; only
adding a line or converting a document does, and by then the focus is on a button anyway.

- Client picker fills the address, email and tax number from the client table in one action.
- Line grid with add, remove, reorder and a product picker off any catalogue the document has.
- Live totals in the form and in the preview, both from the same engine.
- New, Duplicate, and convert — quote to invoice, invoice to receipt or credit note.

**Writing is planned, not performed.** `model/write.js` builds a plan — rows to add, update, remove,
and every field it deliberately would not touch — and `grist/writer.js` carries it out. The plan is
pure, so it is tested without Grist, and the composer shows it before anything happens: *"Update 1
invoice, update 3 lines."*

**Three rules, each of which was a real failure first:**

- **Formula columns are never written.** Grist rejects the action, and Grist's own template computes
  its `Number`, `Due`, `Items` and `References` — so this is the default document, not a corner case.
- **Values are converted to what the column holds.** A Date goes in as epoch seconds, not
  `"2026-08-27"`.
- **A value that does not fit is refused, not mangled.** Found by saving a real invoice: the number
  `INV-2026-0001` written into Grist's Numeric `Number` column came out as **-2026**, because
  stripping non-digits and calling `parseFloat` produces a plausible wrong answer with no error
  anywhere.

**Everything refused is listed before you save**, per field with the reason — not counted in a toast.
Computed totals are excluded from that list, because warning about a figure nobody typed is the
noise that teaches people to ignore the list their purchase-order number is in.

**Upgrade this document** adds the missing columns in one action — and **backfills**. Adding a stored
`InvoiceNumber` makes it the mapped number immediately, so without copying the old formula's values
across, every existing invoice would lose its number and show a row id. It now carries 51372 through
intact, and the "this number will move if you delete a row" warning disappears from the document
because it is no longer true. Running it again does nothing.

Also: no `confirm()` dialog — the panel already lists every column and the assurance, so the button
says what it does (*"Add these 13 columns"*). A browser dialog inside an embedded widget blocks the
host page, not just ours. And every control has a real accessible name; the icon-only ones had none.

## 0.3.0 — phase 2, the document

Eight kinds of document, four layouts, and a page that assembles itself from three descriptions
rather than being written out longhand. 410 assertions across eight suites.

**Document kinds** (`src/doc/kinds.js`) carry behaviour, not just headings.

- A quote does not demand payment, its second date is **Valid until** rather than Due, and it says
  so on the page — a quote that reads like an invoice gets paid by accident and then argued about.
- A receipt's second date is when it was **Paid**, and it never shows bank details, because printing
  them on a document confirming payment invites a second one.
- A **delivery note and a packing slip show no money at all** — no price columns, no totals, no
  currency symbol anywhere on the page. It travels in the box, and the person unpacking it is not
  the person who agreed the price.
- A statement lists other documents with a running balance rather than line items.
- Proforma and credit note carry the legends they are required to carry.
- Quote → invoice → receipt or credit note, with the number deliberately **not** carried across:
  it belonged to the document it was issued against, and numbers are never reused.

**Fields are derived, not configured** (`src/doc/fields.js`). The HSN/SAC column appears when the
lines carry codes *and* when Indian GST is in use but they are missing — because then the missing
code is the problem, and a column of dashes is what makes it visible. Tax registration numbers
appear when tax is charged, or when the reason none is charged is that the client is accounting for
it. A per-line discount column only earns its width when something is discounted.

**Four layouts** (`src/doc/layouts.js`) over one shared body — classic, banded, letterhead, minimal.
Only the masthead varies, so there is one set of totals styling rather than four.

**One draft shape** (`src/model/draft.js`) for a document whether or not it exists yet. A row read
out of a table and a document being composed arrive at the renderer identically, which is what will
let the composer preview through this renderer rather than a second one that slowly disagrees.

**Place of supply** is now modelled properly: where a supply is deemed to happen can differ from
where the customer's post goes, and it is what decides whether Indian GST splits into CGST plus SGST
or stays as a single IGST.

Also fixed: an HSN/SAC pattern was being matched as a *tax class*, which would have silently stopped
every line matching a rate row.

## 0.2.0 — phase 1, the money engine

Pure, tested arithmetic. 327 assertions across seven suites, and nothing in it knows what country
you are in.

**The tax engine** (`src/money/tax/`) is a rate TABLE, not a set of regional modules — country,
state, postcode, city, rate, name, priority, compound, applies-to-shipping, tax class. Two rules
carry all the subtlety: at most one rate applies per priority, and a compound rate applies on top of
the taxes already added.

- India's CGST/SGST versus IGST falls out of those rules with **no India-specific code**: the
  CGST and SGST rows name your registered state at priorities 1 and 2, the IGST row says "any
  state" at priority 1, and the customer's own state decides which is more specific.
- Quebec's QST compounds on the federal GST — 15.47 on 100, not the 14.98 that adding the
  percentages gives. Ontario's HST displaces the federal GST by being more specific at the same
  priority.
- EU reverse charge is a condition, not a rate, so it lives outside the table and carries the legend
  the document has to print.
- Presets: India, EU (27 states), UK, Canada, Australia, UAE, Singapore, South Africa. The US preset
  is deliberately two example rows — a plausible national table would be wrong nearly everywhere and
  would quietly under-collect.

**Rounding** (`src/money/currency.js`) — the naive `Math.round(n * 100) / 100` gets 1.005 wrong,
because 1.005 × 100 is 100.49999999999999. Shifting through the decimal string fixes it. Half-away-
from-zero, half-to-even, up and down; per-line or once at the subtotal, which genuinely change the
total and so are a setting.

**Tax-inclusive pricing** preserves the advertised price exactly: £9.99 inclusive of 20% VAT comes
back as 8.32 + 1.67, not the 8.33 + 1.67 = 10.00 that computing both independently produces.

**Shipping** (`src/money/shipping.js`) — zones with first-match-wins, flat rate, free shipping with
conditions, local pickup, per-class costs summed or charged once. WooCommerce's cost syntax,
including `[qty]` and `[fee percent min_fee max_fee]`, parsed by a small recursive-descent evaluator
rather than `eval` — the formula comes out of a Grist document other people can edit, so running it
as code would be a stored XSS hole.

**Discounts** (`src/money/discounts.js`) — percentage, fixed-on-order, fixed-on-line, applied
sequentially or all against the original price. Fixed amounts are apportioned across lines so each
line's taxable base falls correctly, and the parts always sum to exactly the whole.

**Numbering** (`src/money/numbering.js`) — assign once, store it, never recompute. Highest-plus-one
rather than count-plus-one, because counting collides the moment anything has been deleted. The
period scopes itself through the rendered prefix, and a format claiming a yearly reset without a
year token in it is reported rather than silently producing duplicates.

**Wired in:** totals now come from the engine, `provisional` is gone, and the document itemises
every tax line in the order it was applied.

## 0.1.0 — phase 0, repository bootstrap

The skeleton, and the first thing worth having: the widget can be pointed at a document and work out
how that document holds invoices.

**Schema recognition** (`src/model/schema.js`)
- Recognises Grist's official Invoicing template by column signature rather than table name, so a
  renamed table still matches.
- Falls back to matching by column name for every other document, ranking the vocabulary Grist's own
  invoice widget accepts first — a document built for that widget maps here without changes.
- Deliberately does **not** map the official template's `Total` column: it is Text and empty on every
  row, so mapping it would print a blank where the amount goes.
- Carries `derived` for a role filled by a formula we intend to replace (`Number = $id + 51371`), so
  the upgrade can offer a stored number even though the role is already filled.
- Columns added to a recognised template are picked up by name matching and used, which is what makes
  the upgrade path actually take effect rather than being offered forever.
- `upgradeChecklist()` reports what a document is missing, and is idempotent.

**Rendering**
- `src/model/resolve.js` turns a row into an invoice using roles only, following a client by row id
  or by name, and line items by row id or by matching invoice number.
- `src/doc/render.js` draws the document. Currency comes from the invoice or the settings rather
  than being hardcoded to US dollars, and dates are written unambiguously as `28 Aug 2026`.
- Totals are provisional and flagged as such until the money engine lands in phase 1.

**Tooling**
- `scripts/sync-core.mjs` keeps `src/core/` byte-identical to Advanced Charts, with a lockfile, a
  tamper check that runs in CI, and an upstream-drift report that runs locally.
- Tests run with no framework: `node tests/run.mjs`.

Not yet: creating or editing invoices, tax, shipping, discounts, sending, templates, PDF.
