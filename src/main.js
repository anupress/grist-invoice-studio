// Invoice Studio — boot and app shell.
//
// Three steps, in this order, and everything else hangs off them: connect (or fall back to the
// bundled demo document), work out how this document holds invoices, draw one. The composer is a
// fourth thing layered on top rather than a different mode of the first three, which is why View
// and Compose show the same document rendered by the same code.
//
// The demo document is a copy of Grist's own Invoicing template, so the first thing anyone sees is
// what they would get by pointing this at that template — including its defects, reported.

import { el, clear, toast } from './core/util.js';
import { ANUPRESS_LOGO } from './core/assets/brand-logo.js';
import * as bridge from './core/grist/bridge.js';
import { DummyProvider, GristProvider } from './core/data/provider.js';
import { SAMPLE_DATA, SAMPLE_SENDER, SAMPLE_MONEY } from './data/sample.js';
import { detectSchema, upgradeChecklist, widgetColumns, detectProducts, productOptions, statusOptions } from './model/schema.js';
import { listInvoices, listClients, resolveInvoice, borrowCatalogueImages, clientParty } from './model/resolve.js';
import { nextDocument, lateFee, lateFeeLine, buildStatement, aging } from './model/lifecycle.js';
import { emptyDraft, normaliseDraft, recalc, convertDraft } from './model/draft.js';
import { buildWritePlan, describePlan, existingNumbers } from './model/write.js';
import { buildUpgradePlan } from './model/migrate.js';
import { savePlan, applyUpgrade, queueToOutbox, releaseOutbox, createStarterTables, revealColumns } from './grist/writer.js';
import { readViewMeta, hiddenColumns, forgetViewMeta } from './grist/views.js';
import { pageRuleFor, printFrame, printTitleFor, installPrintTitle } from './print.js';
import { renderSendPanel } from './compose/send-panel.js';
import { loadSettings, saveSettings, sanitise } from './settings/store.js';
import { numberFormatFor } from './settings/defaults.js';
import { renderSettingsPanel } from './settings/panel.js';
import { templatesBySector, findTemplate as findTradeTemplate, applyTemplate, templateSummary } from './templates/index.js';
import { starterTablesFor, SAMPLE_LINES, sampleBusinessFor } from './templates/starter.js';
import { removeSampleRows, saveRecord, removeRecord, uploadAttachment } from './grist/writer.js';
import { formFields, readRecord, recordPlan, recordName, ADDABLE } from './model/records.js';
import { asOptions, COUNTRIES, UNITS, taxClassesFor } from './model/suggest.js';
import { renderRecordForm } from './compose/record-form.js';
import { ROLES_BY_PART } from './model/schema.js';
import { missingFrom } from './templates/starter.js';
import { ensureFullAccess } from './grist/access.js';
import { computeTotals } from './money/totals.js';
import { assignNumber } from './money/numbering.js';
import { renderDocument, docDate } from './doc/render.js';
import { DOCUMENT_KINDS, documentKind, kindFromCell } from './doc/kinds.js';
import { languageOf, localiseKind } from './doc/lang.js';
import { LAYOUTS } from './doc/layouts.js';
import { renderComposer } from './compose/composer.js';
import { field, section } from './compose/ui.js';
import { buildPreset, findPreset, simpleRate, RATES_UPDATED } from './money/tax/rates.js';
import { exemptionFor } from './money/tax/exemptions.js';
import { formatMoney } from './money/currency.js';
import { APP_VERSION } from './version.js';


/**
 * Settings, with the tax table built from whichever preset is selected.
 *
 * The preset is stored by id and the rows rebuilt from it, rather than the rows being stored: a
 * saved copy of a rate table is a snapshot that silently goes stale, and the id says what the
 * business actually meant.
 */
function moneySettings(money) {
  // Simple mode is one typed rate, and it becomes an ordinary wildcard rate row so it goes through
  // exactly the same engine as a twenty-seven-country table. No second code path means no second
  // set of rounding behaviour to disagree with the first.
  if (money.taxMode === 'simple') {
    return {
      ...money,
      taxRates: simpleRate({ rate: money.simpleRate, name: money.simpleName }),
      taxPresetLabel: `${Number(money.simpleRate) || 0}% ${money.simpleName || 'Tax'}, everywhere`,
    };
  }
  if (money.taxMode === 'none') {
    return { ...money, taxEnabled: false, taxRates: [], taxPresetLabel: null };
  }

  const preset = money.taxPreset ? findPreset(money.taxPreset) : null;
  return {
    ...money,
    taxRates: preset ? buildPreset(money.taxPreset, money) : (money.taxRates || []),
    taxPresetLabel: preset ? preset.label : (money.taxRates || []).length ? 'Your own rate table' : null,
  };
}

const app = {
  provider: null,
  schema: null,
  products: null,
  // What is persisted, in the shape settings/defaults.js describes. The runtime view every other
  // module wants is computed from it by settingsNow() — one stored shape, one runtime shape, and a
  // single place that converts between them.
  stored: sanitise({}),
  live: false,
  currentRowId: null,
  kind: 'invoice',
  // null, not 'classic'. The bar's layout chooser is a per-session try-it-out that OVERRIDES the
  // business's stored choice — so it has to start as 'nothing chosen', or the stored layout can
  // never take effect and a template that sets one appears to do nothing.
  layout: null,
  setupTrade: 'freelancer',
  // 'demo' until connected, then 'full' or 'denied'. What Grist actually allows, not what was asked.
  access: 'demo',
  filter: '',        // the sidebar's search box
  mode: 'view',      // view | compose | send | settings
  draft: null,
  busy: false,
  // Set when a person chooses to edit an issued document anyway. Reset every time the composer
  // opens, so the choice is made per document rather than once and forgotten.
  unlocked: false,
  // Which list the sidebar shows: the invoices, the clients, or the catalogue. Clients and the
  // catalogue are edited in the body the same way an invoice is composed there.
  list: 'invoices',
  // The record open in the body when the mode is 'record': { kind: 'client'|'product', rowId }.
  record: null,
  // Columns that are in their tables but not on their pages — see grist/views.js. Read after every
  // rescan of a live document; always empty in the demo, which has no pages.
  hidden: [],
  // The draft most recently drawn on the page, whatever mode drew it — what Print prints.
  painted: null,
  // A document drawn from the ledger rather than read from a row — a client's statement of
  // account. Shown, printed and sent like any other; never saved. Cleared by choosing a row.
  transient: null,
};

const root = () => document.getElementById('studio-root');
// app.access, not bridge.accessLevel(): the core records the level that was ASKED for, and
// grist.ready() resolves whether or not the user allows it. app.access is what Grist actually
// permitted, established by trying it.
const canWrite = () => (app.live ? app.access === 'full' : true);

/**
 * The stored settings, flattened into what everything downstream actually asks for.
 *
 * Renderers want `paymentDetails` and `layout` at the top level; the money engine wants a `money`
 * object with its rate rows already built. Converting here rather than storing it this way keeps
 * the persisted shape tidy and versionable, and means there is exactly one place to look when a
 * setting does not appear to be taking effect.
 */
function settingsNow() { return settingsFrom(app.stored, app.kind, app.layout); }

/** The runtime settings for a stored shape — settingsNow() over something other than app.stored. */
function settingsFrom(st, kind, layout) {
  return {
    ...st.document,
    ...st.delivery,
    sender: st.business,
    money: moneySettings(st.money),
    // A standing exemption — the small-business scheme — reaches the totals engine as the reason
    // no tax is charged, so it is printed rather than merely absent.
    exempt: exemptionFor(st.money),
    einvoice: st.einvoice,
    // The saved message wordings ride along whole — buildMessage layers them under whatever is
    // typed for one send.
    messages: st.messages,
    numberFormat: numberFormatFor(st, kind),
    kind,
    // The bar's layout chooser is a per-session try-it-out; the stored one is the business's choice.
    layout: layout || st.document.layout,
  };
}

/**
 * The settings the sample document is drawn with while the trade is still being chosen.
 *
 * The same thing runSetup will do, done to a copy: the trade applied over the stored settings, the
 * trade's sample business standing in where there is none yet. So the preview under the chooser IS
 * what setting up would produce, and changing the trade changes it.
 */
function setupPreviewSettings() {
  const template = findTradeTemplate(app.setupTrade);
  const next = sanitise(template ? applyTemplate(template, app.stored) : app.stored);
  if (!String(next.business.name || '').trim()) {
    const { paymentDetails, ...identity } = sampleBusinessFor(app.setupTrade);
    next.business = { ...next.business, ...identity };
    if (!String(next.document.paymentDetails || '').trim()) next.document.paymentDetails = paymentDetails;
    if (next.money.currency === 'USD' && !next.money.homeCountry) {
      next.money.currency = 'GBP'; next.money.homeCountry = 'GB'; next.money.defaultCustomerCountry = 'GB';
    }
  }
  return settingsFrom(next, template?.kind || 'invoice', app.layout);
}

/**
 * The demo's settings.
 *
 * A filled-in example rather than an empty form, because the demo's job is to show what the thing
 * does. Anyone connecting a real document gets their own — and an empty business name is the first
 * thing the settings panel asks for.
 */
function seedDemoSettings() {
  return sanitise({
    business: { ...SAMPLE_SENDER },
    money: { ...SAMPLE_MONEY },
    document: {
      paymentDetails: sampleBusinessFor('construction').paymentDetails,
      closingText: 'Thank you for your custom.',
    },
  });
}

/** The provider's tables in the shape detectSchema wants: columns carried with each table. */
function tablesWithColumns(provider) {
  return (provider.tables() || []).map((t) => ({
    id: t.id, label: t.label || t.id, columns: provider.columns(t.id) || [],
  }));
}

function rescan() {
  const tables = tablesWithColumns(app.provider);
  // The person's stored table choices outrank detection — a guess never beats an answer. Their
  // column choices, one level down, outrank the name matching within a chosen table.
  const force = app.stored.tables || {};
  app.schema = detectSchema(tables, { force });
  app.products = detectProducts(tables, app.schema, { force: force.product, columns: (force.columns || {}).product });
}

/**
 * Which of the widget's columns are hidden from their pages, on a live document.
 *
 * Separate from rescan() because it is a network read, and rescan() is called from places that
 * cannot wait. Best-effort: a document whose page layout cannot be read simply gets no advice
 * about it. Callers redraw after it resolves.
 */
async function probeHidden() {
  app.hidden = [];
  if (!app.live || app.access !== 'full' || !app.schema?.invoice) return;
  const meta = await readViewMeta();
  if (meta) app.hidden = hiddenColumns(meta, widgetColumns(app.schema, app.products));
}

