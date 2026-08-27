// Unifies the two data sources behind one interface the renderer/builder use.
// DummyProvider  -> bundled demo data (sync).
// GristProvider  -> live Grist tables via the bridge (cached after prime()).

import { DUMMY_DATA } from './dummy-data.js';
import * as grist from '../grist/bridge.js';
import { clone } from '../util.js';

class BaseProvider {
  tables() { return []; }
  columns() { return []; }
  records() { return []; }
  defaultTable() { return this.tables()[0]?.id || null; }
  async prime() {}
  // Force a re-read bypassing any cache (used by the Calendar block's polling refresh). The
  // base/demo case has nothing to re-fetch — demo data only ever changes via updateRecord()
  // below, which already mutates the live array — so this just returns the current rows.
  async refresh(tableId) { return this.records(tableId); }
  // Full re-read (header Refresh button). Demo data has no source behind it to re-read.
  async reload() { return { tables: this.tables().length, reloaded: 0 }; }
  // Write a single row's fields back to the source table. Read-only providers/blocks never call
  // this; it exists for the one block (Calendar, drag-to-reschedule) that edits data in place.
  // Returns false on failure (wrong permissions, detached demo row, etc.) rather than throwing,
  // so callers can show "couldn't save" instead of crashing the block.
  async updateRecord() { return false; }
  get isLive() { return false; }
}

export class DummyProvider extends BaseProvider {
  constructor(data = DUMMY_DATA) { super(); this.data = data; }
  tables() { return Object.values(this.data.tables).map((t) => ({ id: t.id, label: t.label })); }
  columns(tableId) { return (this.data.tables[tableId || this.data.defaultTable]?.columns) || []; }
  records(tableId) { return (this.data.tables[tableId || this.data.defaultTable]?.records) || []; }
  defaultTable() { return this.data.defaultTable; }
  // No real backing store to write to — mutate the demo row in place so the widget still feels
  // interactive in Demo mode, matching how every other "connect real Grist later" affordance here
  // degrades gracefully instead of just doing nothing.
  async updateRecord(table, rowId, fields) {
    const row = this.records(table).find((r) => r.id === rowId);
    if (!row) return false;
    Object.assign(row, fields);
    return true;
  }
  // Swap the whole bundled dataset (tables + defaultTable). Used when a template is applied in
  // Demo mode: there's no live Grist doc to write into, but the template ships its own sample
  // tables, so we point the demo provider straight at them. Every block on the applied page then
  // renders with real, template-appropriate rows — the applied page matches its preview exactly,
  // instead of showing empty cards for tables the general demo never had. Because main.js's
  // app.provider is this same instance, the swap persists after the builder exits into View mode.
  setData(data) { if (data && data.tables) this.data = data; }
}

export class GristProvider extends BaseProvider {
  constructor() {
    super();
    this._tables = []; this._cols = new Map(); this._rows = new Map(); this._default = null;
    // rowId -> display value, per referenced table and visible column. Built from a table this
    // provider already holds, so resolving a reference costs no network at all.
    this._refLabels = new Map();
  }
  get isLive() { return true; }

  async init() {
    const ids = await grist.listTables();
    this._tables = ids.map((id) => ({ id, label: id }));
    this._default = ids[0] || null;
    // Pre-load schema for every table so the builder can offer columns immediately.
    await Promise.all(ids.map((id) => this._loadColumns(id)));
    return this;
  }
  async _loadColumns(tableId) {
    if (this._cols.has(tableId)) return this._cols.get(tableId);
    const cols = await grist.getColumns(tableId);
    this._cols.set(tableId, cols);
    return cols;
  }
  // Load rows for the tables a design names. Two kinds of tolerance, both learned from a real
  // session log: a design frequently names tables the document no longer has — someone removed
  // them, or a template was replaced — and Grist answers a fetch for a missing table with a
  // sandbox KeyError. Asking anyway produced a wall of red in the console, twice per table, and
  // one Promise.all rejection took the whole prime down with it, so the tables that DID exist
  // never loaded either.
  async prime(tableIds = []) {
    const known = new Set(this._tables.map((t) => t.id));
    const wanted = [...new Set(tableIds.filter(Boolean))];
    // Only filter when the table list is actually known; an empty list means init() has not run
    // or failed, and silently priming nothing would be worse than trying.
    const ids = known.size ? wanted.filter((id) => known.has(id)) : wanted;
    const missing = wanted.filter((id) => !ids.includes(id));
    if (missing.length) {
      console.warn('[ANUPRESS] design references tables not in this document:', missing.join(', '));
    }
    await Promise.all(ids.map(async (id) => {
      try {
        const cols = await this._loadColumns(id);
        if (!this._rows.has(id)) this._rows.set(id, await grist.getRecords(id, cols));
      } catch (e) {
        // One unreadable table must not cost the others their rows.
        console.warn(`[ANUPRESS] could not load ${id}`, e);
      }
    }));

    // A Reference column stores a row id, and the label for it lives in the table it points at. If
    // that table is not on the page it was never loaded, and every reference would fall back to
    // printing its id. So pull in the targets too — ONE whole-table fetch each, which is what keeps
    // this cheap: a reference costs a fetch per referenced TABLE, never one per row.
    const targets = new Set();
    for (const id of ids) {
      for (const c of this._cols.get(id) || []) {
        if (c.refTable && !this._rows.has(c.refTable) && known.has(c.refTable)) targets.add(c.refTable);
      }
    }
    if (targets.size) {
      await Promise.all([...targets].map(async (id) => {
        try {
          const cols = await this._loadColumns(id);
          this._rows.set(id, await grist.getRecords(id, cols));
        } catch (e) {
          console.warn(`[ANUPRESS] could not load referenced table ${id}`, e);
        }
      }));
    }
  }

