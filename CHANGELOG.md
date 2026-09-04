# Changelog

## 1.19.1

- **A picture now actually reaches the table.** Two faults, both fixed: on a document whose
  catalogue has no Image column the picture had nowhere to go, and the form said so without
  offering a way out — it now adds the column in one press; and in the demo the data URI was
  refused by an attachments column that, being in memory, could have held it perfectly well.
- **A new client or catalogue item appears the moment it is saved.** The provider's `prime()`
  deliberately skips a table whose rows it already holds, so priming after a write returned the
  rows as they were before it and the list only caught up on Refresh. Every write path now
  invalidates before it primes.
- **Every column the table has is on the form.** Colour, Size, Supplier, a checkbox, a date, a
  choice list of its own — the columns the widget does not use itself now appear under "Also in
  this catalogue", with the right control for each. Formulas, references and attachment columns
  beyond the picture are left out rather than given a box that would write the wrong shape.
- **Type-ahead where the answer is known but the spelling is not**: country codes with their
  names, currencies, units an e-invoice will accept, tax classes taken from your own rate table,
  and the usual payment terms. Suggestions, never constraints — a country we forgot still goes in.
- **An HTML file is no longer an attachment choice.** It answered the same question as "show the
  invoice under your message" and answered it worse: a second file to open rather than something
  to read. The body option is now named for what it does, and a document still set to the old
  choice is moved across to a PDF with the invoice in the message. The HTML file remains a
  download, for automations that want to read one.
- Line items are nested under Invoices in Grist's own page list when a document is set up here —
  they belong to an invoice, and nothing navigates to them alone. Best-effort: a document whose
  pages could not be rearranged is a document that works.
- The client form is laid out properly: full-width name and address lines, three columns for the
  town line, and the preview stays beside the fields on a wide pane rather than being squeezed.

## 1.19.0 — Clients and the catalogue, without leaving the widget

- **Three lists in the sidebar: Invoices, Clients, Catalogue.** Clients and catalogue items are
  added, edited and removed in the body the way an invoice is composed there, with a live preview
  of how the client's address block, or the item's thumbnail and price, will print. Removal is
  two presses on one button a few seconds apart, never a browser dialog. A catalogue item takes a
  picture by drag-and-drop — uploaded as a Grist attachment on a live document, kept in memory in
  the demo — scaled to a thumbnail on the way in. Fields the table has no column for are shown
  greyed with the reason.
- **Quick-add from the invoice.** The client picker ends with "+ New client…", which opens the
  same form inline and selects the new client the moment it is saved. Every line carries a star
  that adds it to the catalogue, priced and unit-ed as typed; a line already in the catalogue says
  so instead of duplicating.
- **Column mapping.** Under each table in Data, every role can be pinned to any column of that
  table, or to "none". Choices are stored with the table choice and outrank the name matching, so
  tables built by hand with their own names — *Kunde*, *Preis*, *Bezeichnung* — work without
  renaming a column. A pinned column serves one role only.
- **Three doors on the empty-document screen**: set up with a sample business (as before), start
  empty (the same four tables and columns, no rows, no sample business), or choose your own
  tables. Data can also create a missing Clients or Products table on its own, empty.
- `src/model/records.js` is the pure half: the forms resolved against a real table, the plan that
  turns typed values into cells (attachments as `['L', id]`, text picture columns as an address),
  and what could not be kept, reported.

## 1.18.0 — A complete sample business for every trade

- **Setup builds a whole business, not four rows.** Every trade now has its own sample: an
  ANUPRESS-branded business with an address (ANUPRESS Café, ANUPRESS Works, ANUPRESS Legal, and
  eleven more), three or four clients suited to the trade, a catalogue of what it sells with units
  and SKUs, and five documents in five states — overdue, paid, part paid, sent and draft — with
  references, notes and sent/paid dates. Four trades have a client abroad with a Language set, so
  the invoice to them opens in German, French, Dutch or Polish without anyone choosing. The data is
  in `src/templates/samples.js`; the starter builds the tables from it.