/** Put the hidden columns on their pages, then say so. */
async function runReveal() {
  if (app.busy || !app.hidden.length) return;
  app.busy = true;
  const res = await revealColumns(app.hidden, { live: app.live });
  app.busy = false;
  if (!res.ok) { toast(res.error || 'Could not change the pages.', 'err'); return; }
  await probeHidden();
  toast(`${res.revealed === 1 ? 'The column is' : `${res.revealed} columns are`} now on ${res.revealed === 1 ? 'its page' : 'their pages'}.`, 'ok');
  render();
}

async function boot() {
  console.info('[Invoice Studio] v' + APP_VERSION);
  installPrintTitle(() => (app.painted ? printTitleFor(app.painted) : ''));
  const connected = await bridge.connect();

  // Before anything is read. The core connects at "read table", and at that level Grist refuses to
  // list the document's tables — which the core reports as an empty list, so a document full of
  // invoices arrives looking like a document with none. Every table this widget needs is a table
  // other than the one it is placed on, so there is nothing it can usefully do at that level and no
  // reason to defer asking.
  if (connected) {
    const access = await ensureFullAccess();
    app.access = access.ok ? 'full' : 'denied';
    if (!access.ok) console.warn('[Invoice Studio] full access was not granted', access.message || '');
  }

  // Load whatever this document already knows about the business before anything is drawn, so the
  // first document a person sees carries their own name rather than a placeholder they then have
  // to watch being replaced.
  app.stored = connected ? await loadSettings() : seedDemoSettings();

  if (connected) {
    const gp = new GristProvider();
    await gp.init();
    app.provider = gp;
    app.live = true;
    rescan();
    const wanted = [app.schema.invoice?.table, app.schema.line?.table, app.schema.client?.table, app.products?.table].filter(Boolean);
    if (wanted.length) await gp.prime(wanted);
    await probeHidden();
  } else {
    // ?empty exercises the setup path, which is otherwise unreachable in the demo because the
    // bundled document already has tables in it. ?trade=<id> goes one step further and builds
    // that trade's starter document in memory — every sample business, one URL each, which is
    // how the trades are shown side by side without a Grist document for each.
    const params = new URLSearchParams(location.search);
    const trade = findTradeTemplate(params.get('trade')) ? params.get('trade') : '';
    const emptyDoc = params.has('empty') || !!trade;
    app.provider = new DummyProvider(emptyDoc ? { defaultTable: null, tables: {} } : SAMPLE_DATA);
    app.live = false;
    if (trade) {
      app.stored = sanitise({});
      app.setupTrade = trade;
      await runSetup(trade);
      return;
    }
    rescan();
  }
  render();
}

// ---------------------------------------------------------------------------------------------
// Composing
// ---------------------------------------------------------------------------------------------

function currentRow() {
  const s = app.schema;
  if (!s?.invoice) return null;
  const rows = app.provider.records(s.invoice.table) || [];
  return rows.find((r) => r.id === app.currentRowId) || rows[0] || null;
}

/** Build the draft the composer edits, from a row or from nothing. */
function startCompose(row) {
  const settings = settingsNow();
  app.unlocked = false;
  app.transient = null;
  if (row) {
    app.draft = resolveInvoice(row, app.schema, app.provider, settings);
    // The same borrow the view applies, or a line's picture would vanish the moment Edit opened.
    if (app.products) app.draft.lines = borrowCatalogueImages(app.draft.lines, app.products, app.provider);
    // The resolver's flat fallback invents one line standing for the invoice's amount. That is
    // right for reading a document and wrong for editing one — it would be saved as a real line
    // item nobody typed.
    app.draft.lines = app.draft.lines.filter((l) => l.itemised);
    if (!app.draft.lines.length) app.draft.lines = [blank()];
    attachLineRowIds(app.draft, row);
  } else {
    app.draft = emptyDraft(app.kind, settings);
    app.draft.client = { name: '' };
  }
  app.draft = recalc(app.draft, settings);
  app.mode = 'compose';
  render();
}

const blank = () => ({ description: '', quantity: 1, unitPrice: 0, amount: 0 });

/**
 * Remember which table row each line came from.
 *
 * Without this every save would delete the existing lines and add them back, which works but fills
 * the document's history with churn and changes row ids other things may point at.
 */
function attachLineRowIds(draft, row) {
  const s = app.schema;
  if (!s.line) return;
  const R = s.line.roles;
  const number = s.invoice.roles.number ? String(row[s.invoice.roles.number] ?? '') : '';
  const mine = (app.provider.records(s.line.table) || []).filter((r) => {
    const link = R.invoiceLink ? r[R.invoiceLink] : null;
    return link != null && link !== '' && (link === row.id || (number && String(link) === number));
  });
  draft.lines.forEach((l, i) => { if (mine[i]) l.rowId = mine[i].id; });
}

function existingLineRowsFor(rowId) {
  const s = app.schema;
  if (!s.line || rowId == null) return [];
  const R = s.line.roles;
  return (app.provider.records(s.line.table) || []).filter((r) => R.invoiceLink && r[R.invoiceLink] === rowId);
}

/**
 * Is the document being composed one that has already gone out?
 *
 * A saved document whose status has moved past Draft has, in most of Europe, become a legal
 * record that must not be altered; corrections are a credit note. The composer opens it
 * read-only and says so, with the credit note one click away — and with an "edit anyway" for the
 * business that knows better about this one document.
 */
function composeLocked() {
  const d = app.draft;
  if (!d || app.unlocked) return false;
  if (app.stored.document.lockIssued === false) return false;
  // A document with no status at all — Grist's own template has no Status column — cannot be
  // told apart from a draft, so it is not locked: locking on ignorance would lock everything.
  const status = String(d.status || '').trim().toLowerCase();
  return d.rowId != null && status !== '' && status !== 'draft';
}

function buildPlan() {
  const s = app.schema;
  return buildWritePlan(app.draft, s, {
    invoiceColumns: app.provider.columns(s.invoice.table) || [],
    lineColumns: s.line ? (app.provider.columns(s.line.table) || []) : [],
    existingLineRows: existingLineRowsFor(app.draft.rowId),
  });
}

async function save() {
  if (app.busy) return;
  const s = app.schema;

  // A number is assigned once, here, at the moment the document becomes real — and never
  // recomputed afterwards. See money/numbering.js.
  if (!String(app.draft.number || '').trim()) {
    const assigned = assignNumber('', {
      existingNumbers: existingNumbers(s, app.provider),
      // Per kind: a quote and an invoice raised the same day are different documents and must not
      // share a number.
      format: numberFormatFor(app.stored, app.draft.kind),
      date: new Date(app.draft.issued || Date.now()),
    });
    app.draft.number = assigned.number;
    for (const w of assigned.warnings || []) toast(w, 'warn');
  }

  const plan = buildPlan();
  if (!plan.ok && !plan.invoice?.fields) { toast(plan.problems[0] || 'Nothing to save.', 'err'); return; }

  app.busy = true;
  const res = await savePlan(plan, app.provider, { live: app.live });
  app.busy = false;

  if (!res.ok) { toast(res.error || 'Could not save.', 'err'); render(); return; }

  app.draft.rowId = res.rowId;
  app.currentRowId = res.rowId;
  rescan();
  // Anything that could not be kept is said once, on the way out, rather than buried in a panel
  // nobody opens — a purchase-order number typed into a document with nowhere to put it is
  // exactly the kind of thing a person needs to hear about immediately.
  const dropped = (plan.skipped || []).filter((sk) => sk.where === 'invoice');
  toast(dropped.length
    ? `Saved — but ${dropped.length} field${dropped.length === 1 ? '' : 's'} could not be kept: ${dropped.map((d) => d.role).join(', ')}.`
    : 'Saved.', dropped.length ? 'warn' : 'ok');

  app.mode = 'view';
  render();
}

/**
 * Write down that a message went out.
 *
 * Best-effort and quiet on failure: the message HAS gone, and an error saying it could not be
 * recorded must never read as though it did not go. The worst case is a document that has to be
 * marked sent by hand, which is recoverable; telling somebody their invoice failed to send when it
 * is already in the client's inbox is not.
 */
async function recordSend(stamp) {
  const row = currentRow();
  if (!row || !app.schema?.invoice) return;
  const settings = settingsNow();
  const d = resolveInvoice(row, app.schema, app.provider, settings);
  d.status = stamp.status;
  d.sentAt = stamp.sentAt;
  d.sentTo = stamp.sentTo;
  // The lines are untouched, so they are left out of the plan entirely rather than rewritten.
  d.lines = [];

  const plan = buildWritePlan(d, app.schema, {
    invoiceColumns: app.provider.columns(app.schema.invoice.table) || [],
    lineColumns: [],
  });
  plan.lines = null;
  const res = await savePlan(plan, app.provider, { live: app.live });
  if (!res.ok) {
    console.warn('[Invoice Studio] the message went, but the document could not be updated', res.error);
    return;
  }
  rescan();
  // Repaint the document, NOT the whole page.
  //
  // A full re-render rebuilds the send panel, and the panel holds state that has never been saved
  // anywhere: the recipient just typed in, the endpoint URL, an edited subject and body. Wiping
  // those the moment a message goes out means anyone sending by two routes — open the mail client,
  // then also queue it — loses their work between the two.
  if (app.mode === 'send') paintPreview();
  else render();
}

async function runUpgrade() {
  if (app.busy) return;
  const columnsByTable = {};
  for (const t of app.provider.tables() || []) columnsByTable[t.id] = app.provider.columns(t.id) || [];
  const plan = buildUpgradePlan(app.schema, columnsByTable, null, app.products);
  if (!plan.ok) { toast('This document already has everything.', 'ok'); return; }

  // No confirm() dialog. The panel this button sits inside already lists every column, the reason
  // for each and the assurance that nothing is renamed or removed — a modal repeating that would
  // be a second thing to dismiss rather than a second thought. A browser dialog inside an embedded
  // Grist widget is also a poor citizen: it blocks the host page, not just ours.
  app.busy = true;
  const res = await applyUpgrade(plan, app.provider, { live: app.live });
  app.busy = false;
  if (!res.ok) { toast(res.error || 'Could not add the columns.', 'err'); return; }
  rescan();
  await probeHidden();
  toast(`Added ${res.added} column${res.added === 1 ? '' : 's'}.`, 'ok');
  render();
}

/**
 * Re-read everything from the document, then draw again.
 *
 * Grist offers a custom widget no change notification to subscribe to, so without this the only
 * way to see rows edited in the document next door was to reload the whole widget. reload(), not
 * invalidate-and-prime: the latter replaces rows only, so a column added or renamed in Grist — or
 * a whole new table — stayed invisible. Refresh exists precisely to answer "what does the
 * document say now", so it re-reads the schema and the table list too. Settings are re-read for
 * the same reason: a colleague may have saved theirs from another tab.
 */