  /**
   * The labels a Reference column should display instead of its row ids.
   *
   * Cached per target table and visible column, and thrown away whenever that table's rows are
   * invalidated — a stale label is worse than a row id, because it looks right.
   */
  _labelsFor(refTable, visibleCol) {
    const key = refTable + '|' + (visibleCol || '');
    if (this._refLabels.has(key)) return this._refLabels.get(key);
    const rows = this._rows.get(refTable);
    if (!rows) return null;          // not loaded; formatCellValue falls back to the row id
    const map = Object.create(null);
    for (const r of rows) map[r.id] = visibleCol ? r[visibleCol] : r.id;
    this._refLabels.set(key, map);
    return map;
  }
  // Re-fetch the table list from Grist and load BOTH schema and rows for any table that wasn't
  // there before. Used after the template picker creates new tables via createTableWithRecords —
  // the provider's own snapshot from init() predates them, so without this the next rerender
  // wouldn't know the new tables exist. Rows matter as much as columns here: loading only the
  // schema would leave a freshly-created (and freshly-populated) table rendering every block
  // empty, since records() reads from _rows — the exact "0 / No data to display yet" symptom.
  async refreshTables() {
    grist.invalidateMetaCache();
    const ids = await grist.listTables();
    this._tables = ids.map((id) => ({ id, label: id }));
    // Evict tables that are no longer in the document.
    //
    // This only ever ADDED: it loaded columns and rows for names it had not seen, and left
    // everything else in place. So a table deleted from Grist kept serving its old columns and
    // rows out of the cache indefinitely. Most visibly, "Start from scratch" listed five Research
    // Labs tables as candidates for removal in a document where they no longer existed, because
    // the schema check that identifies them was reading the cached copy.
    const live = new Set(ids);
    for (const id of [...this._cols.keys()]) if (!live.has(id)) this._cols.delete(id);
    for (const id of [...this._rows.keys()]) if (!live.has(id)) this._rows.delete(id);
    if (!this._default || !live.has(this._default)) this._default = ids[0] || null;
    const fresh = ids.filter((id) => !this._cols.has(id));
    await Promise.all(fresh.map(async (id) => {
      const cols = await this._loadColumns(id);
      this._rows.set(id, await grist.getRecords(id, cols));
    }));
    return this._tables;
  }
  invalidate(tableId) { this._refLabels.clear(); if (tableId) this._rows.delete(tableId); else this._rows.clear(); }