- **The sample business fills the settings when they are empty**, so a fresh document is headed
  ANUPRESS Café rather than "Your business", and the money settings still at their factory
  defaults follow it into pounds and VAT. The widget keeps pointing at Settings → Business until
  the name is replaced. A business that already has a name is never touched.
- **Remove the sample rows.** Setup remembers the row ids it wrote, and Data offers to remove
  exactly those — never a row you added, never a table or a column — so a document can be cleared
  in one click when the real invoices arrive. A hint above the document says how many are left.
- **`?trade=<id>` on the demo** builds that trade's starter document in memory, so every sample
  business can be looked at, and screenshotted, from one URL each.
- **Links in emails.** Web addresses and emails in the formatted message and in the document's
  standing text are now links a client can tap, the masthead's website is one too, and the
  message templates carry `{payment_link_line}` — "Pay online: …" when the business has a payment
  page and nothing when it has not. `{payment_link}` and `{website}` are available as placeholders.
- The demo sender is ANUPRESS Works, the same business the construction starter builds; the
  previous fictional name is gone from everything a person sees.
- Invoice items gain a Unit column in new starter documents.

## 1.17.0 — EU-ready

The release that makes the "Europe and the major markets" claim true, and closes the gaps the
competitor research found. Nothing that worked before changed shape: a Latin-1 English document
with no payment details is the document it was, byte for byte.

- **The PDF can write every European language.** The standard PDF fonts are WinAnsi, which has no
  ł, č, ő, Greek, Cyrillic or ₹ — a Polish client's name came out with question marks in it. The
  writer now embeds a subset of DejaVu Sans when a document needs it: only the glyphs on the page
  (about twenty kilobytes), as a Type 0 font with a ToUnicode map so the text still searches and
  copies. The font is fetched once, only by documents that need it, so an English invoice never
  loads it and stays six kilobytes. Settings → Document can force embedding for every PDF. The
  subsetter, `src/export/pdf/ttf.js`, is our own; `fonts/` holds the shipped faces, cut down by
  `scripts/subset-fonts.mjs` from DejaVu (Bitstream Vera licence, included).
- **Eight document languages.** English, German, French, Spanish, Italian, Dutch, Polish and
  Portuguese: the document's own words — Invoice/Rechnung/Facture, the dates, column headings,
  totals, legends, the reverse-charge sentence — with dates written the way the language writes
  them. Chosen per document, else from the client record's new `Language` column, else the default
  in Settings → Document. Only the document's words change; what you type is never translated. The
  screen, the PDF, the email body and the plain text all read one dictionary (`src/doc/lang.js`),
  and message placeholders like `{kind}` and `{due}` follow the document.
- **The EU reverse charge is worked out, not ticked.** A cross-border sale inside the EU to a client
  with a VAT number charges no VAT and says so, citing Article 196, in the document's language.
  The rule existed since 1.1.0 and was never wired to the totals; now it is.
- **Small-business VAT exemption.** Settings → Money & tax → VAT exemption. No tax is charged and
  the document carries the sentence the home country expects (§ 19 UStG, art. 293 B du CGI, art.
  113 ustawy o VAT, and fifteen more), or the business's own wording.
- **A legal line.** Settings → Business → Legal line: registration number and court, managing
  director, share capital — printed small at the foot of every document, as German and French law
  require.
- **A payment code the client scans.** Settings → Money & tax → Getting paid. Euro documents with
  an IBAN carry the EPC "GiroCode" that European banking apps scan to pre-fill a SEPA transfer
  (account, amount, reference); rupee documents with a UPI id carry a UPI code; a payment link — a
  Stripe or PayPal page — serves any currency. Drawn as SVG on screen and as vector squares in the
  PDF; the account lines are printed beside it and in the email and plain text. Only on documents
  that ask for money, only while something is owed. The QR encoder is the shared core's.
