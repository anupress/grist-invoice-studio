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
import * as bridge from './core/grist/bridge.js';
import { DummyProvider, GristProvider } from './core/data/provider.js';
import { SAMPLE_DATA, SAMPLE_SENDER, SAMPLE_MONEY } from './data/sample.js';
import { detectSchema, upgradeChecklist, detectProducts, productOptions } from './model/schema.js';
import { listInvoices, listClients, resolveInvoice } from './model/resolve.js';
import { emptyDraft, normaliseDraft, recalc, convertDraft } from './model/draft.js';
import { buildWritePlan, describePlan, existingNumbers } from './model/write.js';
import { buildUpgradePlan } from './model/migrate.js';
import { savePlan, applyUpgrade, queueToOutbox, releaseOutbox, createStarterTables } from './grist/writer.js';
import { renderSendPanel } from './compose/send-panel.js';
import { loadSettings, saveSettings, sanitise } from './settings/store.js';
import { numberFormatFor } from './settings/defaults.js';
import { renderSettingsPanel } from './settings/panel.js';
import { templatesBySector, findTemplate as findTradeTemplate, applyTemplate } from './templates/index.js';
import { starterTablesFor } from './templates/starter.js';
import { ensureFullAccess } from './grist/access.js';
import { computeTotals } from './money/totals.js';
import { assignNumber } from './money/numbering.js';
import { renderDocument } from './doc/render.js';
import { DOCUMENT_KINDS } from './doc/kinds.js';
import { LAYOUTS } from './doc/layouts.js';
import { renderComposer } from './compose/composer.js';
import { buildPreset, findPreset, simpleRate, RATES_UPDATED } from './money/tax/rates.js';

/**
 * Tax regimes offered in the demo bar.
 *
 * Each is a real configuration rather than a label. The two Indian entries differ only in place of
 * supply, and that difference is the whole reason the rate table has priorities.
 */
const REGIONS = [
  { id: 'gb', label: 'United Kingdom — VAT', money: { taxMode: 'preset', taxPreset: 'gb-vat', currency: 'GBP', homeCountry: 'GB', defaultCustomerCountry: 'GB' } },
  { id: 'de', label: 'Germany — VAT', money: { taxMode: 'preset', taxPreset: 'eu-vat', currency: 'EUR', homeCountry: 'DE', defaultCustomerCountry: 'DE', format: { position: 'right_space', thousandSeparator: '.', decimalSeparator: ',' } } },
  { id: 'in-intra', label: 'India — same state (CGST + SGST)', money: { taxMode: 'preset', taxPreset: 'in-gst', currency: 'INR', homeState: 'MH', homeCountry: 'IN', placeOfSupply: { country: 'IN', state: 'MH' } } },
  { id: 'in-inter', label: 'India — other state (IGST)', money: { taxMode: 'preset', taxPreset: 'in-gst', currency: 'INR', homeState: 'MH', homeCountry: 'IN', placeOfSupply: { country: 'IN', state: 'KA' } } },
  { id: 'ca-qc', label: 'Canada, Quebec — GST + compound QST', money: { taxMode: 'preset', taxPreset: 'ca-gst', currency: 'CAD', homeCountry: 'CA', placeOfSupply: { country: 'CA', state: 'QC' } } },
  { id: 'au', label: 'Australia — GST, tax-inclusive prices', money: { taxMode: 'preset', taxPreset: 'au-gst', currency: 'AUD', homeCountry: 'AU', defaultCustomerCountry: 'AU', pricesIncludeTax: true } },
  { id: 'none', label: 'Not registered for tax', money: { taxMode: 'none', taxPreset: null, currency: 'GBP', taxEnabled: false } },
];

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
  region: 'gb',
  setupTrade: 'freelancer',
  // 'demo' until connected, then 'full' or 'denied'. What Grist actually allows, not what was asked.
  access: 'demo',
  mode: 'view',      // view | compose | send | settings
  draft: null,
  busy: false,
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
function settingsNow() {
  const st = app.stored;
  return {
    ...st.document,
    ...st.delivery,
    sender: st.business,
    money: moneySettings(st.money),
    numberFormat: numberFormatFor(st, app.kind),
    kind: app.kind,
    // The bar's layout chooser is a per-session try-it-out; the stored one is the business's choice.
    layout: app.layout || st.document.layout,
  };
}