async function doRefresh() {
  if (app.busy) return;
  // The demo lives in this page; there is nothing newer to fetch. Saying so beats hiding the
  // button, because a control that exists on live and not in the demo reads as a broken demo.
  if (!app.live) {
    rescan();
    render();
    toast('The demo data lives in this page, so there is nothing newer to fetch — redrawn anyway.', 'ok');
    return;
  }
  app.busy = true;
  try {
    const wanted = (app.provider.tables() || []).map((t) => t.id);
    const { reloaded } = await app.provider.reload(wanted);
    app.stored = await loadSettings();
    rescan();
    forgetViewMeta();
    await probeHidden();
    toast(`Refreshed ${reloaded} table${reloaded === 1 ? '' : 's'} from your document.`, 'ok');
  } catch (e) {
    console.warn('[Invoice Studio] refresh failed', e);
    toast('Could not refresh — ' + (e?.message || 'unknown error'), 'err');
  }
  app.busy = false;
  render();
}

async function enableEditing() {
  // Through the probe, not bridge.escalateToFull() directly: ready() resolves whether or not the
  // user granted anything, and canWrite() reads app.access — asking without updating that leaves
  // the button "working" while every save still fails.
  const res = await ensureFullAccess();
  app.access = res.ok ? 'full' : 'denied';
  if (!res.ok) { toast('Grist did not grant full access.', 'err'); render(); return; }
  await app.provider.refreshTables();
  rescan();
  app.stored = await loadSettings();
  await probeHidden();
  toast('Editing enabled.', 'ok');
  render();
}

// ---------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------

let previewHost = null;

/**
 * Attachment id → a token URL an <img> can load, cached briefly.
 *
 * The bridge says never to cache these, and for anything persisted that is absolute — but an
 * <img> being repainted several times a second cannot fetch a fresh token per paint either. A
 * short TTL is the honest middle: within a minute the same URL is reused, after it the next paint
 * resolves a fresh one. A miss returns null and kicks off the resolve; the repaint when it lands
 * is what makes thumbnails appear a beat after the document, which is how images load everywhere.
 */
const ATTACHMENT_TTL = 60000;
const attachmentUrls = new Map();   // id → { url, at }
const attachmentPending = new Set();

function resolveImage(id) {
  const hit = attachmentUrls.get(id);
  if (hit && Date.now() - hit.at < ATTACHMENT_TTL) return hit.url;
  if (!app.live || attachmentPending.has(id)) return hit ? hit.url : null;
  attachmentPending.add(id);
  bridge.resolveAttachmentById(id).then((meta) => {
    attachmentPending.delete(id);
    if (meta?.url) {
      attachmentUrls.set(id, { url: meta.url, at: Date.now() });
      paintPreview();
    }
  }).catch(() => attachmentPending.delete(id));
  return hit ? hit.url : null;
}

/**
 * Tell the printer what paper this is.
 *
 * A managed style element, because `@page` cannot be scoped by a selector, and it keeps the
 * printed output honest: choosing a till roll and then pressing Print should produce a till roll,
 * not an A4 sheet with a receipt in the corner of it. The rule itself, and why its margin is
 * zero, is print.js's business; the inset it hands back is what the frame draws instead.
 */
function applyPaperSize(size) {
  const rule = pageRuleFor(size);
  let tag = document.getElementById('ap-page-rule');
  if (!tag) {
    tag = document.createElement('style');
    tag.id = 'ap-page-rule';
    document.head.appendChild(tag);
  }
  tag.textContent = rule.css;
  document.documentElement.style.setProperty('--print-inset', rule.inset);
  document.documentElement.setAttribute('data-paper', size);
  document.documentElement.setAttribute('data-density', app.stored.document.density || 'normal');
}

function paintPreview() {
  if (!previewHost || app.mode === 'record') return;
  // Before there is a document, the preview follows the trade being chosen rather than the
  // stored settings — see setupPreviewSettings.
  const settings = app.schema?.invoice ? settingsNow() : setupPreviewSettings();
  applyPaperSize(app.stored.document.paperSize);
  let draft = app.mode === 'compose'
    ? (app.draft = recalc(app.draft, settings))
    : app.transient ? recalc(app.transient, settings)
      : (currentRow() ? resolveInvoice(currentRow(), app.schema, app.provider, settings) : sampleDraft(settings));
  // Lines without pictures borrow the catalogue's, matched by name — the catalogue is where a
  // business keeps its product photos, and an invoice line for that product should show it.
  if (app.products) draft = { ...draft, lines: borrowCatalogueImages(draft.lines, app.products, app.provider) };
  app.painted = draft;
  previewHost.replaceChildren(renderDocument(draft, settings, { resolveImage }));
}

/**
 * The document shown before there is a document.
 *
 * Drawn from the chosen trade and the live settings, so what is on screen during setup IS a
 * preview of what setting up will produce — and every settings change repaints it. The client is
 * fictional, as all sample data here must be.
 */
function sampleDraft(settings) {
  const t = findTradeTemplate(app.setupTrade) || findTradeTemplate('freelancer');
  // The same substitution setup itself makes, so the sample IS a preview of what setting up
  // builds — pictures included for the shop trades.
  const lines = SAMPLE_LINES[app.setupTrade]
    || (t?.lines || []).filter((l) => Number(l.unitPrice) > 0);
  const iso = (d) => d.toISOString().slice(0, 10);
  const due = new Date();
  due.setDate(due.getDate() + 30);

  const draft = normaliseDraft({
    kind: t?.kind || 'invoice',
    layout: settings.layout,
    status: 'Sent',
    issued: iso(new Date()),
    due: iso(due),
    currency: settings.money?.currency,
    sender: settings.sender || {},
    terms: t?.terms || 'Net 30',
    client: {
      name: 'Harbour Lane Bakery', street1: '12 Harbour Lane', city: 'Bristol',
      postcode: 'BS1 4QA', country: settings.money?.homeCountry || 'GB',
      email: 'accounts@harbourlane.example',
    },
    lines: lines.length ? lines : [{ description: 'Services rendered', quantity: 1, unitPrice: 500 }],
  });
  draft.number = assignNumber('', { format: settings.numberFormat }).number;
  return recalc(draft, settings);
}

function render() {
  const host = root();
  if (!host) return;
  clear(host);
  previewHost = el('div', { class: 'studio-page' });

  const drawer = renderDrawer();
  host.appendChild(el('div', { class: 'studio' + (drawer ? ' has-drawer' : '') }, [
    renderBar(),
    el('div', { class: 'studio-main' }, [renderSidebar(), renderBody()]),
    drawer,
  ]));
  // The drawer is created closed and opened a beat later so its slide-in can play. setTimeout, not
  // requestAnimationFrame, for the same reason the toast uses it: rAF is starved while the tab is
  // not compositing — an embedded widget in a background tab — and a drawer that never opens is a
  // Settings button that does nothing.
  if (drawer) setTimeout(() => drawer.classList.add('is-open'), 10);
  paintPreview();
}

/**
 * The invoice list, as a place rather than a dropdown.
 *
 * A dropdown shows one invoice and hides the rest; a business looking at its invoicing needs the
 * rest — what is overdue, what is still a draft — visible at a glance. Each row carries the number,
 * the client, the amount and a status chip, and the list is the navigation: clicking a row shows
 * that document. On narrow screens the bar's picker takes over and this is hidden — one control or
 * the other, never both.
 */
