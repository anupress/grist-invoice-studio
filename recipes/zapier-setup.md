# Zapier — five minutes

1. **New Zap → Trigger → Webhooks by Zapier → Catch Hook.** Copy the URL it gives you.
2. Put that URL into Grist's webhook — see [grist-automation.md](grist-automation.md) — with the
   Ready column set to `Ready`.
3. In the widget: **Send → Queue it → Release it.** Zapier's "Test trigger" now has a real sample,
   which is why doing it in this order saves guessing at field names.
4. **Action → Email by Zapier → Send Outbound Email**, mapped:

   | Zapier field | From the payload |
   |---|---|
   | To | `ToEmail` |
   | Subject | `Subject` |
   | Body | `BodyHtml` (or `Body` for plain text) |
   | Reply To | `ReplyTo` |

5. Turn the Zap on.

**Worth knowing.** Email by Zapier sends from a Zapier address, which is fine for reminders and
wrong for anything a client should reply to — use a Gmail, Outlook or SMTP action instead to send
from your own address. Zapier also flattens the array Grist posts, so releasing three messages at
once runs the Zap three times; that is what you want, and it counts as three tasks.

Attachments do not travel this route: Grist's webhook carries the message, not the file. Attach the
document by hand, or use one of the code recipes, which take the file inline from the Direct route.
