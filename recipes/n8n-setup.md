# n8n

1. **Webhook** node — method `POST`, and copy the production URL.
2. Point Grist's webhook at it — see [grist-automation.md](grist-automation.md).
3. Add an **Item Lists → Split Out** node on the body, because Grist posts an *array* of rows and
   the send node wants one at a time. This is the step people miss, and the symptom is exactly one
   email when three were released.
4. **Send Email** node (or Gmail / Microsoft Outlook), mapped:

   ```
   To Email    {{ $json.ToEmail }}
   Subject     {{ $json.Subject }}
   HTML        {{ $json.BodyHtml }}
   Text        {{ $json.Body }}
   Reply To    {{ $json.ReplyTo }}
   ```

5. Optional, and worth it: a **Grist** node afterwards updating the same row —
   `Status = Sent`, `Result = {{ $json.messageId }}` — which turns the outbox into a delivery log.

**Respond immediately.** Set the Webhook node to respond *When Last Node Finishes* only if your
workflow is fast; otherwise use *Immediately*. Grist retries a webhook that does not answer promptly,
and a retry is the client receiving the same invoice twice.

If your n8n runs on the same machine as your browser you can point the widget's **Direct** route
straight at `http://localhost:5678/webhook/...` — the widget allows plain http for loopback, and
that payload carries the document as an inline attachment.