function renderSidebar() {
  if (!app.schema?.invoice) return null;
  const money = settingsNow().money;
  // Each row in ITS currency: a document fixed in dollars listed with a pound sign would be the
  // sidebar contradicting the document it opens.
  const fmt = (v, cur) => formatMoney(v, { ...money.format, currency: cur || money.currency });

  // Three lists share one column: the invoices, the clients, the catalogue. The switch is the
  // sidebar's own, so clients and catalogue items are found where invoices are found, and edited
  // where invoices are composed — in the body, not in a table somewhere else.
  const LISTS = [
    { id: 'invoices', label: 'Invoices', available: true },
    { id: 'clients', label: 'Clients', available: !!recordSource('client') },
    { id: 'products', label: 'Catalogue', available: !!recordSource('product') },
  ];
  if (!LISTS.find((l) => l.id === app.list)?.available) app.list = 'invoices';
  const which = app.list;
  const switcher = el('div', { class: 'studio-side__switch', role: 'tablist' }, LISTS.map((l) => {
    const b = el('button', {
      class: 'studio-side__tab' + (l.id === which ? ' is-active' : ''), type: 'button', role: 'tab',
      'aria-selected': l.id === which ? 'true' : 'false', text: l.label,
      title: l.available ? null : `This document has no ${l.label.toLowerCase()} table yet — Data can create one.`,
      disabled: l.available ? null : true,
    });
    b.addEventListener('click', () => { app.list = l.id; app.filter = ''; render(); });
    return b;
  }));

  const listHost = el('nav', { class: 'studio-side__list', 'aria-label': LISTS.find((l) => l.id === which).label });
  const all = which === 'invoices' ? listInvoices(app.schema, app.provider) : listRecords(which === 'clients' ? 'client' : 'product');
  const kind = which === 'clients' ? 'client' : 'product';

  const paint = () => {
    const q = app.filter.trim().toLowerCase();
    clear(listHost);
    if (which === 'invoices') {
      const rows = q ? all.filter((i) => (i.number + ' ' + i.client).toLowerCase().includes(q)) : all;
      if (!rows.length) {
        listHost.appendChild(el('p', { class: 'studio-side__empty', text: q ? 'Nothing matches.' : (app.schema?.invoice ? 'No invoices yet. New starts one.' : 'No invoice table yet. Set the document up first.') }));
        return;
      }
      for (const i of rows) {
        const active = i.id === app.currentRowId && app.mode !== 'record';
        const row = el('button', {
          class: 'studio-side__row' + (active ? ' is-active' : ''), type: 'button',
          'aria-current': active ? 'true' : null,
        }, [
          el('span', { class: 'studio-side__line' }, [
            el('span', { class: 'studio-side__num', text: i.number }),
            i.total != null ? el('span', { class: 'studio-side__total', text: fmt(i.total, i.currency) }) : null,
          ]),
          el('span', { class: 'studio-side__line' }, [
            el('span', { class: 'studio-side__client', text: i.client || '—' }),
            // The kind, only where it is stored and is not the plain invoice — a list of forty
            // rows each labelled "Invoice" says nothing; one "Credit note" among them says a lot.
            i.kind && i.kind !== 'invoice' ? el('span', { class: 'studio-side__kind', text: documentKind(i.kind).word }) : null,
            i.status ? statusChip(i.status) : null,
          ]),
        ]);
        row.addEventListener('click', () => { app.currentRowId = i.id; app.mode = 'view'; app.record = null; app.transient = null; render(); });
        listHost.appendChild(row);
      }
      return;
    }
    const rows = q ? all.filter((r) => (r.name + ' ' + r.sub).toLowerCase().includes(q)) : all;
    if (!rows.length) {
      listHost.appendChild(el('p', { class: 'studio-side__empty', text: q ? 'Nothing matches.' : (which === 'clients' ? 'No clients yet. New adds one.' : 'Nothing in the catalogue yet. New adds an item, or the star on an invoice line does.') }));
      return;
    }
    for (const r of rows) {
      const active = app.mode === 'record' && app.record?.kind === kind && app.record.rowId === r.id;
      const src = which === 'products' ? imageSrcFor(r.image) : null;
      const row = el('button', {
        class: 'studio-side__row studio-side__row--record' + (active ? ' is-active' : ''), type: 'button',
        'aria-current': active ? 'true' : null,
      }, [
        which === 'products' ? (src ? el('img', { class: 'studio-side__thumb', src, alt: '' }) : el('span', { class: 'studio-side__thumb is-empty', 'aria-hidden': 'true' })) : null,
        el('span', { class: 'studio-side__text' }, [
          el('span', { class: 'studio-side__line' }, [
            el('span', { class: 'studio-side__name', text: r.name }),
            r.price != null && r.price !== '' ? el('span', { class: 'studio-side__total', text: fmt(Number(r.price) || 0) }) : null,
          ]),
          r.sub ? el('span', { class: 'studio-side__client', text: r.sub }) : null,
        ]),
      ]);
      row.addEventListener('click', () => openRecord(kind, r.id));
      listHost.appendChild(row);
    }
  };

  // The search repaints only the list, so typing in it never rebuilds the box being typed in.
  const search = el('input', {
    class: 'studio-side__search', type: 'search', value: app.filter,
    placeholder: which === 'invoices' ? 'Filter by number or client' : 'Filter by name', 'aria-label': 'Filter the list',
  });
  search.addEventListener('input', () => { app.filter = search.value; paint(); });

  // Edit and New live here, with the list they act on. On narrow screens the sidebar is hidden
  // and the bar's copies take over — one set or the other, never both.
  const editing = which === 'invoices' ? app.mode === 'compose' : app.mode === 'record';
  // No table to put anything in yet: the buttons stay, greyed, and say why.
  const gated = !app.schema?.invoice;
  const editBtn = el('button', { class: 'studio-btn studio-btn--sm studio-btn--edit', type: 'button', text: editing ? 'Close' : 'Edit', disabled: gated ? true : null, title: gated ? 'Set the document up first.' : null });
  editBtn.addEventListener('click', () => {
    if (editing) { app.mode = 'view'; app.draft = null; app.record = null; render(); return; }
    if (which === 'invoices') startCompose(currentRow());
    else if (all.length) openRecord(kind, app.record?.rowId ?? all[0].id);
  });
  const newBtn = el('button', { class: 'studio-btn studio-btn--sm studio-btn--primary', type: 'button', text: 'New', disabled: gated ? true : null, title: gated ? 'Set the document up first.' : null });
  newBtn.addEventListener('click', () => (which === 'invoices' ? startCompose(null) : openRecord(kind, null)));
  const refreshBtn = el('button', { class: 'studio-btn studio-btn--sm', type: 'button', text: 'Refresh', title: 'Re-read every table from the document' });
  refreshBtn.addEventListener('click', doRefresh);

  paint();
  return el('aside', { class: 'studio-side' }, [
    switcher,
    el('div', { class: 'studio-side__head' }, [
      el('span', { class: 'studio-side__count', text: String(all.length) }),
      el('span', { class: 'studio-side__spacer' }),
      refreshBtn,
      editBtn,
      newBtn,
    ]),
    which === 'invoices' ? agingStrip(fmt) : null,
    el('div', { class: 'studio-side__tools' }, [search]),
    listHost,
  ]);
}

/** A picture cell as something the sidebar can show — the same rules the document uses. */
function imageSrcFor(cell) {
  if (cell == null || cell === '') return null;
  if (typeof cell === 'string') return /^(https:\/\/|data:image\/)/i.test(cell.trim()) ? cell.trim() : null;
  const id = bridge.firstAttachmentId(cell);
  return id != null ? resolveImage(id) : null;
}

/** The kind a row stores, or null when the document has no Kind column or the cell is empty. */
function storedKindOf(row) {
  const col = app.schema?.invoice?.roles?.kind;
  return row && col ? kindFromCell(row[col]) : null;
}

/** A status as a dot plus the word — the colour is reinforcement, never the message. */
function statusChip(status) {
  const s = String(status).toLowerCase();
  const kind = s.includes('overdue') ? 'overdue'
    : s.includes('part') ? 'part'
      : s.includes('paid') && !s.includes('un') ? 'paid'
        : s.includes('sent') ? 'sent'
          : (s.includes('cancel') || s.includes('void')) ? 'cancelled'
            : 'draft';
  return el('span', { class: 'studio-status is-' + kind }, [
    el('span', { class: 'studio-status__dot', 'aria-hidden': 'true' }),
    el('span', { text: status }),
  ]);
}

/**
 * Settings and Send live in a drawer over the right edge, the way Advanced Charts edits its
 * dashboard: the document stays visible underneath, which is what makes a settings change
 * observable as it is made instead of after the panel closes. The panels keep their own bars —
 * Save and Close are theirs — so the drawer is a place, not another layer of chrome.
 */
function renderDrawer() {
  if (app.mode !== 'settings' && app.mode !== 'send' && app.mode !== 'data') return null;

  let panel = null;
  if (app.mode === 'data') {
    panel = renderDataPanel();
  } else if (app.mode === 'settings') {
    panel = renderSettingsPanel({
      settings: app.stored,
      existingNumbers: app.schema?.invoice ? existingNumbers(app.schema, app.provider) : [],
      onPreview: paintPreview,
      onRebuild: () => render(),
      onClose: () => { app.mode = 'view'; render(); },
      onSave: async (next) => {
        const res = await saveSettings(next);
        app.stored = res.settings;
        paintPreview();
        return res;
      },
    });
  } else {
    const settings = settingsNow();
    const row = currentRow();
    panel = renderSendPanel({
      draft: app.transient ? recalc(app.transient, settings) : resolveInvoice(row, app.schema, app.provider, settings),
      settings,
      live: app.live,
      canWrite: canWrite(),
      onClose: () => { app.mode = 'view'; render(); },
      actions: {
        queue: (row2) => queueToOutbox(row2, app.provider, { live: app.live }),
        release: (ids) => releaseOutbox(ids, app.provider, { live: app.live }),
        recordSend,
      },
    });
  }

  return el('aside', {
    class: 'studio-drawer', role: 'dialog', 'aria-modal': 'false',
    'aria-label': app.mode === 'settings' ? 'Settings' : app.mode === 'data' ? 'Document data' : 'Send',
  }, [el('div', { class: 'studio-drawer__body' }, [panel])]);
}

function renderBar() {
  // Before there is an invoice table there is nothing to edit, add to or send.
  const gated = !app.schema?.invoice;
  const invoices = app.schema?.invoice ? listInvoices(app.schema, app.provider) : [];
  if (invoices.length && app.currentRowId == null) app.currentRowId = invoices[0].id;

  const picker = el('select', { class: 'studio-select studio-bar__picker', 'aria-label': 'Choose a document' },
    invoices.map((i) => el('option', {
      value: String(i.id), selected: i.id === app.currentRowId ? true : null,
      text: [i.number, i.client].filter(Boolean).join(' · '),
    })));
  picker.addEventListener('change', () => { app.currentRowId = Number(picker.value); app.mode = 'view'; app.transient = null; render(); });

  const chooser = (label, options, current, onChange) => {
    const sel = el('select', { class: 'studio-select studio-select--sm', 'aria-label': label },
      options.map((o) => el('option', { value: o.id, selected: o.id === current ? true : null, text: o.label })));
    sel.addEventListener('change', () => { onChange(sel.value); render(); });
    return sel;
  };

  const btn = (label, onClick, variant) => {
    const b = el('button', { class: 'studio-btn' + (variant ? ' studio-btn--' + variant : ''), type: 'button', text: label });
    b.addEventListener('click', onClick);
    return b;
  };

  // A dot plus a word, never the colour alone; and the pill names the situation, not the feature.
  const mode = app.live ? (canWrite() ? 'live' : 'ro') : 'demo';
  const modeText = { live: 'Connected', ro: 'Read only', demo: 'Demo' }[mode];

  return el('div', { class: 'studio-bar' }, [
    el('div', { class: 'studio-bar__brand' }, [
      // The mark is the credit: it links home, the way the other widget's does.
      el('a', { class: 'studio-bar__home', href: 'https://anupress.com', target: '_blank', rel: 'noopener', title: 'By ANUPRESS — anupress.com' }, [
        el('img', { class: 'studio-bar__logo', src: ANUPRESS_LOGO, alt: 'ANUPRESS' }),
        el('span', { class: 'studio-bar__name', text: 'Invoice Studio' }),
      ]),
      el('span', { class: `studio-bar__mode is-${mode}`, title: 'Invoice Studio v' + APP_VERSION }, [
        el('span', { class: 'studio-bar__dot', 'aria-hidden': 'true' }),
        el('span', { text: modeText }),
      ]),
    ]),
    invoices.length ? picker : null,
    // A row's stored kind outranks the chooser, so in view mode the chooser reports the row's
    // kind and is disabled: changing it there would change nothing on the page. In the composer it
    // edits the draft, which saves into the Kind column; for new documents it is the default.
    (() => {
      const stored = app.mode === 'view' ? storedKindOf(currentRow()) : null;
      const current = app.mode === 'compose' && app.draft ? app.draft.kind : (stored || app.kind);
      const sel = chooser('Document kind', DOCUMENT_KINDS, current, (v) => { app.kind = v; if (app.draft) app.draft.kind = v; });
      if (stored) { sel.disabled = true; sel.title = 'This document\u2019s kind is stored in its Kind column. Edit it to change it.'; }
      return sel;
    })(),
    // Before setup the preview follows the trade's layout, so the chooser shows that one rather
    // than a stored default the preview is not using.
    chooser('Layout', LAYOUTS, app.layout || (gated ? setupPreviewSettings().layout : app.stored.document.layout), (v) => { app.layout = v; if (app.draft) app.draft.layout = v; }),
    el('div', { class: 'studio-bar__spacer' }),
    app.live && !canWrite() ? btn('Enable editing', enableEditing, 'primary') : null,
    // Narrow-screen stand-ins for the sidebar's Edit and New: the sidebar owns them, and these
    // exist only where the sidebar does not. CSS hides them at the same breakpoint that shows it.
    // None of the three before there is an invoice table: a New that opens a composer over the
    // setup offer is a New that cannot save.
    gated ? null : (() => {
      const b = app.mode === 'compose'
        ? btn('Close', () => { app.mode = 'view'; app.draft = null; render(); })
        : btn('Edit', () => startCompose(currentRow()));
      b.classList.add('studio-bar__narrow');
      return b;
    })(),
    app.mode === 'view' && !gated ? (() => {
      const b = btn('New', () => startCompose(null));
      b.classList.add('studio-bar__narrow');
      return b;
    })() : null,
    (() => {
      const b = btn('Refresh', doRefresh);
      b.classList.add('studio-bar__narrow');
      return b;
    })(),
    app.mode !== 'send' && app.mode !== 'record' && !gated && (app.transient || currentRow()) ? btn('Send', () => { app.mode = 'send'; render(); }, 'primary') : null,
    btn(app.mode === 'data' ? 'Close data' : 'Data', () => {
      app.mode = app.mode === 'data' ? 'view' : 'data';
      render();
    }),
    btn(app.mode === 'settings' ? 'Close settings' : 'Settings', () => {
      app.mode = app.mode === 'settings' ? 'view' : 'settings';
      render();
    }),
    btn('Print', () => window.print()),
  ]);
}