- **Issued documents open read-only.** A saved document whose status has moved past Draft opens in
  the composer greyed out with the reason and three actions: make a credit note, duplicate as new,
  or edit anyway. The credit note names the invoice it reverses (`RelatedTo`, offered by the
  upgrade and included in new setups) and its legend says so in the document's language. Settings
  → Document → Issued documents turns the lock off.
- **Electronic invoices.** Settings → Sending → Electronic invoices chooses a rulebook — EN 16931,
  XRechnung 3.0 (Germany) or Peppol BIS Billing 3.0 — and the Send panel gains three formats:
  Factur-X/ZUGFeRD, a PDF/A-3 with the invoice embedded as UN/CEFACT CII XML, which German and
  French systems read automatically; UBL 2.1 XML; and bare CII XML. All three come from one
  EN 16931 model (`src/einvoice/model.js`): VAT categories S/Z/AE/E from what the engine did, the
  reverse charge as AE with `VATEX-EU-AE`, line allowances so the arithmetic closes to the cent,
  shipping as a document charge, unit codes, the preceding invoice on a credit note. A check runs
  before every send and lists what a receiver's validator would reject, in words, with the setting
  to fix it — a spelled-out country, a VAT number without its prefix, a missing Leitweg-ID. The
  PDF/A-3 side is our own too: XMP metadata with the Factur-X extension schema, an sRGB output
  intent built from its numbers (`src/export/pdf/icc.js`), the embedded file as an associated
  file with `AFRelationship /Alternative`, fonts always embedded. Nothing is transmitted by the
  widget; the file goes out by whichever route is used today, and the Direct payload carries XML
  as `utf8` and Factur-X as `base64` exactly as it carries a PDF.
- Unit words on lines map to UN/ECE codes (`src/doc/units.js`) — hours to HUR, m² to MTK — which
  the electronic invoice requires; nothing visible changes.
- The composer gains Language and, on credit notes, Refers to. Settings → Document gains Language,
  PDF fonts and Issued documents. New starter documents include `Language` on Clients and
  `RelatedTo` on Invoices; existing documents are offered both by the upgrade.
- Downloading a PDF is asynchronous now (the font may need fetching); the send panel warms the
  font the moment it opens for a document that will need it, so the click still feels immediate.

## 1.16.1

- Change of trade moves to the bottom of the Business tab — it is a fact about the business, and a
  seventh tab was one door too many. Its wording now also answers the structural question in
  place: a trade never touches tables or columns, because every trade uses the same four tables;
  what differs between trades is what is sold, not how it is stored.

## 1.16.0

- Settings gains a Trade tab: the same starting points setup offers, available for the rest of the
  document's life. A café that becomes a shop reapplies its trade there — wording, numbering,
  layout and tax defaults — with the changes listed before they are made, and identity (name,
  address, logo, saved messages) never touched. Nothing is stored until Save settings.
- This section existed once, sat unexplained at the top of the panel, and earned its removal. It
  returns as its own door now that setup has taught what a trade is.

## 1.15.0

- The starter's Image column is Attachments again — the type a Grist user actually drags photos
  into. Yesterday's Text detour solved the sample-picture problem by giving users a worse column,
  which was backwards. The real fix: on a live document, setup now UPLOADS the sample pictograms
  through Grist's attachment API after the column exists and writes the returned ids into the
  cells, so a fresh café gets a proper Attachments column with real attachments in it. The demo
  keeps them in memory as before. Uploading is decorative: any failure costs the pictures, never
  the setup.
- A document that got the Text-typed column from 1.14.2 keeps working — the renderer honours a
  URL or data URI in a Text column exactly as it honours an attachment.

## 1.14.2

- The starter's sample pictures never reached a live document, only the demo. The Image column was
  typed Attachments — added after the atomic create, whose record write skips it, and unable to
  hold a text data URI in any case — so a live café got an empty column and no pictures while the
  in-memory demo cheerfully showed both. The starter's Image column is now Text and rides the
  create with its values; it takes a data URI or an https URL. The upgrade still offers an
  Attachments-typed Image for businesses that prefer dragging photos in, and the renderer honours
  either.
