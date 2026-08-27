# Invoice Studio — a custom widget for Grist (by ANUPRESS)

[![License: MIT](https://img.shields.io/badge/License-MIT-2563EB.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.1.0-0F1B2D.svg)](CHANGELOG.md)

Raise, render and send invoices from the tables your business already keeps — inside Grist, with no
server anywhere. Everything runs in the viewer's browser and your data never leaves your document.

> **Status: 1.0.** Every phase of the plan is built. It reads a document, works out how it holds
> invoices, draws one, computes tax for nine regions, creates and edits invoices, writes them back,
> sends them, produces a real PDF, and keeps your settings in your own document.
>
> **Not yet tested against a live Grist document.** Everything is verified against a bundled demo
> that mirrors Grist's own Invoicing template, and the PDF is verified in Chrome's PDF engine — but
> the write path has never run against a real document. Try it on a copy first.

## It already knows Grist's own Invoicing template

Grist ships an [Invoicing template](https://www.getgrist.com/templates/invoicing-template/), and it
is where most people start. Invoice Studio recognises that schema on sight — `Prepare_Invoices`,
`Items`, `Businesses`, and the column vocabulary its widget accepts — and maps itself with nothing
to configure. Point this at that document and it works immediately.

It also tells you what that template cannot do, because those limits are real:

| In the template | Why it matters |
|---|---|
| `Number` is the formula `$id + 51371` | Delete one invoice and every later number silently shifts |
| `Invoicer` is a hardcoded dict in a formula | Changing your own address means editing code |
| `Total` is a Text column, empty on every row | The only real total lives in a hidden summary table |
| `Businesses` has no email column | Nothing can ever be sent to anyone |
| The widget hardcodes US dollars | Every invoice it produces, anywhere, is in dollars |
| No status and no paid date | Nothing to age, nothing to chase, nothing to automate |

One button — **Upgrade this document** — adds the missing columns without renaming or removing
anything, and copies the old computed invoice numbers into the new stored column so nothing loses
its number. Running it twice does nothing.

## Try it without Grist

`index.html` runs in a plain browser tab against a bundled sample document that is a copy of the
shape of Grist's template, so the demo doubles as the compatibility proof:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/serve.ps1
# then open http://127.0.0.1:4178/
```

Any static server works — there is no build step in development, and no dependencies at runtime.

## The shared core

This repository is separate from [Advanced Charts](https://github.com/anupress/grist-advanced-charts),
which means the Grist bridge, the data provider, the theme, the sanitizer and the icon set exist in
both. They are not maintained twice. `src/core/` is **copied** from that repository by
`scripts/sync-core.mjs`, driven by `core.manifest.json`, and is read-only here.

```bash
npm run sync         # copy from ../WidgetIdea and refresh core.lock.json
npm run sync:check   # fail if anything under src/core/ has been edited, or has moved on upstream
npm run sync:list    # what is shared, and where each file lands
```

`sync:check` runs in CI on every push. If you need to change a core file, change it upstream and
re-sync; if the change belongs only to Invoice Studio, it does not belong in core — move it into a
module of our own and drop it from the manifest.

**One thing the two products must not share.** Advanced Charts stores its whole dashboard design in
`ANUPRESS_Config` under the key `site`, via the core's `saveConfig()`. Invoice Studio stores its
settings in the same table under `invoiceStudio`, through its own code in `src/settings/store.js`,
so both widgets can live in one document without either erasing the other. Never call the core's
`saveConfig()` from here — a test in `tests/settings.test.mjs` guards the boundary.

## Sending

A browser cannot send email. That is not a limitation we chose and there is no way around it, so
Invoice Studio is explicit about who does the sending instead. Four routes, cheapest first:

| Route | Setup | Leaves the browser? | Works with nobody watching |
|---|---|---|---|
| **Open in your mail client** | none | no — your OS does the handover | no |
| **Copy the message** | none | no | no |
| **Download the document** | none | no | no |
| **Outbox** — a table in your own document | one Grist webhook | Grist sends it, not us | **yes** |
| **Direct** — post to your own endpoint | paste a URL | yes, to *your* host | no |

The **Outbox** is the one that runs unattended, and it is worth understanding why it has to work
this way. Grist can fire a webhook when a row changes, whether or not anyone has this page open —
but its own *send an email* action only reaches people who have access to the document, so it
cannot email your client. So the widget writes the message into an `ANUPRESS_Outbox` table, you
release it, Grist's webhook fires, and something of yours delivers it. The
[`recipes/`](recipes/) folder has that something, ready to paste: a Cloudflare Worker, a Node relay
that speaks real SMTP, and setup steps for n8n, Make, Zapier and the Grist side itself.

Two things this deliberately will **not** do: store an SMTP password or a mail-provider API key —
they would sit in a table every editor of your document can read, and browsers cannot call those
APIs anyway — and send anything over plain `http` to a host that is not on your own machine.

## Privacy

ANUPRESS has no server. Every document is composed in the viewer's browser, and nothing is
transmitted to us — there is nothing of ours for it to be transmitted to.

**The one exception, stated plainly:** if you fill in the *Direct* endpoint, this page posts the
invoice, the client's name and address, and the message to the URL **you** typed. It is off until
you type one, it names the destination host on screen every time before you press send, and it goes
to your host rather than through ours. The Outbox route is the same bargain a step removed: your
document, your webhook, your sender.


## Repo map

```
src/core/     copied from Advanced Charts — read-only here
src/model/    schema recognition, role mapping, drafts, and the write PLAN
src/money/    rounding, the tax rate table, shipping, discounts, totals, numbering
src/doc/      document kinds, field visibility, layouts, the renderer
src/compose/  the composer and the send panel
src/send/     message templating and each delivery route
src/export/   the HTML document, and a hand-written PDF writer
src/templates/ fourteen trades, as starting points
src/settings/ what a business decides once, and where it is stored
src/grist/    the only code that actually writes to Grist
recipes/      the far end: Worker, SMTP relay, n8n, Make, Zapier, Grist setup
tests/        no framework — plain ES modules, one verdict per file
```

## License

[MIT](LICENSE) © 2026 ANUPRESS