/**
 * Grist has not allowed this widget to read the document.
 *
 * Separated from the empty-document offer because the two look identical from inside the widget and
 * lead to opposite actions. Grist refuses to list tables below full access, and the shared core
 * reports that refusal as an empty list, so this is what a document full of invoices looks like
 * until permission is granted.
 *
 * The instructions name the control rather than describing the outcome, because the panel it lives
 * in is not where anybody would think to look for it.
 */
function renderAccessNeeded() {
  const retry = el('button', { class: 'studio-btn studio-btn--primary', type: 'button', text: 'Check again' });
  retry.addEventListener('click', async () => {
    retry.disabled = true;
    retry.textContent = 'Checking…';
    const res = await ensureFullAccess();
    app.access = res.ok ? 'full' : 'denied';
    if (res.ok) {
      await app.provider.refreshTables();
      rescan();
      const wanted = [app.schema.invoice?.table, app.schema.line?.table, app.schema.client?.table, app.products?.table].filter(Boolean);
      if (wanted.length) await app.provider.prime(wanted);
      app.stored = await loadSettings();
      toast('Access granted.', 'ok');
    } else {
      toast('Grist still has not granted access.', 'warn');
    }
    render();
  });

  return el('div', { class: 'studio-notice studio-notice--warn' }, [
    el('strong', { text: 'Grist has not granted this widget access to the document.' }),
    el('p', { text: 'Until it does, the document reads as empty whether or not it has invoices in it. Invoice Studio needs to read your invoices, their line items and your client list, and to write invoices back, so it asks for full access.' }),
    el('p', { text: 'To grant it, open the creator panel on the right of the Grist page, find this widget’s Access setting, and choose Full document access. Grist may also show a prompt on the widget itself.' }),
    el('div', { class: 'studio-setup__row' }, [retry]),
    el('p', { class: 'studio-upgrade__note', text: 'Nothing is written to your document without you asking for it. Access is what lets the widget read the tables at all.' }),
  ]);
}

/**
 * A document with no invoices in it.
 *
 * Offering to build the tables rather than only reporting their absence. "No invoices found" and
 * nothing else is a dead end at exactly the moment somebody is deciding whether this is worth
 * using, and the tables it needs are ones it already knows how to describe.
 *
 * A trade is picked first because it decides what the sample invoices are FOR — a builder gets
 * labour and materials, a bakery gets loaves and coffee — and because the same choice configures
 * the settings, so one decision does both.
 */
function renderSetup() {
  // Grouped by sector as real <optgroup>s — headings, not options — and with no placeholder
  // entry: one used to sit at the top reading "Pick your trade…" while secretly being the
  // freelancer template, so choosing it looked like choosing nothing and chose something.
  const chooser = el('select', { class: 'studio-select', 'aria-label': 'What kind of work do you invoice for?' },
    templatesBySector().map((g) => el('optgroup', { label: g.sector }, g.items.map((t) =>
      el('option', { value: t.id, selected: t.id === app.setupTrade ? true : null, text: t.label })))));
  // What the choice decides, said beside it, and shown below it: the sample document under this
  // notice is drawn with the trade's own kind, layout, wording and business, and redrawn on
  // every change — the preview is the explanation.
  const summary = el('p', { class: 'studio-setup__summary' });
  const describe = () => {
    const t = findTradeTemplate(app.setupTrade);
    // The business already in the settings is the one setup keeps; the sample stands in only
    // where there is none — the same rule runSetup applies, so the line says what will happen.
    const business = String(app.stored.business?.name || '').trim() || sampleBusinessFor(app.setupTrade).name;
    summary.textContent = t ? `Sets up ${business}: ${templateSummary(t).join(' · ')}. The preview below shows it.` : '';
  };
  chooser.addEventListener('change', () => {
    app.setupTrade = chooser.value;
    app.kind = findTradeTemplate(chooser.value)?.kind || 'invoice';
    app.layout = null;
    // The whole page, not only the preview: the bar's kind and layout choosers show what the
    // preview is drawn with, and they would otherwise go on saying Invoice and Minimal over a
    // banded receipt.
    render();
  });
  describe();

  // Two ways to build, and a third door for people who already have tables. Both builds press
  // once: four tables and a business's worth of records is a visible pause on a slow connection,
  // and a button that looks unpressed invites a second press — which would try to create the
  // tables twice.
  const run = async (button, empty) => {
    go.disabled = true; goEmpty.disabled = true; chooser.disabled = true;
    const was = button.textContent;
    button.textContent = 'Setting up…';
    await runSetup(chooser.value, { empty });
    if (button.isConnected) { go.disabled = false; goEmpty.disabled = false; chooser.disabled = false; button.textContent = was; }
  };
  const go = el('button', { class: 'studio-btn studio-btn--primary', type: 'button', text: 'Set up with a sample business' });
  go.addEventListener('click', () => run(go, false));
  const goEmpty = el('button', { class: 'studio-btn', type: 'button', text: 'Start empty' });
  goEmpty.addEventListener('click', () => run(goEmpty, true));

  return el('div', { class: 'studio-notice studio-notice--warn' }, [
    el('strong', { text: 'This document has no invoices in it yet.' }),
    el('p', { text: 'Invoice Studio looks for a table with something like an invoice number, a client and a date. Nothing here matched. Pick your trade, then choose how to start:' }),
    el('ul', { class: 'studio-setup__list' }, [
      el('li', {}, [el('strong', { text: 'With a sample business' }), el('span', { text: ' — Clients, Products, Invoices and Invoice items filled with a complete example for your trade: a business, its clients, its catalogue and five documents in five states. See everything working, then remove the sample rows from Data when your own data arrives.' })]),
      el('li', {}, [el('strong', { text: 'Empty' }), el('span', { text: ' — the same four tables and columns with nothing in them. Add clients and catalogue items from the lists on the left, or straight from an invoice.' })]),
      el('li', {}, [el('strong', { text: 'Your own tables' }), el('span', { text: ' — keep what you have and tell the widget which table and which columns hold what.' })]),
    ]),
    el('div', { class: 'studio-setup__row' }, [chooser, go, goEmpty]),
    summary,
    el('p', { class: 'studio-upgrade__note' }, [
      el('span', { text: 'Existing tables are never touched. Already keep invoices in tables of your own? ' }),
      (() => {
        const b = el('button', { class: 'studio-btn studio-btn--sm', type: 'button', text: 'Choose the tables' });
        b.addEventListener('click', () => { app.mode = 'data'; render(); });
        return b;
      })(),
    ]),
  ]);
}

async function runSetup(templateId, { empty = false } = {}) {
  if (app.busy) return;
  const template = findTradeTemplate(templateId);

  // The trade configures the settings as well as the sample data, and the settings have to be
  // worked out first: the tax they set up decides what a paid invoice was actually paid, and the
  // prefix they set up decides what the sample invoices are numbered.
  const next = sanitise(template ? applyTemplate(template, app.stored) : app.stored);
  // A document with no business in its settings gets the sample one for the trade — ANUPRESS Café,
  // ANUPRESS Works — so the first document is complete rather than headed "Your business". It is
  // remembered as a sample so the widget can keep pointing at Settings until it is replaced. A
  // business that already has a name is never touched.
  if (!empty && !String(next.business.name || '').trim()) {
    const sample = sampleBusinessFor(templateId);
    const { paymentDetails, ...identity } = sample;
    next.business = { ...next.business, ...identity };
    if (!String(next.document.paymentDetails || '').trim()) next.document.paymentDetails = paymentDetails;
    next.setup.sampleBusiness = identity.name;
    // The sample businesses are British; a money section still at its factory defaults follows
    // them, so the documents come out in pounds with VAT rather than in dollars with nothing.
    if (next.money.currency === 'USD' && !next.money.homeCountry) {
      next.money.currency = 'GBP';
      next.money.homeCountry = 'GB';
      next.money.defaultCustomerCountry = 'GB';
      if (next.money.taxMode === 'simple' && next.money.simpleName === 'VAT' && next.money.simpleRate === 20) { /* already the UK default */ }
    }
  }
  next.setup.trade = templateId;
  const money = moneySettings(next.money);
  // A shop that picked "Retail — a till receipt" should not then be shown an invoice. The bar's
  // chooser still switches it afterwards; this only decides where it starts.
  const kind = template?.kind || 'invoice';

  const tables = starterTablesFor(templateId, {
    empty,
    numberPrefix: numberFormatFor(next, kind).prefix.replace(/\{[^}]+\}/g, '').replace(/-+$/, '') + '-',
    grossOf: ({ lines, address }) => computeTotals({ lines, addresses: { billing: address } }, money).total,
  });

  app.busy = true;
  const res = await createStarterTables(tables, app.provider, { live: app.live });
  app.busy = false;

  if (!res.ok) { toast(res.error || 'Could not create the tables.', 'err'); return; }

  // Which rows are the sample, so they can be removed in one go when the real ones arrive.
  next.setup.sampleRows = res.rows || {};

  // Saved rather than only held in memory, or the wording and numbering chosen here are gone on
  // reload while the invoices they produced are not.
  const saved = await saveSettings(next);
  app.stored = saved.settings;
  app.kind = kind;
  app.layout = null;                 // let the template's layout through rather than the bar's
  rescan();
  await probeHidden();
  app.currentRowId = null;
  toast(empty ? `Created ${res.created.join(', ')}, empty. Add clients and catalogue items from the lists on the left.` : `Created ${res.created.join(', ')}.`, 'ok');
  render();
}

