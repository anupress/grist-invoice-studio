// Sending a document.
//
// One panel, one message, several ways out. The message is composed once and every route below
// takes the same object, so what a person reads on screen is exactly what leaves — there is no
// second rendering path that could disagree.
//
// The routes are ordered by what they cost the person using them, cheapest first. Opening their own
// mail client needs nothing and transmits nothing; posting to an endpoint needs a URL and is the
// only thing here that reaches outside the browser at all. That ordering is the honest one, and it
// is also the useful one: most people will never scroll past the first three.

import { el } from '../core/util.js';
import { buildMessage, templatesFor, findTemplate } from '../send/message.js';
import { suggestTemplate, stampAfterSend } from '../send/rules.js';
import { buildMailto, openMailClient } from '../send/mailto.js';
import { copyMessage, messageToHtml } from '../send/clipboard.js';
import { documentToEmailHtml } from '../send/email-document.js';
import { documentToPlainText } from '../send/document-text.js';
import { buildOutboxRow, setupInstructions } from '../send/outbox.js';
import { buildPayload, postToEndpoint, checkEndpoint, destinationHost } from '../send/endpoint.js';
import { fileNameFor } from '../export/html-file.js';
import { downloadPdf, downloadHtml, downloadEInvoice, attachmentFor, wantsEmbeddedFonts } from '../export/download.js';
import { einvoiceModel, checkEInvoice, profileOf, EINVOICE_FORMATS, isEInvoiceFormat } from '../einvoice/index.js';
import { warmEmbeddedFonts } from '../export/pdf/font-loader.js';
import { field, textInput, textArea, selectInput, button, section } from './ui.js';

/**
 * Build the panel.
 *
 * `actions.queue`, `actions.release` and `actions.recordSend` are supplied by the app because they
 * write to the document; everything else happens here.
 */