- The running version is now visible: hover the Connected/Demo pill, or look for
  "[Invoice Studio] v…" in the console. "Is my iframe on the new bundle or a cached one" was
  undiagnosable without it.

## 1.14.1

- Every asset URL in the built page now carries the version. Without it, a Grist iframe that had
  loaded the widget once kept serving its cached app.js for as long as its cache pleased —
  deploys landed on Pages and never reached the documents already using the widget, which
  surfaced as "the fix did not do anything". This is the release that makes every later release
  actually arrive.
- The restaurant trade gets pictograms on its catalogue too — a plate and a coffee — so a café
  choosing its own trade sees the thumbnails working immediately, the same way the shops do.

## 1.14.0

- The upgrade now reaches the catalogue: a Products table without an Image column is offered one,
  through the same hint and the same Add button as every other missing column. This is how a
  document created before pictures existed gets them — new setups always had the column; existing
  documents had no path to it at all, which was a real gap, not an option.

## 1.13.1

- The tax-regime chooser is gone from the demo bar too. Tax is a setting, and a demo teaching a
  control the real thing does not have was teaching the wrong thing.
- Refresh moves into the sidebar beside Edit and New, and appears in the demo as well — where it
  says honestly that the demo data lives in the page and redraws anyway, because a control that
  exists on live and not in the demo reads as a broken demo. The bar keeps a narrow-screen copy.

## 1.13.0

### Seeing it work

- The two shop trades — retail and the online shop — ship with little flat pictograms on their
  catalogue, so line thumbnails are visible from the first second: in the sample shown during
  setup, and in the document setup builds. Every other trade's catalogue starts picture-free, and
  so do its documents. The pictograms are drawn SVG, invented like all sample data here.
- Edit and New move into the sidebar, beside the list they act on; Edit reads Close while the
  composer is open. On narrow screens, where the sidebar gives way to the bar's picker, the bar
  grows its own Edit and New — one set or the other, never both.
- A Refresh button, on connected documents only, re-reads every table, the schema, the table list
  and the saved settings, then draws again. Grist gives a custom widget no change notification, so
  this is how rows edited in the document next door — or by a colleague — arrive without reloading
  the whole widget.

## 1.12.0

### Pictures on the lines

- A line item can carry a picture. Add an Image column — Attachments, an https URL, or a data URI —
  to the line-item or product table, and a 36px thumbnail appears beside each description, on
  screen and in the exported HTML file. A line without its own picture borrows the catalogue's,
  matched by product name, so photographing the catalogue once illustrates every invoice.
- The column exists only when at least one line has a picture: a document without pictures is
  EXACTLY the document it was before pictures existed, which is the whole promise.
- Grist attachments are resolved to short-lived token URLs on screen, cached for a minute. Exports
  and emails deliberately carry only stable sources — https or data URIs — because a token URL
  frozen into a file or a message dies within minutes, and a picture that decays is worse than
  none. An <img> is never given anything else: plain http and javascript: are refused.
- New starter documents include an empty Image column on the catalogue, ready for photos. The PDF
  stays text-only, as it always has.

## 1.11.0

### Your own statuses

- The composer's Status field is a text input with suggestions, not a fixed list: pick one of the
  offered statuses or type your own. The suggestions are the document's own vocabulary — the
  Status column's choice list first, then every status in use in the rows, then the built-ins —
  deduplicated case-insensitively with the owner's spelling kept.
- Saving a status the column has not seen before registers it on the column's choices, before the
  row lands, so Grist never shows the value flagged as invalid. The registration is an addition
  that preserves everything else in the options, the colours on existing choices included, and a
  failure there only costs the registration, never the save.