  // A complete re-read of the document, for the header's Refresh button.
  //
  // invalidate() + prime() only replaces ROWS. That covers a cell someone edited, but not a column
  // they added or renamed, and not a table they created — the column metadata and the table list
  // are cached too, so those changes stayed invisible until the widget was reloaded. Refresh is
  // the one action whose entire purpose is "show me what the document says now", so it drops all
  // three caches and reads them again.
  //
  // Only the named tables get their rows re-fetched (the ones the page actually draws); schema and
  // the table list are refreshed wholesale because they are one request each regardless.
  async reload(tableIds = []) {
    grist.invalidateMetaCache();
    this._cols.clear();
    this._rows.clear();
    const ids = await grist.listTables();
    this._tables = ids.map((id) => ({ id, label: id }));
    if (!ids.includes(this._default)) this._default = ids[0] || null;
    const wanted = [...new Set(tableIds.filter((t) => t && ids.includes(t)))];
    await Promise.all(wanted.map(async (id) => {
      const cols = await this._loadColumns(id);
      this._rows.set(id, await grist.getRecords(id, cols));
    }));
    return { tables: this._tables.length, reloaded: wanted.length };
  }
  // Unconditional re-fetch (prime() above deliberately skips tables it already has cached).
  // Used for polling a table a Calendar block is currently displaying, so edits made directly in
  // Grist while the widget is open still show up here — there's no push/subscribe channel this
  // app uses, so "syncs to the widget" means "gets picked up on the next poll," not instant.
  async refresh(tableId) {
    const id = tableId || this._default;
    if (!id) return [];
    const cols = await this._loadColumns(id);
    const rows = await grist.getRecords(id, cols);
    this._rows.set(id, rows);
    return rows;
  }
  // Writes through to Grist first; only mutates the local cache (so the just-edited row reflects
  // its new value immediately, without waiting for the next poll) once that write has actually
  // succeeded — never optimistic-update-then-hope.
  async updateRecord(table, rowId, fields) {
    const ok = await grist.updateRecord(table, rowId, fields);
    if (ok) { const row = this._rows.get(table)?.find((r) => r.id === rowId); if (row) Object.assign(row, fields); }
    return ok;
  }

  tables() { return this._tables; }
  columns(tableId) {
    const cols = this._cols.get(tableId || this._default) || [];
    // Mutated in place rather than mapped to fresh objects: this runs on every render, and handing
    // back a new array of new objects each time would defeat every identity check downstream.
    for (const c of cols) if (c.refTable) c.refLabels = this._labelsFor(c.refTable, c.refVisibleCol);
    return cols;
  }
  records(tableId) { return this._rows.get(tableId || this._default) || []; }
  defaultTable() { return this._default; }
}

// Collect every table id referenced by a site config (so a provider can prime them).
export function tablesInConfig(config) {
  const ids = new Set();
  if (config?.dataTable) ids.add(config.dataTable);
  for (const tab of config?.tabs || []) for (const b of tab.blocks || []) {
    const t = b.config?.table || b.config?.ref?.table || config?.dataTable; if (t) ids.add(t);
    // Invoice is the one block that reads MORE than one table: its client address book and its
    // line items. Leaving them out of this list means they are never primed, so on a live document
    // the invoice would render with no address and fall back to a single line — a quietly wrong
    // document rather than an obviously broken one, which is worse.
    if (b.type === 'invoice') {
      if (b.config?.clientTable) ids.add(b.config.clientTable);
      if (b.config?.itemsTable) ids.add(b.config.itemsTable);
    }
  }
  return [...ids];
}

const dimCol = (cols, exclude) => cols.find((x) => x.id !== exclude && /text|choice|date/i.test(x.type)) || cols.find((x) => x.id !== exclude) || null;
const measureCol = (cols, exclude) => cols.find((x) => x.id !== exclude && /int|numeric|number|currency/i.test(x.type)) || cols.find((x) => x.id !== exclude) || null;
const dateCol = (cols) => cols.find((x) => /date/i.test(x.type)) || null;

/**
 * How many values a chart type cannot do without.
 *
 * A scatter plots one measure against another, and a funnel whose stages ARE its measures needs at
 * least two stages to be a funnel at all. Everything else works with one.
 */
function minMeasuresFor(cfg) {
  if (cfg.chartType === 'scatter') return 2;
  if (cfg.chartType === 'funnel' && !(cfg.dims || []).length) return 2;
  return 1;
}

/**
 * Re-point a chart's values at columns that exist, WITHOUT changing how many it has.
 *
 * This used to collapse to a single measure whenever any one of them was missing, which quietly
 * broke every chart that needs two or more: a scatter lost the column it plots up the y-axis, and
 * a staged funnel stopped being a funnel and fell through to a one-band shape. Columns that still
 * exist are kept in their authored order — the order is the meaning, for a funnel — and the list
 * is topped up from the table's remaining numeric columns only as far as the type requires.
 */
