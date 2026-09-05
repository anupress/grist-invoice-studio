# Getting the widgets in front of Grist users

Three lists exist. They cost a day between them and reach more people than any amount of
writing on our own site, because they are where Grist users already look.

## 1. Grist's own gallery (the Custom widget picker)

The picker in every Grist installation reads
`https://github.com/gristlabs/grist-widget/releases/download/latest/manifest.json`, built from
the `gristlabs/grist-widget` repository. Every widget in it is hosted inside that repository, so
a listing is a pull request that adds a folder and a manifest entry. As of 2026-09-05 the list
holds 27 widgets, and its only invoicing entry is Grist Labs' own one-record HTML template.

What the pull request contains:

- A folder per widget, `invoice-studio/` and `advanced-charts/`, holding the built `dist/` of
  the release being submitted. The repository builds nothing of ours; the folder is the widget.
  Fonts and vendored files come with it. Total size matters little; the calendar widget ships a
  whole library.
- One entry per widget in `manifest.json`, in the repository's own schema. The entries below are
  ready to paste; only the `url` changes, to the repository's host.

```json
{
  "widgetId": "@anupress/widget-invoice-studio",
  "name": "Invoice Studio",
  "url": "https://gristlabs.github.io/grist-widget/invoice-studio/index.html",
  "published": true,
  "accessLevel": "full",
  "description": "Create, render and send invoices, quotes, receipts, credit notes, statements and delivery notes from the tables you already keep. PDF with embedded fonts, eight document languages, EU reverse charge and small-business exemptions, SEPA/UPI/payment-link QR codes, Factur-X, XRechnung and UBL e-invoices. Runs entirely in the browser: no server, nothing leaves your document.",
  "authors": [{ "name": "ANUPRESS", "url": "https://anupress.com" }],
  "lastUpdatedAt": "2026-09-05T00:19:10+02:00"
}
```

```json
{
  "widgetId": "@anupress/widget-advanced-charts",
  "name": "Advanced Charts",
  "url": "https://gristlabs.github.io/grist-widget/advanced-charts/index.html",
  "published": true,
  "accessLevel": "full",
  "description": "Turn a Grist table into a website-style dashboard: KPI cards, every ECharts chart type, group breakdowns, live tables, slicers and maps, edited in place. The design saves into your own Grist document, and your data is never sent anywhere: there is no server. Map blocks fetch tiles from public map providers.",
  "authors": [{ "name": "ANUPRESS", "url": "https://anupress.com" }],
  "lastUpdatedAt": "2026-09-05T00:15:43+02:00"
}
```

Two things to say in the pull request, because a maintainer will ask:

- **Access.** Both widgets ask for full document access and both READMEs explain why: Invoice
  Studio reads four tables and writes rows, columns and attachments back; Advanced Charts reads
  any table and saves its design into the document. Neither contacts a server of ours. Map
  blocks fetch tiles from public map providers, which the description states.
- **Updates.** Every release is a new pull request replacing the folder. That is the cost of
  being in the list, and it is why the version is in every file name the widget loads: a stale
  cache cannot mix two releases.

Before submitting: ask in the Grist community forum, in a post that links the live demos, whether
externally hosted entries are accepted. The repository's README does not say, and every current
entry is hosted inside it, so assume a folder is needed unless told otherwise.

## 2. The community-maintained lists

Two people keep public Grist documents listing custom widgets that are not in the gallery, and
the gallery's own README points readers to them:

- Heloise Ouvry's GristHub: https://docs.getgrist.com/9DZa7JFegUxz/GristHub
- Nick Bush's Community Widgets: https://grist-marketing.getgrist.com/oHQcp1bG7DS8/Community-Widgets

Each is a Grist document, so each has a way to add a row or a maintainer to write to. Submit both
widgets with the demo URLs, the repository URLs and the descriptions above.

## 3. Our own list, for self-hosted Grist

Both sites serve the same widget list:

- https://anupress.github.io/grist-invoice-studio/manifest.json
- https://anupress.github.io/grist-advanced-charts/manifest.json

A self-hosted Grist started with `GRIST_WIDGET_LIST_URL` set to either URL offers both widgets in
its Custom widget picker, with nothing to paste. The variable takes one URL and replaces Grist's
own list, so this suits an installation that wants these two; an installation that wants both
lists copies the two entries into a manifest of its own.

## And the forum

The Grist community forum has a `#showcase` category that the custom widget documentation
invites people to post in. One post per widget, with a screenshot and the demo link, is the
single cheapest thing on this page.