export function renderSendPanel(ctx) {
  const { draft, settings, live, canWrite, actions, onClose } = ctx;

  // Local, unsaved state: which template, and whatever the user has typed over it.
  const state = {
    templateId: suggestTemplate(draft),
    subject: null,
    body: null,
    to: null,
    endpoint: settings.endpoint || '',
    // Both seeded from Settings → Sending, and changeable for this one send. They answer different
    // questions: what the client can FILE (the attachment) and what the client can READ without
    // opening anything (the body). A mailto: cannot carry a file at all, which is the case the
    // body option exists for.
    attachFormat: settings.attachFormat || 'pdf',
    includeDocument: settings.includeInBody !== false,
    lastQueuedRow: null,
  };

  // If this document's PDF will need the embedded fonts, start fetching them now, while the
  // person is still reading the panel — so the download that follows their click is immediate
  // rather than waiting on a file the click could have started earlier.
  // An e-invoice profile means a Factur-X may be asked for, and Factur-X always embeds its fonts.
  const einvoiceOn = !!settings.einvoice?.profile;
  try { if (einvoiceOn || wantsEmbeddedFonts(draft, settings)) warmEmbeddedFonts(); } catch { /* the download path has its own fallback */ }

  const statusLine = el('div', { class: 'snd-status' });
  const say = (text, kind = '') => {
    statusLine.className = 'snd-status' + (kind ? ' is-' + kind : '');
    statusLine.textContent = text;
  };

  const message = () => buildMessage(state.templateId, draft, settings, {
    subject: state.subject, body: state.body, to: state.to,
  });

  // ---- the message ----------------------------------------------------------------------------
  const subjectInput = textInput(message().subject, (v) => { state.subject = v; }, { placeholder: 'Subject' });
  const bodyInput = textArea(message().body, (v) => { state.body = v; }, { rows: 10 });
  const toInput = textInput(message().to, (v) => { state.to = v; }, { placeholder: 'nobody@example.com', type: 'email' });

  const repaintMessage = () => {
    const m = message();
    subjectInput.value = m.subject;
    bodyInput.value = m.body;
  };

  const templateChooser = selectInput(
    templatesFor(draft.kind).map((t) => ({ value: t.id, label: t.label })),
    state.templateId,
    (v) => {
      state.templateId = v;
      // Choosing a different message replaces what is in the boxes. Anything typed over the old one
      // is discarded — silently keeping it would produce a hybrid nobody wrote.
      state.subject = null; state.body = null;
      repaintMessage();
      say(`Switched to “${findTemplate(v).label}”.`);
    }, { ariaLabel: 'Which message' });

  const includeToggle = selectInput(
    [{ value: 'yes', label: 'Yes — the invoice follows your message' }, { value: 'no', label: 'No — a covering note only' }],
    state.includeDocument ? 'yes' : 'no',
    (v) => { state.includeDocument = v === 'yes'; }, { ariaLabel: 'Show the invoice under the message' });

  // The attachment is a separate question from the body, and both have a real answer. Changing it
  // repaints the notes that name the file, so what the buttons promise stays true.
  // No HTML file here. A client who cannot open a PDF is not helped by a second file they also
  // have to open — what helps is the invoice being IN the message, which is the next control
  // down. The HTML file remains a download, for automations that want to read one.
  const attachToggle = selectInput(
    [
      { value: 'pdf', label: 'PDF — the usual' },
      ...(einvoiceOn ? EINVOICE_FORMATS.map((f) => ({ value: f.id, label: f.label })) : []),
      { value: 'none', label: 'Nothing — the invoice in the message only' },
    ],
    state.attachFormat,
    (v) => { state.attachFormat = v; paintCheck(); }, { ariaLabel: 'What to attach' });

  // ---- the e-invoice check -----------------------------------------------------------------------
  // What a receiver's validator would say, said here first. Shown whenever a profile is set, so a
  // business that sends e-invoices sees the state of every document; louder when the format about
  // to be attached IS an e-invoice, because then an error means a rejection.
  const checkBox = el('div', { class: 'snd-check' });
  let checkResult = null;
  function paintCheck() {
    checkBox.replaceChildren();
    if (!einvoiceOn) return;
    const model = einvoiceModel(draft, settings);
    checkResult = checkEInvoice(model);
    const items = [...checkResult.errors, ...checkResult.warnings];
    const profile = profileOf(settings.einvoice.profile);
    const heading = el('div', { class: 'snd-check__head' }, [
      el('strong', { text: checkResult.ok ? `Ready as an e-invoice (${profile.label.split(' — ')[0]}).` : `Not yet a valid e-invoice (${profile.label.split(' — ')[0]}).` }),
      el('span', { class: 'snd-check__count', text: items.length ? `${checkResult.errors.length} to fix, ${checkResult.warnings.length} to consider` : 'Nothing to fix.' }),
    ]);
    checkBox.className = 'snd-check' + (checkResult.ok ? ' is-ok' : ' is-warn');
    checkBox.appendChild(heading);
    if (items.length) {
      checkBox.appendChild(el('ul', {}, items.map((i) => el('li', { class: 'is-' + i.level }, [
        el('code', { text: i.code }), el('span', { text: ' ' + i.text }),
      ]))));
    }
  }
  paintCheck();

  const einvoiceBtn = einvoiceOn ? button('Download e-invoice', async () => {
    const format = isEInvoiceFormat(state.attachFormat) ? state.attachFormat : 'facturx';
    if (checkResult && !checkResult.ok) { say('Fix the e-invoice errors listed above first — a receiver would reject this file.', 'warn'); return; }
    einvoiceBtn.disabled = true;
    try {
      const res = await downloadEInvoice(draft, settings, format);
      say(`Saved ${res.fileName} — ${Math.round(res.bytes / 1024)}KB, ${EINVOICE_FORMATS.find((f) => f.id === format).label.split(' — ')[0]}.`, 'ok');
    } catch (e) {
      say('The e-invoice could not be made: ' + (e?.message || e), 'warn');
    }
    einvoiceBtn.disabled = false;
  }) : null;

  // ---- routes ----------------------------------------------------------------------------------
  // A mailto: cannot carry a file, so the body says one is coming and the person attaches the file
  // they downloaded. Naming it exactly means they know which to pick out of their downloads — and
  // when nothing is being attached, promising an attachment would simply be untrue.
  const attachedFile = () => {
    if (state.attachFormat === 'none') return null;
    const name = fileNameFor(draft);
    if (state.attachFormat === 'ubl' || state.attachFormat === 'cii') return name.replace(/\.html$/, '.xml');
    return name.replace(/\.html$/, '.pdf');
  };
  const fileNoteNow = () => {
    const name = attachedFile();
    return name ? `The ${draft.kind === 'quote' ? 'quote' : 'invoice'} is attached as ${name}.` : '';
  };

  const mailBtn = button('Open in mail client', async () => {
    const m = message();
    if (!m.to) { say('There is no address to send it to.', 'warn'); return; }

    // A mailto: body is text/plain by definition, so the HTML version cannot travel here. The
    // invoice goes in as text instead, which is the difference between a covering note referring
    // to a document and an email that actually carries one.
    const opts = {
      attachmentNote: fileNoteNow(),
      documentText: state.includeDocument ? documentToPlainText(draft, settings) : '',
    };
    const built = buildMailto(m, opts);

    // The file is saved on the way out rather than left to a separate button. A mailto: cannot
    // attach anything, so the next thing anybody does is go looking for the file; saving it as the
    // client opens puts it in the downloads bar under the name the body just quoted.
    let saved = null;
    if (state.attachFormat === 'pdf') saved = await downloadPdf(draft, settings);
    else if (isEInvoiceFormat(state.attachFormat)) saved = await downloadEInvoice(draft, settings, state.attachFormat);

    openMailClient(m, opts);
    const savedNote = saved ? saved.fileName + ' is in your downloads — attach it before you send.' : '';
    say(built.truncated
      ? 'Opened your mail client. The body was too long for a mailto link and has been shortened, so check it before sending. ' + savedNote
      : savedNote
        ? 'Opened your mail client. ' + savedNote
        : 'Opened your mail client.', built.truncated ? 'warn' : 'ok');
    record(m, 'mail client');
  }, { variant: 'primary' });

  const copyBtn = button('Copy the message', async () => {
    const m = message();
    const res = await copyMessage(m, settings, { document: state.includeDocument ? documentToEmailHtml(draft, settings) : '' });
    say(res.ok ? (res.note || 'Copied, formatting and all. Paste it into your email.') : res.error, res.ok ? 'ok' : 'warn');
    if (res.ok) record(m, 'clipboard');
  });

  const pdfBtn = button('Download PDF', async () => {
    pdfBtn.disabled = true;
    try {
      const res = await downloadPdf(draft, settings);
      say(`Saved ${res.fileName} — ${Math.round(res.bytes / 1024)}KB. Attach it to your email.`, 'ok');
    } catch (e) {
      say('The PDF could not be made: ' + (e?.message || e), 'warn');
    }
    pdfBtn.disabled = false;
  });

  // Kept alongside the PDF because it is genuinely more useful in an automation: anything on the
  // far end of a webhook can read HTML without a PDF library.
  const htmlBtn = button('Download HTML', () => {
    const res = downloadHtml(draft, settings);
    say(`Saved ${res.fileName}. It opens in any browser, with no reader needed.`, 'ok');
  });

  // ---- outbox -----------------------------------------------------------------------------------
  const queueBtn = button('Queue it', async () => {
    const m = message();
    if (!m.to) { say('There is no address to send it to.', 'warn'); return; }
    const row = buildOutboxRow(m, { html: messageToHtml(m, settings, { document: state.includeDocument ? documentToEmailHtml(draft, settings) : '' }) });
    const res = await actions.queue(row);
    if (!res.ok) { say(res.error, 'warn'); return; }
    state.lastQueuedRow = res.rowId;
    releaseBtn.disabled = false;
    say(res.created
      ? 'Queued, and an Outbox table has been added to your document. It is held until you release it.'
      : 'Queued, and held. Release it when you are ready for it to go.', 'ok');
    record(m, 'outbox');
  });

  const releaseBtn = button('Release it', async () => {
    if (state.lastQueuedRow == null) return;
    const res = await actions.release([state.lastQueuedRow]);
    say(res.ok
      ? 'Released. If a webhook is set up on the Outbox table, this is the moment it fires.'
      : res.error, res.ok ? 'ok' : 'warn');
    releaseBtn.disabled = true;
  }, { disabled: true });

  // ---- endpoint ----------------------------------------------------------------------------------
  const endpointInput = textInput(state.endpoint, (v) => {
    state.endpoint = v.trim();
    paintEndpoint();
  }, { placeholder: 'https://your-relay.example/send', type: 'url' });

  const endpointNote = el('p', { class: 'snd-endpoint__note' });
  const postBtn = button('Send to it now', async () => {
    const m = message();
    if (!m.to) { say('There is no address to send it to.', 'warn'); return; }
    postBtn.disabled = true;
    say(`Posting to ${destinationHost(state.endpoint)}…`);
    if (isEInvoiceFormat(state.attachFormat) && checkResult && !checkResult.ok) {
      say('The e-invoice has errors a receiver would reject. Fix them, or attach the ordinary PDF.', 'warn');
      postBtn.disabled = false;
      return;
    }
    const payload = buildPayload(m, {
      html: messageToHtml(m, settings, { document: state.includeDocument ? documentToEmailHtml(draft, settings) : '' }),
      // Nothing attached means no attachment key at all, rather than an empty one the far end
      // has to know to ignore.
      attachment: state.attachFormat === 'none' ? null : await attachmentFor(draft, settings, state.attachFormat),
    });
    const res = await postToEndpoint(state.endpoint, payload);
    postBtn.disabled = false;
    if (!res.ok) { say(res.error, 'warn'); return; }
    say(res.confirmed
      ? `Accepted by ${res.host}.`
      : res.note, res.confirmed ? 'ok' : 'warn');
    record(m, 'endpoint');
  });

  function paintEndpoint() {
    const check = checkEndpoint(state.endpoint);
    postBtn.disabled = !check.ok;
    if (!state.endpoint) {
      endpointNote.textContent = 'Nothing is sent anywhere until you put a URL here. It goes to you, never through us.';
      endpointNote.className = 'snd-endpoint__note';
      return;
    }
    endpointNote.textContent = check.ok
      // Named every time rather than once in settings: this is the only control on the page that
      // takes an invoice out of the browser, and the person pressing it should see where to.
      ? `This document, this client's name and address, and ${message().to || 'the recipient'} will be posted to ${check.host}.`
      : check.problem;
    endpointNote.className = 'snd-endpoint__note' + (check.ok ? ' is-live' : ' is-warn');
  }
  paintEndpoint();

  /** Record that a message went, on the document itself. */
  function record(m, route) {
    if (!canWrite) return;
    actions.recordSend(stampAfterSend(draft, m, { route }));
  }

  const setup = setupInstructions({ endpoint: state.endpoint });

  return el('div', { class: 'snd' }, [
    el('div', { class: 'snd-bar' }, [
      el('strong', { text: `Send ${draft.number || 'this document'}` }),
      el('div', { class: 'snd-bar__spacer' }),
      button('Close', onClose),
    ]),

    section('The message', [
      field('Which message', templateChooser),
      field('To', toInput),
      field('Subject', subjectInput),
      field('Body', bodyInput),
      field('Attach', attachToggle,
        einvoiceOn
          ? 'The file the client keeps. Factur-X is a PDF with the invoice inside as XML, which German and French systems read automatically; UBL and CII are the bare XML for Peppol and XRechnung. Carried by the Outbox and Direct routes; a mailto: link cannot attach a file, so there you attach the download yourself.'
          : 'The file the client keeps — a PDF is what a bookkeeper expects. Carried by the Outbox and Direct routes; a mailto: link cannot attach a file, so there you attach the download yourself.'),
      checkBox,
      field('Show the invoice under your message', includeToggle,
        'The whole invoice, laid out in the email itself, below your text — tables and inline styles, so it survives Gmail and Outlook. A client who will not open an attachment can still read it, and a message whose attachment a filter stripped still says what is owed.'),
    ]),

    section('Send it yourself', [
      el('p', { class: 'snd-lead', text: 'Nothing leaves this browser. Your own mail client does the sending, from the address your client already recognises.' }),
      el('div', { class: 'snd-routes' }, [mailBtn, copyBtn, pdfBtn, einvoiceBtn, htmlBtn]),
    ]),

    section('Send it automatically', [
      el('p', { class: 'snd-lead', text: 'Messages go into an Outbox table in your own document, held until released. A Grist webhook on that table is what delivers them — including when nobody has this page open.' }),
      el('div', { class: 'snd-routes' }, [queueBtn, releaseBtn]),
      el('details', { class: 'snd-setup' }, [
        el('summary', { text: 'How to set that up, for this document' }),
        ...setup.steps.map((s) => el('div', { class: 'snd-setup__step' }, [
          el('h4', { text: s.heading }),
          el('pre', { text: s.text }),
        ])),
        el('h4', { text: 'What arrives, exactly' }),
        el('pre', { text: setup.samplePayload }),
      ]),
    ]),

    section('Send it straight to your own service', [
      el('p', { class: 'snd-lead', text: 'A Zapier or Make hook, an n8n scenario, a Cloudflare Worker, or anything else of yours. This is the only route that reaches outside the browser, and only while this page is open.' }),
      field('Your endpoint', endpointInput),
      endpointNote,
      el('div', { class: 'snd-routes' }, [postBtn]),
    ]),

    statusLine,
  ]);
}