function setRegion(id) {
  const region = REGIONS.find((r) => r.id === id) || REGIONS[0];
  app.region = region.id;
  app.stored.money = sanitise({ money: { ...SAMPLE_MONEY, format: undefined, ...region.money } }).money;
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
      paymentDetails: 'Bank transfer to Thornbury Works\nSort code 01-02-03 · Account 12345678\nPlease quote the invoice number.',
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
  app.schema = detectSchema(tables);
  app.products = detectProducts(tables, app.schema);
}

async function boot() {
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
  } else {
    // ?empty exercises the setup path, which is otherwise unreachable in the demo because the
    // bundled document already has tables in it.
    const emptyDoc = new URLSearchParams(location.search).has('empty');
    app.provider = new DummyProvider(emptyDoc ? { defaultTable: null, tables: {} } : SAMPLE_DATA);
    app.live = false;
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
  if (row) {
    app.draft = resolveInvoice(row, app.schema, app.provider, settings);
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
  const plan = buildUpgradePlan(app.schema, columnsByTable);
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
  toast(`Added ${res.added} column${res.added === 1 ? '' : 's'}.`, 'ok');
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
  toast('Editing enabled.', 'ok');
  render();
}

// ---------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------

let previewHost = null;

/**
 * Tell the printer what paper this is.
 *
 * `@page` cannot be scoped by a selector — it is a page-level at-rule, so there is no way to write
 * one rule per paper size in a stylesheet and pick between them with a class. A managed style
 * element is the way to change it at runtime, and it keeps the printed output honest: choosing a
 * till roll and then pressing Print should produce a till roll, not an A4 sheet with a receipt in
 * the corner of it.
 */
const PAGE_CSS = {
  a4: 'A4', letter: 'letter', legal: 'legal', a5: 'A5',
  receipt80: '72mm auto', receipt58: '48mm auto',
};

function applyPaperSize(size) {
  const css = PAGE_CSS[size] || 'A4';
  const narrow = size === 'receipt80' || size === 'receipt58';
  let tag = document.getElementById('ap-page-rule');
  if (!tag) {
    tag = document.createElement('style');
    tag.id = 'ap-page-rule';
    document.head.appendChild(tag);
  }
  tag.textContent = `@media print { @page { size: ${css}; margin: ${narrow ? '3mm' : '14mm'}; } }`;
  document.documentElement.setAttribute('data-paper', size);
  document.documentElement.setAttribute('data-density', app.stored.document.density || 'normal');
}

function paintPreview() {
  if (!previewHost) return;
  const settings = settingsNow();
  applyPaperSize(app.stored.document.paperSize);
  const draft = app.mode === 'compose'
    ? (app.draft = recalc(app.draft, settings))
    : (currentRow() ? resolveInvoice(currentRow(), app.schema, app.provider, settings) : null);
  previewHost.replaceChildren(renderDocument(draft, settings));
}

function render() {
  const host = root();
  if (!host) return;
  clear(host);
  previewHost = el('div', { class: 'studio-page' });
  host.appendChild(el('div', { class: 'studio' }, [renderBar(), renderBody()]));
  paintPreview();
}

function renderBar() {
  const invoices = app.schema?.invoice ? listInvoices(app.schema, app.provider) : [];
  if (invoices.length && app.currentRowId == null) app.currentRowId = invoices[0].id;

  const picker = el('select', { class: 'studio-select', 'aria-label': 'Choose a document' },
    invoices.map((i) => el('option', {
      value: String(i.id), selected: i.id === app.currentRowId ? true : null,
      text: [i.number, i.client].filter(Boolean).join(' · '),
    })));
  picker.addEventListener('change', () => { app.currentRowId = Number(picker.value); app.mode = 'view'; render(); });

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

  return el('div', { class: 'studio-bar' }, [
    el('div', { class: 'studio-bar__brand' }, [
      el('span', { class: 'studio-bar__name', text: 'Invoice Studio' }),
      el('span', { class: 'studio-bar__mode', text: app.live ? (canWrite() ? 'Connected' : 'Read only') : 'Demo' }),
    ]),
    invoices.length ? picker : null,
    chooser('Document kind', DOCUMENT_KINDS, app.kind, (v) => { app.kind = v; if (app.draft) app.draft.kind = v; }),
    chooser('Layout', LAYOUTS, app.layout || app.stored.document.layout, (v) => { app.layout = v; if (app.draft) app.draft.layout = v; }),
    // Demo only. It exists so a visitor can flip between regimes and watch the totals change; on a
    // connected document it would OVERWRITE the business's saved tax settings with sample ones.
    // A real business sets tax up once, in Settings, not on every document.
    app.live ? null : chooser('Tax regime', REGIONS, app.region, setRegion),
    el('div', { class: 'studio-bar__spacer' }),
    app.live && !canWrite() ? btn('Enable editing', enableEditing, 'primary') : null,
    app.mode === 'compose'
      ? btn('Close', () => { app.mode = 'view'; app.draft = null; render(); })
      : btn('Edit', () => startCompose(currentRow())),
    app.mode === 'view' ? btn('New', () => startCompose(null)) : null,
    app.mode !== 'send' && currentRow() ? btn('Send', () => { app.mode = 'send'; render(); }, 'primary') : null,
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
  // An unreadable document is not an empty one, and telling somebody their invoices do not exist
  // when the truth is that this widget has not been allowed to look at them is the worse of the two
  // mistakes: it invites them to build a second set of tables alongside the ones they already have.
  if (app.live && app.access !== 'full') return renderAccessNeeded();

  const chooser = el('select', { class: 'studio-select', 'aria-label': 'What kind of work do you invoice for?' }, [
    el('option', { value: 'freelancer', text: 'Pick your trade…' }),
    ...templatesBySector().flatMap((g) => g.items.map((t) =>
      el('option', { value: t.id, selected: t.id === app.setupTrade ? true : null, text: `${g.sector} · ${t.label}` }))),
  ]);
  chooser.addEventListener('change', () => { app.setupTrade = chooser.value; });

  const go = el('button', { class: 'studio-btn studio-btn--primary', type: 'button', text: 'Set up this document' });
  go.addEventListener('click', async () => {
    // Four tables and a dozen records is a visible pause on a slow connection, and a button that
    // looks unpressed invites a second press — which would try to create the tables twice.
    go.disabled = true;
    chooser.disabled = true;
    go.textContent = 'Setting up…';
    await runSetup(chooser.value);
    if (go.isConnected) { go.disabled = false; chooser.disabled = false; go.textContent = 'Set up this document'; }
  });

  return el('div', { class: 'studio-notice studio-notice--warn' }, [
    el('strong', { text: 'This document has no invoices in it yet.' }),
    el('p', { text: 'Invoice Studio looks for a table with something like an invoice number, a client and a date. Nothing here matched, so it can build those tables for you, with a few invoices already in them to work from.' }),
    el('ul', { class: 'studio-setup__list' }, [
      el('li', { text: 'Clients, Products, Invoices and Invoice items' }),
      el('li', { text: 'Four invoices: one overdue, one paid, one sent and one still a draft' }),
      el('li', { text: 'Line items priced for the trade you pick' }),
    ]),
    el('div', { class: 'studio-setup__row' }, [chooser, go]),
    el('p', { class: 'studio-upgrade__note', text: 'Existing tables are never touched. Anything already in this document with one of these names is left exactly as it is.' }),
  ]);
}

async function runSetup(templateId) {
  if (app.busy) return;
  const template = findTradeTemplate(templateId);

  // The trade configures the settings as well as the sample data, and the settings have to be
  // worked out first: the tax they set up decides what a paid invoice was actually paid, and the
  // prefix they set up decides what the sample invoices are numbered.
  const next = sanitise(template ? applyTemplate(template, app.stored) : app.stored);
  const money = moneySettings(next.money);
  // A shop that picked "Retail — a till receipt" should not then be shown an invoice. The bar's
  // chooser still switches it afterwards; this only decides where it starts.
  const kind = template?.kind || 'invoice';

  const tables = starterTablesFor(templateId, {
    currency: next.money.currency,
    numberPrefix: numberFormatFor(next, kind).prefix.replace(/\{[^}]+\}/g, '').replace(/-+$/, '') + '-',
    grossOf: ({ lines, address }) => computeTotals({ lines, addresses: { billing: address } }, money).total,
  });

  app.busy = true;
  const res = await createStarterTables(tables, app.provider, { live: app.live });
  app.busy = false;

  if (!res.ok) { toast(res.error || 'Could not create the tables.', 'err'); return; }

  // Saved rather than only held in memory, or the wording and numbering chosen here are gone on
  // reload while the invoices they produced are not.
  const saved = await saveSettings(next);
  app.stored = saved.settings;
  app.kind = kind;
  app.layout = null;                 // let the template's layout through rather than the bar's
  rescan();
  app.currentRowId = null;
  toast(`Created ${res.created.join(', ')}.`, 'ok');
  render();
}

/** What we worked out about this document, said plainly rather than buried in a console log. */
function renderMapping() {
  const s = app.schema;
  if (!s || !s.invoice) return renderSetup();

  const recognised = s.source !== 'heuristic';
  const bits = [
    el('div', { class: 'studio-notice__head' }, [
      el('span', { class: 'studio-chip' + (recognised ? ' is-strong' : ''), text: recognised ? 'Recognised' : 'Matched by name' }),
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

  const todo = upgradeChecklist(s);
  const count = todo.invoice.length + todo.client.length + todo.line.length;
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
      el('ul', {}, [...todo.invoice, ...todo.client, ...todo.line].map((i) =>
        el('li', {}, [el('code', { text: i.id }), el('span', { text: ' — ' + i.why })]))),
      el('p', { class: 'studio-upgrade__note', text: 'Only adds columns. Nothing is renamed, retyped or removed, and running it again does nothing.' }),
      go,
    ]));
  }

  return el('div', { class: 'studio-notice' }, bits);
}

function renderBody() {
  const parts = [renderMapping()];

  if (app.mode === 'compose' && app.draft) {
    const plan = app.schema?.invoice ? buildPlan() : null;
    parts.push(renderComposer({
      draft: app.draft,
      schema: app.schema,
      clients: listClients(app.schema, app.provider),
      products: productOptions(app.products, app.provider),
      settings: settingsNow(),
      live: app.live,
      canWrite: canWrite(),
      planSummary: plan ? describePlan(plan) : '',
      skipped: plan ? plan.skipped : [],
      onEdit: paintPreview,
      onRebuild: () => render(),
      actions: {
        save,
        newDoc: () => startCompose(null),
        duplicate: () => {
          app.draft = normaliseDraft({ ...app.draft, rowId: null, number: '', status: 'Draft' });
          app.draft.lines = app.draft.lines.map((l) => ({ ...l, rowId: undefined }));
          render();
        },
        convert: (kindId) => { app.draft = convertDraft(app.draft, kindId); app.kind = kindId; render(); },
      },
    }));
  }

  if (app.mode === 'settings') {
    parts.push(renderSettingsPanel({
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
    }));
  }

  if (app.mode === 'send') {
    const settings = settingsNow();
    const row = currentRow();
    parts.push(renderSendPanel({
      draft: resolveInvoice(row, app.schema, app.provider, settings),
      settings,
      live: app.live,
      canWrite: canWrite(),
      onClose: () => { app.mode = 'view'; render(); },
      actions: {
        queue: (row2) => queueToOutbox(row2, app.provider, { live: app.live }),
        release: (ids) => releaseOutbox(ids, app.provider, { live: app.live }),
        recordSend,
      },
    }));
  }

  parts.push(previewHost);
  return el('div', { class: 'studio-body' }, parts);
}

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