/**
 * Create one of the four tables on its own, empty, for a document that has the others.
 *
 * A document built by hand often has invoices and clients and no catalogue. The composer works
 * without one, but the picker, the pictures and the "add to catalogue" star need a table to
 * live in, and this is a smaller step than setting the whole document up.
 */
async function createMissingTable(id) {
  if (app.busy) return;
  const existing = (app.provider.tables() || []).map((t) => t.id);
  const want = missingFrom(existing, starterTablesFor(app.stored.setup?.trade || 'freelancer', { empty: true })).filter((t) => t.id === id);
  if (!want.length) { toast(`This document already has a table called ${id}.`, 'warn'); return; }
  app.busy = true;
  const res = await createStarterTables(want, app.provider, { live: app.live });
  app.busy = false;
  if (!res.ok) { toast(res.error || `Could not create ${id}.`, 'err'); return; }
  rescan();
  toast(`Created ${id}, empty.`, 'ok');
  render();
}

// ---------------------------------------------------------------------------------------------
// Clients and the catalogue, as records a person edits
// ---------------------------------------------------------------------------------------------

/** The table and roles behind a record kind, or null when the document has no such table. */
function recordSource(kind) {
  if (kind === 'client') return app.schema?.client ? { table: app.schema.client.table, roles: app.schema.client.roles } : null;
  if (kind === 'product') return app.products ? { table: app.products.table, roles: app.products.roles } : null;
  return null;
}

function recordColumns(kind) {
  const src = recordSource(kind);
  return src ? (app.provider.columns(src.table) || []) : [];
}

/** The rows of a record kind, with a display name, for the sidebar lists. */
function listRecords(kind) {
  const src = recordSource(kind);
  if (!src) return [];
  const R = src.roles;
  return (app.provider.records(src.table) || []).map((r) => ({
    id: r.id,
    name: recordName({ name: R.name ? r[R.name] : '' }, kind),
    // Clients show where they are; catalogue items what they cost.
    sub: kind === 'client'
      ? [R.city ? r[R.city] : '', R.email ? r[R.email] : ''].map((v) => String(v || '').trim()).filter(Boolean).join(' · ')
      : [R.sku ? r[R.sku] : '', R.unit ? r[R.unit] : ''].map((v) => String(v || '').trim()).filter(Boolean).join(' · '),
    price: kind === 'product' && R.unitPrice ? r[R.unitPrice] : null,
    image: kind === 'product' && R.image ? r[R.image] : null,
  }));
}

/**
 * Save a record from the form: pictures uploaded first where the column takes attachments, then
 * the row written, then the tables re-read so every list and picker sees it.
 */
async function saveRecordValues(kind, rowId, values) {
  const src = recordSource(kind);
  if (!src) return { ok: false, error: `This document has no ${kind === 'client' ? 'client' : 'catalogue'} table.` };
  const columns = recordColumns(kind);
  const picture = formFields(kind, src.roles, columns).find((f) => f.type === 'image');

  // A picture chosen in the form arrives as a data URI. On a live document with an Attachments
  // column it has to become a real attachment first — the cell holds ids, not pictures — and a
  // failed upload is reported rather than swallowed, because the alternative is a saved record
  // that quietly has no picture. The demo has no attachment store, so it keeps the data URI, and
  // so does a Text picture column.
  const toSave = { ...values };
  const isNewPicture = typeof toSave.image === 'string' && toSave.image.startsWith('data:image/');
  if (picture && picture.attachments && isNewPicture && app.live) {
    const up = await uploadAttachment(toSave.image, `${recordName(values, kind).replace(/[^\w-]+/g, '-').toLowerCase() || 'picture'}.jpg`);
    if (!up.ok) return { ok: false, error: up.error || 'The picture could not be uploaded.' };
    toSave.image = up.value;
  }

  const plan = recordPlan({
    kind, table: src.table, roles: src.roles, columns, rowId, values: toSave,
    imageMode: app.live ? 'attachment' : 'inline',
  });
  if (!plan.ok) return { ok: false, error: plan.problems[0] };
  const res = await saveRecord(plan, app.provider, { live: app.live });
  if (!res.ok) return res;
  rescan();
  const dropped = plan.skipped.map((s) => s.role);
  return {
    ok: true, rowId: res.rowId,
    note: dropped.length ? `Saved — but ${dropped.join(', ')} could not be kept: no column for ${dropped.length === 1 ? 'it' : 'them'} in this table.` : undefined,
  };
}

/** The type-ahead lists the record forms offer. Tax classes come from this document's own table. */
function recordSuggestions() {
  return {
    country: asOptions(COUNTRIES),
    unit: asOptions(UNITS),
    taxClass: asOptions(taxClassesFor(settingsNow().money)),
  };
}

/**
 * Add the column a form field has nowhere to go into.
 *
 * The same machinery as "Upgrade this document", asked for one column at a time: a catalogue with
 * no Image column gets one, a client table with no Email gets one. Only adds — nothing is
 * renamed, retyped or removed.
 */
async function addColumnForRole(kind, role) {
  const part = kind === 'client' ? 'client' : 'product';
  const id = ADDABLE[part]?.[role];
  if (!id || app.busy) return;
  const columnsByTable = {};
  for (const t of app.provider.tables() || []) columnsByTable[t.id] = app.provider.columns(t.id) || [];
  const plan = buildUpgradePlan(app.schema, columnsByTable, [id], app.products);
  if (!plan.ok) { toast('That column is already in the table.', 'ok'); rescan(); render(); return; }

  app.busy = true;
  const res = await applyUpgrade(plan, app.provider, { live: app.live });
  app.busy = false;
  if (!res.ok) { toast(res.error || 'Could not add the column.', 'err'); return; }
  rescan();
  await probeHidden();
  toast(`Added the ${id} column to ${plan.columns[0].table}.`, 'ok');
  render();
}

/** Open a record in the body. `rowId` null starts a new one. */
function openRecord(kind, rowId) {
  if (!recordSource(kind)) { toast(`This document has no ${kind === 'client' ? 'client' : 'catalogue'} table. Data can create one.`, 'warn'); return; }
  app.record = { kind, rowId };
  app.mode = 'record';
  app.draft = null;
  render();
}

function renderRecordEditor() {
  const { kind, rowId } = app.record;
  const src = recordSource(kind);
  if (!src) return null;
  const columns = recordColumns(kind);
  const row = rowId != null ? (app.provider.records(src.table) || []).find((r) => r.id === rowId) : null;
  if (rowId != null && !row) { app.mode = 'view'; app.record = null; return null; }
  const values = readRecord(row || null, kind, src.roles, columns);
  if (!row && kind === 'client') values.country = app.stored.money.defaultCustomerCountry || '';
  const money = settingsNow().money;

  const form = renderRecordForm({
    kind, rowId, values, resolveImage, canWrite: canWrite(),
    roles: src.roles, columns,
    suggestions: recordSuggestions(),
    onAddColumn: (role) => addColumnForRole(kind, role),
    money: { ...money.format, currency: money.currency },
    onSave: async (v) => {
      const res = await saveRecordValues(kind, rowId, v);
      if (res.ok) {
        app.record = { kind, rowId: res.rowId };
        toast(rowId == null ? `${recordName(v, kind)} added.` : 'Saved.', 'ok');
        render();
      }
      return res;
    },
    onRemove: rowId == null ? null : async () => {
      const res = await removeRecord(src.table, rowId, app.provider, { live: app.live });
      if (res.ok) {
        rescan();
        app.mode = 'view'; app.record = null;
        toast(`${recordName(values, kind)} removed.`, 'ok');
        render();
      }
      return res;
    },
    onCancel: () => { app.mode = 'view'; app.record = null; render(); },
  });
  // A saved client can have a statement drawn up: every open document on one page.
  if (kind !== 'client' || rowId == null || !app.schema?.invoice) return form;
  const statementBtn = el('button', { class: 'studio-btn studio-btn--sm', type: 'button', text: 'Draw up a statement of account' });
  statementBtn.addEventListener('click', () => openStatement(rowId));
  return el('div', {}, [
    el('div', { class: 'studio-hintbar' }, [
      el('span', { text: 'Every open document for this client on one page, oldest first, with a running balance.' }),
      statementBtn,
    ]),
    form,
  ]);
}

/**
 * A client's statement of account, drawn from the ledger.
 *
 * Every invoice row that names this client — by reference or by name — is resolved as the
 * document it is, and the open ones become the statement's lines. It is a transient document:
 * shown, printed and sent, never written back, because it is a view of the ledger rather than
 * an entry in it.
 */
function openStatement(clientRowId) {
  const s = app.schema;
  if (!s?.invoice || !s.client) return;
  const settings = settingsNow();
  const clientRow = (app.provider.records(s.client.table) || []).find((r) => r.id === clientRowId);
  if (!clientRow) return;
  const name = String(clientRow[s.client.roles.name] || '').trim().toLowerCase();
  const mine = (app.provider.records(s.invoice.table) || []).filter((r) => {
    const raw = r[s.invoice.roles.client];
    return raw === clientRowId || (typeof raw === 'string' && raw.trim().toLowerCase() === name);
  });
  const documents = mine.map((r) => resolveInvoice(r, s, app.provider, settings));
  const number = assignNumber('', { existingNumbers: [], format: numberFormatFor(app.stored, 'statement'), date: new Date() }).number;
  app.transient = buildStatement({
    client: documents[0]?.client || clientParty(clientRow, s.client.roles),
    documents, number,
    sender: settings.sender, currency: settings.money?.currency, layout: settings.layout,
  });
  app.mode = 'view';
  app.record = null;
  render();
}

/**
 * One line above the invoice list: what is still owed, and how much of it is late.
 *
 * Every open document is resolved for its real balance, which is cheap up to a few hundred rows
 * and pointless beyond, so a large document gets no line rather than a slow one.
 */
function agingStrip(fmt) {
  const s = app.schema;
  if (!s?.invoice) return null;
  const rows = app.provider.records(s.invoice.table) || [];
  if (!rows.length || rows.length > 400) return null;
  const settings = settingsNow();
  const ag = aging(rows.map((r) => resolveInvoice(r, s, app.provider, settings)));
  if (!ag.count) return null;
  return el('div', { class: 'studio-side__aging', title: 'Open documents: what is still owed, and how much of it is past its due date' }, [
    el('span', { text: `Owed ${fmt(ag.outstanding)} · ${ag.count}` }),
    ag.overdueCount ? el('span', { class: 'is-overdue', text: `Overdue ${fmt(ag.overdue)} · ${ag.overdueCount}` }) : null,
  ]);
}