function repairMeasures(cfg, cols, has) {
  const kept = (cfg.measures || []).filter(has);
  const need = minMeasuresFor(cfg);
  if (kept.length >= need) return kept;
  const pool = cols
    .filter((c) => /int|numeric|number|currency/i.test(c.type))
    .map((c) => c.id)
    .filter((id) => !kept.includes(id) && !(cfg.dims || []).includes(id));
  while (kept.length < need && pool.length) kept.push(pool.shift());
  if (kept.length) return kept;
  const fallback = measureCol(cols, (cfg.dims || [])[0]);
  return fallback ? [fallback.id] : [];
}
const geoCol = (cols, pattern) => cols.find((x) => pattern.test(x.id) || pattern.test(x.label || '')) || null;

// Validates + repairs one block's column references against whichever table it's already been
// resolved onto (mutates b.config in place). Shared by both adapt functions below — table
// *selection* differs between them (see each function's own comment), but once a block is on a
// table, "does this block's column still exist on it" is the same question either way.
function repairBlockColumns(b, cols) {
  const has = (id) => id != null && cols.some((x) => x.id === id);
  if (b.type === 'stat') {
    if (!has(b.config.column)) b.config.column = measureCol(cols)?.id ?? null;
    // A deltaBy pointing at a column this table doesn't have yields no trend and no sparkline,
    // silently. Delete rather than null it — unset means "automatic", null means "off on purpose".
    if (b.config.deltaBy != null && !has(b.config.deltaBy)) delete b.config.deltaBy;
  } else if (b.type === 'chart') {
    const dims = b.config.dims || [], measures = b.config.measures || [];
    // dims.every(has) is true for an empty list, so a chart that deliberately has no dimension —
    // a gauge, or a funnel whose stages are its measures — keeps it that way.
    if (!dims.every(has)) { const d = dimCol(cols); b.config.dims = d ? [d.id] : []; }
    if (!measures.every(has)) b.config.measures = repairMeasures(b.config, cols, has);
  } else if (b.type === 'breakdown') {
    if (!has(b.config.column)) b.config.column = dimCol(cols)?.id ?? null;
  } else if (b.type === 'progress' && b.config.mode === 'data') {
    if (!has(b.config.valueColumn)) b.config.valueColumn = measureCol(cols)?.id ?? null;
    if (b.config.targetColumn && !has(b.config.targetColumn)) b.config.targetColumn = null;
  } else if (b.type === 'livetable') {
    const cfgCols = b.config.columns || [];
    if (cfgCols.length && !cfgCols.every(has)) { b.config.columns = []; b.config.highlights = []; } // [] => show every real column; stale highlight ranges would now paint the wrong cells
  } else if (b.type === 'calendar') {
    if (!has(b.config.dateColumn)) b.config.dateColumn = dateCol(cols)?.id ?? null;
    if (!has(b.config.titleColumn)) b.config.titleColumn = dimCol(cols, b.config.dateColumn)?.id ?? null;
    if (b.config.detailColumn && !has(b.config.detailColumn)) b.config.detailColumn = null; // legacy single field
    if ((b.config.detailColumns || []).length) b.config.detailColumns = b.config.detailColumns.filter(has);
    if (!has(b.config.colorBy)) b.config.colorBy = null;
  } else if (b.type === 'invoice') {
    // Invoice is the only block with SECONDARY table references — a client address book and a
    // line-items table. repairBlockColumns is told about the columns of the primary table only,
    // so those two are handled by adaptConfigToTable/adaptTemplateToTable, which know the real
    // table list. Here we only fix the columns that must live on the invoice table itself.
    if (!has(b.config.numberColumn)) b.config.numberColumn = dimCol(cols)?.id ?? null;
    if (!has(b.config.clientColumn)) b.config.clientColumn = dimCol(cols, b.config.numberColumn)?.id ?? null;
    if (!has(b.config.amountColumn)) b.config.amountColumn = measureCol(cols)?.id ?? null;
    if (!has(b.config.dateColumn)) b.config.dateColumn = dateCol(cols)?.id ?? null;
    for (const k of ["dueColumn", "statusColumn", "noteColumn"]) if (!has(b.config[k])) b.config[k] = null;
  } else if (b.type === 'map') {
    if (!has(b.config.latColumn) || !has(b.config.lonColumn)) {
      const lat = geoCol(cols, /lat/i), lon = lat && geoCol(cols, /lon|lng/i);
      b.config.latColumn = lat && lon ? lat.id : null;
      b.config.lonColumn = lat && lon && lon.id !== lat.id ? lon.id : null;
    }
    if (!has(b.config.labelColumn)) b.config.labelColumn = dimCol(cols)?.id ?? null;
    if (!has(b.config.colorBy)) b.config.colorBy = null;
    if ((b.config.popupColumns || []).length) b.config.popupColumns = b.config.popupColumns.filter(has);
  }
}