- A custom status survives sending. The stamp only promotes Draft to Sent; a word it does not know
  is left exactly as the business wrote it. The sidebar chip and the document pill show any status;
  the recognised ones keep their colours and the rest sit neutral.
- Previously the field was a fixed six-option list, so editing a document whose status was not on
  it silently rewrote the status to Draft.

## 1.10.1

### An audit pass

- A statement of account said "Balance outstanding £0.00" beneath rows plainly stating otherwise,
  everywhere it was drawn. Its rows are documents with a running balance, not items with amounts,
  so its figures now come from those columns — charges billed, payments received, and a closing
  balance taken from the last stated balance rather than summed, because a running balance is
  already cumulative. The plain-text version also dropped those rows entirely; it now prints them
  as date, reference and figures.
- The full-bleed mastheads reached the card edge by cancelling the document padding with hardcoded
  negative margins, and the padding is not one number: it shrinks on narrow screens and on till
  rolls. Banded and Letterhead have overshot by 20px on any screen under 700px wide for as long as
  the responsive rule existed, clipping real text behind the card edge. The bleed now follows the
  padding through a variable, in the widget and in the exported file alike, and the stale literal
  copy in the media query — the reason the fix appeared not to take — is gone.
- The sidebar showed every total with the business currency's symbol, including on documents fixed
  in another currency. Each row now formats in its own currency.

## 1.10.0

### Four new layouts

- Slate: a full-width dark block, brand left and title right — the corporate letterhead. The logo
  sits on a white plate, and the status chip reads as a chip on the dark ground.
- Headline: the document's own word writ large across the top, set light and letterspaced, the way
  an editorial spread opens. Everything administrative drops to a quiet row beneath it.
- Rail: a thick accent edge down the left of the masthead, everything ranged left, for readers who
  scan a page top to bottom.
- Centred: mark, name, a short accent rule, then the word and number, stacked on the centre line
  like an engraved card. The most formal of the eight, and the one that flatters a good logo most.

All four follow the accent colour, carry the logo, print full-bleed where they should, and appear
in the downloaded HTML file with the same design as on screen — the exported stylesheet is now
guarded by a test so a masthead can never exist on screen only. Four trades pick up the new looks
as their starting point: agencies open with Headline, software with Slate, garages with Rail and
legal practices with Centred.

## 1.9.0

### The mail-client route

- The invoice now travels in the body as text, so the email carries the document rather than
  referring to one the recipient has not been given. A mailto: body is text/plain by definition,
  which is why the HTML version cannot be used there; the text form is written to stay short
  enough for the mailto ceiling — an ordinary invoice lands around 1,300 characters against a
  practical limit of about 2,000, and the existing guard still catches the rest.
- The chosen file is saved as the mail client opens, rather than waiting behind a separate button.
  A mailto: cannot attach anything, so the next thing anybody does is go looking for the file; it
  is now already in the downloads bar, under the name the body quotes.
- Field rules are shared with the screen and the PDF, so a delivery note shows no prices in the
  text version for the same reason it shows none anywhere else.

## 1.8.0

### What goes with the message

- The attachment is now a choice: a PDF, an HTML file that opens in any browser, or nothing at all.
  It was hardcoded to the PDF. Whether the invoice is also laid out in the body of the email stays
  a separate question, because the two solve different problems: the attachment is what a client
  files, the body is what a client who will not open attachments actually reads.
- Both have a saved default in Settings → Sending and can be changed for one send in the Send
  panel.
- The notes that name the attached file follow the choice, so the mail-client route no longer
  promises a file when nothing is being attached.

## 1.7.0

### Your own wording

- Settings gains a Messages tab, one editor per event the way WooCommerce lists its emails:
  invoice sent, quote sent, the three reminders, payment received. The built-in text sits in the
  fields so editing starts from something that works; Reset takes an event back to stock.
  Placeholders — {number}, {total}, {days_overdue} and the rest — are listed in the tab and filled
  in per document, and an unknown one stays visible rather than being blanked, so a typo shows
  itself.
