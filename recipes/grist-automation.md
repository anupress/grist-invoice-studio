# The Grist side

Read this one whichever recipe you pick — it is the half that lives in your document.

## The webhook (this is the one that matters)

**Document Settings → API → Manage Webhooks → Add Webhook**

| Field | Value |
|---|---|
| Table | `ANUPRESS_Outbox` |
| Event types | `add` and `update` |
| **Ready column** | `Ready` |
| Filter for changes in these columns | `Ready` |
| URL | your Worker, relay, n8n, Make or Zapier URL |
| Header Authorization | the same value you set as `SHARED_SECRET`, if you set one |

**The Ready column is the whole mechanism.** A row is invisible to the webhook while `Ready` is
false, and the moment it flips to true Grist treats that as an *add* event and fires. That is why
the widget queues a message **held** and releasing it is a separate button: releasing is the trigger.
It also means you can look at what is about to go out and untick anything you have changed your mind
about.

Setting the filter to `Ready` as well stops the webhook firing again every time your script writes
`Status` or `Result` back onto the row.

**Self-hosted:** if `ALLOWED_WEBHOOK_DOMAINS` is set on your instance, your endpoint's host has to be
on that list, or the webhook silently goes nowhere.

## What Grist sends

A JSON array of the rows that just became ready — several at once if you release several at once.
See the [keys](../README.md#what-arrives) in the recipes README.

## Automations, and what they are good for

**Tools → Automations** can watch a table and act on it, with conditions in Python. Two useful jobs,
and one it cannot do.

### Chasing overdue invoices, unattended

This is the thing nobody gets round to, and the reason the whole feature exists. Add an automation on
your **invoice** table with a condition like:

```python
$Due and (NOW().date() - $Due).days == 3 and $Status not in ("Paid", "Cancelled")
```

…and repeat it at 14 and 30 days with different wording. The widget's send panel uses exactly these
thresholds when it suggests a message, so what you set up here matches what you would have sent by
hand.

Have the automation's action write a row into `ANUPRESS_Outbox` with `Ready` true, and your webhook
does the rest.

### Telling *yourself* something happened

Grist's **Send an email** action is genuinely useful here — a note to you when an invoice is paid,
or a daily nudge about what is overdue.

### What it cannot do

> Only users with access to a document will receive emails.

That is Grist's rule, and a dynamic recipient column does not get round it. **Your client is not a
collaborator on your accounts document, so Grist cannot email them.** This is the single fact that
shapes the entire delivery design: Grist's own email is for you and your colleagues, and reaching a
customer means going out through a webhook to something of yours.

If your Grist is self-hosted and automation emails arrive nowhere at all, check SMTP is configured on
the instance — it fails quietly when it is not.

## A first test, before you trust it

1. Point the webhook at <https://webhook.site> and copy the URL it gives you.
2. In the widget: **Send → Queue it → Release it**.
3. Watch the request arrive, and check the keys are what your script expects.
4. Only then swap the URL for your real endpoint.

Doing it in this order means the first thing you get wrong is visible on a web page rather than in a
client's inbox.
