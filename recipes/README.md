# Recipes — the far end

Invoice Studio composes an invoice and its covering message. Something has to actually send it, and
that something is yours. This folder is that something, ready to paste.

**Why you need any of this.** A browser cannot send email — there is no way around that — and
Grist's own "send an email" automation only reaches people who have access to the document, so it
cannot email your client. What Grist *can* do is fire a webhook, unattended, when a row changes.
So: the widget writes the message into an `ANUPRESS_Outbox` table, Grist fires a webhook when you
release it, and one of these picks it up and sends it. Nothing passes through ANUPRESS at any point,
because there is no ANUPRESS server for it to pass through.

## Pick one

| | What it is | Good when |
|---|---|---|
| [`cloudflare-worker/`](cloudflare-worker/) | ~60 lines, deploys free, no server | You want the shortest path from nothing to working |
| [`node-smtp-relay/`](node-smtp-relay/) | A small Node service speaking real SMTP | You already have a box, or you must send through your own mail server |
| [`n8n-setup.md`](n8n-setup.md) | Steps for a self-hosted or cloud n8n | You already run n8n |
| [`make-setup.md`](make-setup.md) | Steps for a Make scenario | You already use Make |
| [`zapier-setup.md`](zapier-setup.md) | Catch Hook → Email by Zapier | You already use Zapier and want it done in five minutes |
| [`grist-automation.md`](grist-automation.md) | The Grist side: webhook, Automations, and internal alerts | Read this one whichever you pick |

The four `-setup.md` files are written instructions rather than importable blueprints on purpose. A
blueprint that will not import — because the platform changed its schema, or because it was written
against a different plan tier — costs more time than the ten steps it replaces. The two code recipes
are code because code either runs or does not.

## What arrives

Grist posts a JSON **array** of the rows that just became ready. Each row is flat, and these are the
keys — they are the interface, so they will not be renamed:

```json
[{
  "id": 1,
  "Ready": true,
  "ToEmail": "accounts@example.com",
  "Cc": "", "Bcc": "", "ReplyTo": "you@yourbusiness.example",
  "Subject": "Invoice INV-2026-0001 from Thornbury Works",
  "Body": "Hello…",
  "BodyHtml": "<div>…</div>",
  "DocumentNumber": "INV-2026-0001",
  "DocumentKind": "invoice",
  "DocumentTotal": 1500,
  "DocumentCurrency": "GBP",
  "DocumentDue": "19 Aug 2026",
  "ClientName": "Kingfisher Print Works",
  "Status": "Ready"
}]
```

The **Direct** route in the send panel posts a slightly different, single-object payload straight
from the browser — `{ source, version, to, subject, text, html, document, attachment }` — because it
is not going through Grist. Both worked examples below handle either shape.

## Two things worth getting right

**Answer quickly.** Grist retries a webhook that fails, so a slow or erroring endpoint produces
duplicate emails. Accept the request, answer `200`, and do the sending afterwards.

**Say what happened.** Write `Status` back to `Sent` or `Failed` on the row, and put anything useful
in `Result`. Nothing depends on it, but it is what turns the outbox from a queue into a delivery log
somebody can actually read when a client says they never got the invoice.