- Saved wordings existed in the stored settings from the start and were never consumed. They now
  layer under whatever is typed for one send, in the one function every route calls — so a saved
  wording reaches the mail client, the clipboard, the outbox and the endpoint alike.
- The Make recipe now covers the Direct route, including the mapping that turns the payload's
  base64 PDF back into a real attachment. The PDF was always in the payload; the recipe never said
  how to use it.

## 1.6.1

### Currency, properly

- Setup stamped the currency of the moment into every sample invoice row, and a stored currency
  outranks the setting — so changing the business currency later visibly did nothing, forever.
  Rows are no longer stamped: an empty Currency cell means "the business currency, whatever it is
  set to", and only a currency typed on a document deliberately fixes that document.
- New documents follow the same rule. The composer's Currency field is empty by default, shows the
  business currency as its placeholder, and says what empty means.
- Clearing the field on an existing document now actually clears the stored override on save. The
  write plan treated every empty value as "nothing to write"; for currency, empty is an
  instruction.
- A document fixed in another currency says so: one line above it names both currencies and offers
  Edit, instead of silently showing the old symbol.

## 1.6.0

### Composing

- Typing a line description now offers the catalogue as suggestions, and landing exactly on a name
  — three or more characters, or a click on the suggestion — fills the price, tax class and code in
  place, with the totals following. Nothing rebuilds while the cursor is in the row.
- A currency or separator changed in Settings now lands on the document immediately. The format was
  captured when a draft was made and never refreshed, so changing the setting visibly did nothing.
  A currency stored on the invoice row itself still wins: an issued invoice does not change
  currency because the business later did.

### The data drawer

- The mapping report — which tables were found, how, and what is missing — moves off the top of the
  page and into a Data drawer. The document is the focus; plumbing lives behind a door.
- The same drawer lets you choose the tables yourself: invoices, line items, clients and catalogue
  can each be pointed at a table when detection guesses wrong. Choices are saved with the document,
  columns inside a chosen table are still matched by name, and choosing is offered from the setup
  screen too.
- What still deserves attention shows as one line above the document with a button, never the full
  report.

### Settings and chrome

- Settings are tabbed: Business, Money & tax, Numbering, Document, Sending. One door per subject
  instead of one long corridor.
- Before a document is set up, a sample invoice drawn with the current settings stands in for a
  blank pane — and repaints as the settings change.
- The brand mark in the bar links to anupress.com.

## 1.5.0

### The application frame

- The invoice list is now a sidebar rather than a dropdown. Each row shows the number, the client,
  the amount and a status chip — Paid, Sent, Overdue, Part paid, Draft — so what needs chasing is
  visible at a glance, and clicking a row shows that document. A filter box narrows the list by
  number or client. On narrow screens the bar's picker takes over; one control or the other, never
  both.
- Settings and Send open in a drawer over the right edge instead of pushing the document off the
  page. The document stays visible while settings change, and on wide screens it shifts aside
  rather than being covered. Escape closes the drawer.
- The bar, the sidebar and the content each scroll on their own, so the frame fills the widget the
  way an application does rather than the way a page does.
- The Start from a trade section is gone from Settings. The trade is chosen once, during document
  setup, where it also builds the sample data — a second copy of the same control inside Settings
  asked a question that had already been answered.

## 1.4.0

### The chrome

- The top bar is now the same dark chrome Advanced Charts uses for its edit bar, with the ANUPRESS
  mark on a white plate, so the two widgets read as one family when they share a document. Its
  controls are translucent over the chrome with their own light chevron, and the mode pill shows a
  coloured dot plus a word: Connected, Read only, or Demo.
- One motion rhythm across the application: buttons, selects and inputs share a 150ms transition,
  pressed buttons give feedback by transform so nothing around them moves, and all of it is off
  under reduced-motion.
- Focused inputs show an accent ring; hovered ones darken their border. Panels share one elevation
  and one 10px radius, so the composer, the settings and the notices read as one surface system.

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