/** What we worked out about this document, said plainly rather than buried in a console log. */
/**
 * The data drawer: which tables this widget reads, and what it made of them.
 *
 * The report used to sit above the document, where it competed with the document — the reader's
 * focus is the invoice, and "matched by name" is plumbing. Plumbing belongs behind a door, with
 * the taps: the same drawer holds the table choices, because the person opening it to see what
 * was detected is the person who wants to correct it.
 */
function renderDataPanel() {
  const s = app.schema;
  const tableIds = (app.provider.tables() || []).map((t) => t.id);
  const forced = app.stored.tables;

  const persist = async (note) => {
    const saved = await saveSettings(app.stored);
    app.stored = saved.settings;
    rescan();
    app.currentRowId = null;
    render();
    if (note) toast(note, 'ok');
  };

  /**
   * The columns of one part, role by role: the automatic guess, or the person's choice, or none.
   *
   * This is the door for tables built by hand with columns named however they were named — a
   * "Kunde" is the client once it is chosen here, and stays chosen.
   */
  const columnsFor = (part, label) => {
    const mapped = part === 'product' ? app.products : s && s[part];
    if (!mapped) return null;
    const cols = app.provider.columns(mapped.table) || [];
    const choices = (forced.columns && forced.columns[part]) || {};
    const rows = (ROLES_BY_PART[part] || []).map((role) => {
      const sel = el('select', { class: 'cmp-input cmp-input--select', 'aria-label': `${label}: ${role}` }, [
        el('option', { value: '', text: mapped.roles[role] && !choices[role] ? `automatic — ${mapped.roles[role]}` : 'automatic — nothing matched' }),
        el('option', { value: '-', selected: choices[role] === '-' ? true : null, text: 'none in this table' }),
        ...cols.map((c) => el('option', { value: c.id, selected: choices[role] === c.id ? true : null, text: c.id + (c.isFormula ? ' (formula)' : '') })),
      ]);
      sel.addEventListener('change', async () => {
        forced.columns = forced.columns || {};
        forced.columns[part] = forced.columns[part] || {};
        if (sel.value) forced.columns[part][role] = sel.value; else delete forced.columns[part][role];
        await persist(sel.value === '-' ? `${role}: none.` : sel.value ? `${role} is ${sel.value}.` : `${role}: automatic.`);
      });
      return el('div', { class: 'studio-cols__row' + (choices[role] ? ' is-chosen' : '') }, [
        el('span', { class: 'studio-cols__role', text: role }),
        sel,
      ]);
    });
    const chosen = Object.keys(choices).length;
    return el('details', { class: 'studio-cols' }, [
      el('summary', { text: `Columns in ${mapped.table}${chosen ? ` — ${chosen} chosen by you` : ''}` }),
      el('div', { class: 'studio-cols__grid' }, rows),
    ]);
  };

  const pick = (label, key, hint) => {
    const sel = el('select', { class: 'cmp-input', 'aria-label': label }, [
      el('option', { value: '', text: '— work it out automatically —' }),
      ...tableIds.map((id) => el('option', { value: id, selected: forced[key] === id ? true : null, text: id })),
    ]);
    sel.addEventListener('change', async () => {
      forced[key] = sel.value;
      // A different table means the column choices made for the old one no longer apply.
      if (forced.columns) forced.columns[key] = {};
      await persist(sel.value ? `Reading ${label.toLowerCase()} from ${sel.value}.` : `Working out the ${label.toLowerCase()} table automatically.`);
    });
    return el('div', {}, [field(label, sel, hint), columnsFor(key, label)]);
  };

  // A part the document has no table for at all can be created on its own, empty, rather than
  // pointing at nothing. The starter's columns, so it works with everything else from the start.
  const createOffer = (id, what) => {
    const b = el('button', { class: 'studio-btn studio-btn--sm', type: 'button', text: `Create a ${id} table` });
    b.addEventListener('click', () => createMissingTable(id));
    return el('p', { class: 'studio-upgrade__note' }, [el('span', { text: `No ${what} table was found. ` }), b]);
  };

  const tablesSection = section('Tables', [
    el('p', { class: 'set-lead', text: 'Normally worked out from the column names. Choose a table here when the guess is wrong or your names are unusual, and open its columns to pin any role to any column — a table built by hand with its own names works exactly as well once it is described here.' }),
    pick('Invoices', 'invoice', 'One row per invoice.'),
    pick('Line items', 'line', 'Rows that point back at an invoice.'),
    pick('Clients', 'client', 'Who gets billed.'),
    s && s.invoice && !s.client && !tableIds.includes('Clients') ? createOffer('Clients', 'client') : null,
    pick('Catalogue', 'product', 'What you sell, for the line picker.'),
    s && s.invoice && !app.products && !tableIds.includes('Products') ? createOffer('Products', 'catalogue') : null,
  ]);

  const closeBtn = el('button', { class: 'cmp-btn', type: 'button', text: 'Close' });
  closeBtn.addEventListener('click', () => { app.mode = 'view'; render(); });
  const shell = (content) => el('div', { class: 'set' }, [
    el('div', { class: 'set-bar' }, [
      el('strong', { text: 'Document data' }),
      el('div', { class: 'set-bar__spacer' }),
      closeBtn,
    ]),
    ...content,
  ]);

  if (!s || !s.invoice) {
    return shell([
      section('How this document was read', [
        el('p', { class: 'set-lead', text: 'No invoice table was found. Point Invoices at the right table below, or close this and use Set up this document to build the tables.' }),
      ]),
      tablesSection,
    ]);
  }

  const recognised = s.source === 'official';
  const chosen = s.source === 'chosen';
  const bits = [
    el('div', { class: 'studio-notice__head' }, [
      el('span', { class: 'studio-chip' + (recognised || chosen ? ' is-strong' : ''), text: recognised ? 'Recognised' : chosen ? 'Chosen' : 'Matched by name' }),
      el('span', { text: s.sourceLabel || '' }),
    ]),
    el('p', { class: 'studio-notice__tables' }, [
      el('code', { text: s.invoice.table }),
      s.line ? el('span', { text: ' · lines from ' }) : null,
      s.line ? el('code', { text: s.line.table }) : null,
      s.client ? el('span', { text: ' · clients from ' }) : null,
      s.client ? el('code', { text: s.client.table }) : null,
      app.products ? el('span', { text: ' · catalogue from ' }) : null,
      app.products ? el('code', { text: app.products.table }) : null,
    ]),
  ];

  for (const w of s.warnings || []) bits.push(el('p', { class: 'studio-notice__warn', text: w.text }));

  const money = settingsNow().money || {};
  if (money.taxPresetLabel) {
    bits.push(el('p', { class: 'studio-notice__tax' }, [
      el('span', { text: 'Tax: ' }), el('strong', { text: money.taxPresetLabel }),
      el('span', { text: ` — ${(money.taxRates || []).length} rate rows, from settings rather than a column. Rates as at ${RATES_UPDATED}; check them against what you are registered for.` }),
    ]));
  }

  // A connected document whose business block is still blank renders "Your business" at the top of
  // every invoice. Saying where that comes from beats letting somebody hunt for a From column that
  // does not exist — the sender, the logo and the tax setup are all settings, entered once.
  if (app.live && !app.stored.business.name) {
    const open = el('button', { class: 'studio-btn studio-btn--primary studio-btn--sm', type: 'button', text: 'Open settings' });
    open.addEventListener('click', () => { app.mode = 'settings'; render(); });
    bits.push(el('p', { class: 'studio-notice__warn' }, [
      el('span', { text: 'Your business details are empty. The From block, your logo and how tax is worked out are all set once, in Settings — not typed on each invoice. ' }),
      open,
    ]));
  }

  // The sample rows setup created, and the way to be rid of them. Per table, so the count is a
  // fact about this document rather than a number pulled from the air.
  const setup = app.stored.setup || {};
  const sampleTotal = sampleRowCount(setup);
  if (sampleTotal) {
    const perTable = Object.entries(setup.sampleRows || {}).filter(([, ids]) => Array.isArray(ids) && ids.length)
      .map(([table, ids]) => `${ids.length} in ${table}`).join(', ');
    const clearBtn = el('button', { class: 'studio-btn studio-btn--sm', type: 'button', text: `Remove the ${sampleTotal} sample rows` });
    clearBtn.addEventListener('click', clearSampleRows);
    bits.push(el('details', { class: 'studio-upgrade', open: true }, [
      el('summary', { text: `${sampleTotal} sample rows from setup are still in your tables` }),
      el('p', { class: 'studio-upgrade__note', text: `${perTable}. Only these rows are removed — never a row you added, and never a table or a column. ${setup.sampleBusiness && app.stored.business.name === setup.sampleBusiness ? `The business name, ${setup.sampleBusiness}, is a setting: replace it in Settings → Business.` : ''}` }),
      clearBtn,
    ]));
  }

  const todo = upgradeChecklist(s, app.products);
  const count = todo.invoice.length + todo.client.length + todo.line.length + todo.product.length;
  if (count) {
    // The label states exactly what pressing it does, because the panel it sits in is the
    // confirmation — "Upgrade this document" is a promise, "Add these 13 columns" is a fact.
    const go = el('button', {
      class: 'studio-btn studio-btn--primary studio-btn--sm', type: 'button',
      text: `Add ${count === 1 ? 'this column' : `these ${count} columns`}`,
    });
    go.addEventListener('click', runUpgrade);
    bits.push(el('details', { class: 'studio-upgrade' }, [
      el('summary', { text: `${count} column${count === 1 ? '' : 's'} would make this document a full billing system` }),
      el('ul', {}, [...todo.invoice, ...todo.client, ...todo.line, ...todo.product].map((i) =>
        el('li', {}, [el('code', { text: i.id }), el('span', { text: ' — ' + i.why })]))),
      el('p', { class: 'studio-upgrade__note', text: 'Only adds columns. Nothing is renamed, retyped or removed, and running it again does nothing.' }),
      go,
    ]));
  }

  // Columns that are there and cannot be seen. Every column this widget added before 1.20.1 was
  // left this way — in the raw data, working, and absent from the page — so this is the repair
  // for it, kept separate from the upgrade because a column somebody hid on purpose belongs to
  // them, and the button that adds columns should not also be the one that un-hides them.
  const hidden = app.hidden || [];
  if (hidden.length) {
    const show = el('button', {
      class: 'studio-btn studio-btn--primary studio-btn--sm', type: 'button',
      text: hidden.length === 1 ? 'Show it on the page' : `Show these ${hidden.length} on their pages`,
    });
    show.addEventListener('click', runReveal);
    bits.push(el('details', { class: 'studio-upgrade', open: true }, [
      el('summary', { text: `${hidden.length === 1 ? 'A column is' : `${hidden.length} columns are`} in your tables but hidden on their pages` }),
      el('ul', {}, hidden.map((h) =>
        el('li', {}, [el('code', { text: h.id }), el('span', { text: ` in ${h.table} — the column is there and its values are read, but the ${h.table} page does not show it.` })]))),
      el('p', { class: 'studio-upgrade__note', text: 'Adds the column to the right-hand end of the page. Nothing in the table changes. If you hid it yourself, leave this alone.' }),
      show,
    ]));
  }

  return shell([
    section('How this document was read', bits),
    tablesSection,
  ]);
}