// First-connect remap: when a fresh user opens the demo and connects Grist, point the *bundled
// default site* (Sales/People, not a template) at their table so they see something immediately
// — there's no table name in DEFAULT_SITE that could ever match a real doc, so this always
// force-collapses every block onto the target's default table and repairs columns to match.
// This is the "before you've configured anything, show *something*" first-run experience —
// deliberately more aggressive than adaptTemplateToTable below, which is for a different moment
// (browsing a template library, not your first-ever connect).

// The invoice block points at two tables besides its own. repairBlockColumns only knows about the
// primary table's columns, so clearing a dangling client or line-items reference happens here,
// where the real table list is in hand. Cleared rather than remapped: an invoice billing lines
// from an unrelated table would be a wrong bill, whereas cleared simply falls back to the
// single-amount form, which is correct just less detailed.
function dropMissingInvoiceTables(b, realTableIds) {
  if (b.type !== 'invoice' || !b.config) return;
  if (b.config.clientTable && !realTableIds.has(b.config.clientTable)) {
    b.config.clientTable = null; b.config.clientAddressColumns = [];
  }
  if (b.config.itemsTable && !realTableIds.has(b.config.itemsTable)) {
    b.config.itemsTable = null; b.config.itemsLinkColumn = null;
    b.config.itemDescColumn = null; b.config.itemQtyColumn = null;
    b.config.itemPriceColumn = null; b.config.itemTotalColumn = null;
  }
}

export function adaptConfigToTable(config, provider) {
  const table = provider.defaultTable();
  if (!table) return config;
  const realTableIds = new Set(provider.tables().map((t) => t.id));
  const c = clone(config);
  c.dataTable = table;
  for (const tab of c.tabs || []) for (const b of tab.blocks || []) {
    if (!b.config) continue;
    b.config.table = table;
    repairBlockColumns(b, provider.columns(table));
    dropMissingInvoiceTables(b, realTableIds);
  }
  return c;
}

// Template-apply remap: only ever repoints a block's table when there's a real reason to believe
// it's right — either the table name matches one that genuinely exists on the target (e.g.
// Research Labs' own 'Samples'/'Reagents'/'Tasks'/'People'), or the block uses 'Data', the
// deliberate shared placeholder every simple template (templates/_helpers.js) is authored
// against specifically so it collapses onto "whatever your main table is". Anything else is left
// completely intact — table AND columns unchanged — rather than guessed onto an unrelated real
// table. Feedback (2026-08-11): silently forcing a template's blocks onto whatever table happened
// to be open produced technically-non-blank but *wrong*-looking results (e.g. a "Samples Logged"
// stat card quietly showing a Sales row count) — worse than an honest "not configured yet" block,
// which is what an unmatched block now renders as (records()/columns() on a table id that doesn't
// exist on this provider just come back empty). The user then repoints it manually via Edit, same
// as any other block — that's the intended flow: install intact, customize afterward.
export function adaptTemplateToTable(config, provider) {
  const table = provider.defaultTable();
  if (!table) return config;
  const realTableIds = new Set(provider.tables().map((t) => t.id));
  const c = clone(config);
  // dataTable is the site-level fallback: what a block with no table of its own reads, and what a
  // newly added block defaults to. This used to be overwritten with the provider's first table
  // unconditionally, which contradicts the rule applied to blocks just below — installing Higher
  // Education into a doc whose first table happened to be 'BoxOverview' left dataTable pointing
  // there rather than at the 'Courses' table the template had just created. Same test as a block:
  // keep what the template declares when that table really exists now, otherwise fall back.
  // (By the time this runs, template-picker.js has already created the template's tables and
  // called provider.refreshTables(), so they are present in realTableIds.)
  c.dataTable = (c.dataTable && realTableIds.has(c.dataTable)) ? c.dataTable : table;
  for (const tab of c.tabs || []) for (const b of tab.blocks || []) {
    if (!b.config) continue;
    const ownTable = b.config.table;
    const isRealMatch = ownTable && realTableIds.has(ownTable);
    const isFallbackPlaceholder = ownTable === 'Data';
    if (!isRealMatch && !isFallbackPlaceholder) continue; // leave this block exactly as authored
    const bTable = isRealMatch ? ownTable : table;
    b.config.table = bTable;
    repairBlockColumns(b, provider.columns(bTable));
    dropMissingInvoiceTables(b, realTableIds);
  }
  return c;
}
