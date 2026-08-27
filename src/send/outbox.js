// The outbox: a real table in the user's own document.
//
// This is the route that works when nobody is looking at the screen, and it is the only one that
// can. A browser cannot send email and cannot run while the tab is shut; Grist can. So the widget
// writes what it wants sent into a table, and Grist's own webhook — or an Automation — picks it up
// and delivers it. See the delivery notes in the README for why Grist's native "send an email"
// action cannot do the client-facing half itself.
//
// It is a visible table rather than a hidden queue on purpose. A person can see what is waiting,
// why, and what happened to it, in the same document as everything else — and can stop something
// going out by unticking a box.
//
// THE READY COLUMN IS THE MECHANISM. Grist webhooks take a boolean "ready column": a row is only
// visible to the webhook while it is true, and the false→true transition is itself the trigger. So
// a message is written held (false) and RELEASED (true) as a separate step. That gives review for
// free, and it means the trigger is the documented one rather than a hope that adding an
// already-ready row also counts.

export const OUTBOX_TABLE = 'ANUPRESS_Outbox';

/**
 * The table's shape.
 *
 * Flat and plain-typed on purpose: whatever is on the far end — a webhook, an Automation, a script
 * somebody wrote in an afternoon — receives these column names as JSON keys, so they are the
 * public interface of this feature and should read as such.
 */
export const OUTBOX_COLUMNS = [
  { id: 'Ready', label: 'Ready to send', type: 'Bool' },
  { id: 'ToEmail', label: 'To', type: 'Text' },
  { id: 'Cc', label: 'Cc', type: 'Text' },
  { id: 'Bcc', label: 'Bcc', type: 'Text' },
  { id: 'ReplyTo', label: 'Reply to', type: 'Text' },
  { id: 'Subject', label: 'Subject', type: 'Text' },
  { id: 'Body', label: 'Body', type: 'Text' },
  { id: 'BodyHtml', label: 'Body (HTML)', type: 'Text' },
  { id: 'DocumentNumber', label: 'Document', type: 'Text' },
  { id: 'DocumentKind', label: 'Kind', type: 'Text' },
  { id: 'DocumentTotal', label: 'Total', type: 'Numeric' },
  { id: 'DocumentCurrency', label: 'Currency', type: 'Text' },
  { id: 'DocumentDue', label: 'Due', type: 'Text' },
  { id: 'ClientName', label: 'Client', type: 'Text' },
  { id: 'Attachment', label: 'Attachment', type: 'Attachments' },
  { id: 'QueuedAt', label: 'Queued', type: 'DateTime' },
  { id: 'Status', label: 'Status', type: 'Choice',
    widgetOptions: JSON.stringify({ choices: ['Held', 'Ready', 'Sent', 'Failed'], choiceOptions: {} }) },
  { id: 'Result', label: 'Result', type: 'Text' },
];

const nowIso = () => new Date().toISOString();

/**
 * One message, as a row.
 *
 * `ready` is false by default — see the note above. Everything about the document travels with the
 * message so the far end never has to look anything up: an automation that has to fetch the
 * invoice to find its total is an automation that breaks the first time permissions change.
 */
export function buildOutboxRow(message, { html = '', ready = false } = {}) {
  const d = message.document || {};
  return {
    Ready: !!ready,
    ToEmail: message.to || '',
    Cc: message.cc || '',
    Bcc: message.bcc || '',
    ReplyTo: message.replyTo || '',
    Subject: message.subject || '',
    Body: message.body || '',
    BodyHtml: html || '',
    DocumentNumber: d.number || '',
    DocumentKind: d.kind || '',
    DocumentTotal: typeof d.total === 'number' ? d.total : null,
    DocumentCurrency: d.currency || '',
    DocumentDue: d.due || '',
    ClientName: d.client || '',
    QueuedAt: nowIso(),
    Status: ready ? 'Ready' : 'Held',
    Result: '',
  };
}

/** Create the outbox table, if the document has not got one. */
export function createOutboxActions() {
  return [['AddTable', OUTBOX_TABLE, OUTBOX_COLUMNS.map((c) => ({
    id: c.id, type: c.type, label: c.label,
    ...(c.widgetOptions ? { widgetOptions: c.widgetOptions } : {}),
  }))]];
}

/**
 * Release a held message.
 *
 * The false→true flip on the ready column is what a Grist webhook actually fires on, so this one
 * tiny action is the whole trigger. The status moves with it so the table reads correctly to a
 * person as well as to a machine.
 */
export function releaseActions(rowIds) {
  if (!rowIds || !rowIds.length) return [];
  return [['BulkUpdateRecord', OUTBOX_TABLE, rowIds, {
    Ready: rowIds.map(() => true),
    Status: rowIds.map(() => 'Ready'),
  }]];
}

/**
 * What to set up in Grist, written out for the person who has to do it.
 *
 * Generated rather than documented, because the table name, the column name and the destination are
 * all things this document decides — a generic instruction telling someone to "pick your ready
 * column" is where a five-minute setup becomes an evening.
 */
export function setupInstructions({ endpoint = '', authHeader = '' } = {}) {
  const url = endpoint || 'https://your-relay.example/send';
  return {
    title: 'Sending these automatically',
    steps: [
      {
        heading: '1. Somewhere for it to go',
        text: 'Grist can fire a webhook but cannot itself email a client — its own email action only reaches people who have access to the document. So the far end needs something of yours: a Cloudflare Worker, an n8n or Make scenario, a Zapier catch hook, or a small script on a server you already have. The recipes folder in this repository has all of them, ready to paste.',
      },
      {
        heading: '2. The webhook, in Grist',
        text: `Open Document Settings, then API, then Manage Webhooks, and add one:\n\n  Table            ${OUTBOX_TABLE}\n  Event types      add, update\n  Ready column     Ready\n  Filter columns   Ready\n  URL              ${url}` + (authHeader ? `\n  Authorization    ${authHeader}` : ''),
      },
      {
        heading: '3. What arrives',
        text: 'Grist posts a JSON array of the rows that became ready. Each one carries ToEmail, Subject, Body, BodyHtml and the document details, so your script has everything it needs without looking anything up.',
      },
      {
        heading: '4. Writing back',
        text: `When your script has sent one, have it set that row's Status to Sent and put anything useful in Result. Nothing here depends on that, but it turns the outbox into a delivery log you can actually read.`,
      },
    ],
    // The exact shape, so nobody has to send a test message to find out what the keys are called.
    samplePayload: JSON.stringify([{
      id: 1, Ready: true, ToEmail: 'accounts@example.com', Subject: 'Invoice INV-2026-0001 from Thornbury Works',
      Body: 'Hello…', BodyHtml: '<div>…</div>', DocumentNumber: 'INV-2026-0001', DocumentTotal: 1500,
      DocumentCurrency: 'GBP', ClientName: 'Kingfisher Print Works', Status: 'Ready',
    }], null, 2),
  };
}