/**
 * An unreadable document is not an empty one, and telling somebody their invoices do not exist
 * when the truth is that this widget has not been allowed to look at them is the worse of the two
 * mistakes: it invites them to build a second set of tables alongside the ones they already have.
 */
function renderGate() {
  if (app.live && app.access !== 'full') return renderAccessNeeded();
  if (!app.schema?.invoice) return renderSetup();
  return null;
}

/**
 * One line above the document when something deserves attention — never the full report, which
 * lives in the Data drawer. The document is the focus; this is a note clipped to its corner.
 */
function renderHintStrip() {
  const s = app.schema;
  if (!s?.invoice) return null;

  if (app.transient) {
    const t = app.transient;
    return hintStrip(`Statement of account for ${t.client?.name || 'the client'} as at ${docDate(t.issued)}: every open document, oldest first, with a running balance. Drawn from the ledger, not saved — print it, or Send it as a PDF.`, 'Back to the invoices', () => { app.transient = null; render(); });
  }

  if (app.live && !app.stored.business.name) {
    return hintStrip('Your business details are empty — the From block, logo and tax are set once, in Settings.', 'Open settings', () => { app.mode = 'settings'; render(); });
  }
  const setup = app.stored.setup || {};
  if (app.live && setup.sampleBusiness && app.stored.business.name === setup.sampleBusiness) {
    return hintStrip(`The business on these documents is the sample, ${setup.sampleBusiness} — its address, bank details and payment link too. Replace them with yours in Settings.`, 'Open settings', () => { app.mode = 'settings'; render(); });
  }
  if (app.live && sampleRowCount(setup) > 0) {
    return hintStrip(`Your tables still hold the ${sampleRowCount(setup)} sample rows setup created. Remove them when you are ready to enter your own.`, 'Review in Data', () => { app.mode = 'data'; render(); });
  }
  // The mystery this answers: "why is my invoice still in dollars?" A currency stored on the row
  // outranks the setting, on purpose — an issued invoice does not change currency because the
  // business later did — but silently is how it reads as a bug.
  const row = currentRow();
  const curCol = s.invoice.roles.currency;
  const rowCurrency = curCol && row ? String(row[curCol] || '').trim().toUpperCase() : '';
  if (rowCurrency && rowCurrency !== app.stored.money.currency) {
    return hintStrip(`This document is fixed in ${rowCurrency}; your business currency is ${app.stored.money.currency}. Clear its Currency field to make it follow your settings.`, 'Edit', () => startCompose(row));
  }
  const todo = upgradeChecklist(s, app.products);
  const count = todo.invoice.length + todo.client.length + todo.line.length + todo.product.length;
  const hidden = (app.hidden || []).length;
  if (count) {
    return hintStrip(`${count} column${count === 1 ? '' : 's'} would make this document a full billing system${hidden ? `, and ${hidden === 1 ? 'one is' : `${hidden} are`} hidden on ${hidden === 1 ? 'its page' : 'their pages'}` : ''}.`, 'Review in Data', () => { app.mode = 'data'; render(); });
  }
  if (hidden) {
    const h = app.hidden[0];
    return hintStrip(hidden === 1 ? `The ${h.id} column is in ${h.table} but hidden on its page.` : `${hidden} columns are in your tables but hidden on their pages.`, 'Review in Data', () => { app.mode = 'data'; render(); });
  }
  if ((s.warnings || []).length) {
    return hintStrip(s.warnings[0].text, 'Details in Data', () => { app.mode = 'data'; render(); });
  }
  return null;
}

/** How many rows the setup's sample is still known to occupy. */
function sampleRowCount(setup) {
  return Object.values(setup?.sampleRows || {}).reduce((a, ids) => a + (Array.isArray(ids) ? ids.length : 0), 0);
}

/**
 * Take the sample rows back out.
 *
 * Only the rows setup created, by id, and only those that still exist — a real invoice typed
 * into the same table is never touched. The business identity is left alone here: it is a
 * setting, replaced in Settings, and the hint strip keeps saying so until it is.
 */
async function clearSampleRows() {
  if (app.busy) return;
  const setup = app.stored.setup || {};
  app.busy = true;
  const res = await removeSampleRows(setup.sampleRows || {}, app.provider, { live: app.live });
  app.busy = false;
  if (!res.ok) { toast(res.error || 'Could not remove the sample rows.', 'err'); return; }
  app.stored.setup = { ...setup, sampleRows: {} };
  const saved = await saveSettings(app.stored);
  app.stored = saved.settings;
  rescan();
  app.currentRowId = null;
  toast(`Removed ${res.removed} sample row${res.removed === 1 ? '' : 's'}. The tables and their columns are untouched.`, 'ok');
  render();
}

function hintStrip(text, label, onGo) {
  const go = el('button', { class: 'studio-btn studio-btn--sm', type: 'button', text: label });
  go.addEventListener('click', onGo);
  return el('div', { class: 'studio-hintbar' }, [el('span', { text }), go]);
}

function renderBody() {
  const parts = [];
  const gate = renderGate();
  if (gate) {
    parts.push(gate);
    // Even before there is a document, there is a document: the first screen demonstrates rather
    // than apologises, and the sample below is drawn with the very settings being chosen.
    parts.push(el('p', { class: 'studio-sample-note', text: 'A sample document, drawn with your current settings. It becomes real the moment the document is set up.' }));
  } else {
    const hint = renderHintStrip();
    if (hint) parts.push(hint);
  }

  if (app.mode === 'record' && app.record) {
    const editor = renderRecordEditor();
    if (editor) { parts.push(editor); return el('div', { class: 'studio-body' }, parts); }
  }

  if (app.mode === 'compose' && app.draft) {
    const plan = app.schema?.invoice ? buildPlan() : null;
    const clientSrc = recordSource('client');
    parts.push(renderComposer({
      draft: app.draft,
      schema: app.schema,
      clients: listClients(app.schema, app.provider),
      products: productOptions(app.products, app.provider),
      statuses: statusOptions(app.schema, app.provider),
      settings: settingsNow(),
      live: app.live,
      canWrite: canWrite(),
      locked: composeLocked(),
      planSummary: plan ? describePlan(plan) : '',
      skipped: plan ? plan.skipped : [],
      // The client form, for "+ New client" inside the picker.
      clientForm: clientSrc ? { roles: clientSrc.roles, columns: recordColumns('client'), defaultCountry: app.stored.money.defaultCustomerCountry || '' } : null,
      onEdit: paintPreview,
      onRebuild: () => render(),
      actions: {
        save,
        unlock: () => { app.unlocked = true; render(); },
        // A client added mid-invoice: saved, then handed back in the shape the picker uses so the
        // composer can select it without a round trip through the list.
        addClient: async (values) => {
          const res = await saveRecordValues('client', null, values);
          if (!res.ok) return res;
          const client = listClients(app.schema, app.provider).find((c) => c.id === res.rowId);
          toast(`${recordName(values, 'client')} added to your clients.`, 'ok');
          return { ok: true, client: client || { id: res.rowId, name: recordName(values, 'client'), party: { ...values } } };
        },
        // A line saved to the catalogue, priced as it was typed. Null means the grid is only
        // explaining why it could not.
        addProduct: recordSource('product') ? async (values, why) => {
          if (!values) { toast(why, 'warn'); return; }
          const res = await saveRecordValues('product', null, { ...values, sku: '', stock: '', image: null });
          toast(res.ok ? `${values.name} added to the catalogue.` : (res.error || 'Could not add it.'), res.ok ? 'ok' : 'err');
          if (res.ok) render();
        } : null,
        newDoc: () => startCompose(null),
        // The same document for the next period: a new draft, every date moved on, nothing paid.
        repeat: (period) => {
          app.draft = nextDocument(app.draft, period);
          app.unlocked = false;
          toast(`Raised for ${period === 'week' ? 'next week' : 'the next ' + period}. Save it when it is right.`, 'ok');
          render();
        },
        addLateFee: () => {
          const fee = lateFee(app.draft, { rate: app.stored.money.lateFeeRate });
          if (!fee) { toast('Nothing to charge: the document is not past its due date, or nothing is owed on it.', 'warn'); return; }
          app.draft.lines.push(lateFeeLine(fee));
          toast(`Added ${fee.days} day${fee.days === 1 ? '' : 's'} at ${fee.rate}% a year on the balance.`, 'ok');
          render();
        },
        duplicate: () => {
          app.draft = normaliseDraft({ ...app.draft, rowId: null, number: '', status: 'Draft' });
          app.draft.lines = app.draft.lines.map((l) => ({ ...l, rowId: undefined }));
          render();
        },
        convert: (kindId) => {
          // The new document names the one it came from, in that document's own language, so a
          // credit note reads "Refers to: Rechnung RE-2026-0007" on a German invoice.
          const settings = settingsNow();
          const from = app.draft.number
            ? `${localiseKind(documentKind(app.draft.kind), languageOf(app.draft, settings)).word} ${app.draft.number}`
            : '';
          app.draft = convertDraft(app.draft, kindId, { relatedTo: from });
          app.kind = kindId;
          render();
        },
      },
    }));
  }

  parts.push(printFrame(previewHost));
  return el('div', { class: 'studio-body' }, parts);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && (app.mode === 'settings' || app.mode === 'send' || app.mode === 'data' || app.mode === 'record')) {
    app.mode = 'view';
    app.record = null;
    render();
  }
});

boot().catch((err) => {
  console.error('[Invoice Studio] failed to start', err);
  const host = root();
  if (host) {
    clear(host);
    host.appendChild(el('div', { class: 'studio-notice studio-notice--warn' }, [
      el('strong', { text: 'Invoice Studio could not start.' }),
      el('p', { text: String(err && err.message ? err.message : err) }),
    ]));
  }
});
