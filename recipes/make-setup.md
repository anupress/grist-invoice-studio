# Make

1. **Custom webhook** module. Copy the address.
2. Point Grist's webhook at it — see [grist-automation.md](grist-automation.md).
3. In the widget: **Send → Queue it → Release it**, then press *Redetermine data structure* in Make
   so it learns the real shape rather than you typing the field names.
4. **Iterator** module over the array — Grist posts several rows when several are released, and
   without this only the first is sent.
5. **Email → Send an email**, mapped:

   | Make field | From the payload |
   |---|---|
   | To | `ToEmail` |
   | Subject | `Subject` |
   | Content type | HTML |
   | Content | `BodyHtml` |

6. Optional: a **Grist → Update a record** module setting `Status` to `Sent`.

**Worth knowing.** Make answers the webhook as soon as it accepts it, so retries are not the hazard
here that they are elsewhere. Attachments do not travel via Grist's webhook — attach by hand, or use
the Direct route below, which carries the file inline.

## Direct route (with the PDF attached)

The widget's **Send → Send to it now** posts one JSON object per send, and it carries the invoice
as a base64 PDF in `attachment`. Same webhook module; skip the Iterator (one object, not an
array). Send once from the widget, press *Redetermine data structure*, then map:

| Make field | From the payload |
|---|---|
| To | `to` |
| Subject | `subject` |
| Content type | HTML |
| Content | `html` |
| Attachments → File name | `attachment.fileName` |
| Attachments → Data | `toBinary(attachment.content; base64)` |

`toBinary(…; base64)` is the important half: `attachment.content` is base64 text and
`attachment.contentType` says `application/pdf`; decoding it in the mapping is what turns it
back into the file. Without it the client receives a text file full of letters.
