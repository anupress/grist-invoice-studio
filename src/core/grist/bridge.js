// Thin wrapper around the Grist Plugin API. Everything is defensive: if `grist` is not
// present (e.g. the page is opened directly, outside Grist), every call resolves to a
// safe empty value so the app falls back to Demo mode. ANUPRESS never sends data anywhere;
// all calls below talk only to the embedding Grist document.

import { zoneOfType, toDayString } from './dates.js';

export const CONFIG_TABLE = 'ANUPRESS_Config';
export const THEME_TABLE = 'ANUPRESS_Theme';
const CONFIG_KEY = 'site';
const OPTION_KEY = 'anupressSiteConfig';

const g = () => (typeof window !== 'undefined' ? window.grist : undefined);

// window.grist exists whenever the API script is loaded — even outside Grist. So presence
// alone is not enough; `connect()` performs a timed handshake to decide if we're truly live.
const apiPresent = () => { try { return !!g() && typeof g().ready === 'function'; } catch { return false; } };

let _connected = false;
let _access = 'none';
export const isLive = () => _connected;
export const hasGrist = () => _connected;        // kept for callers; now means "really connected"
export const accessLevel = () => _access;

function withTimeout(promise, ms, label) {
  // The timer is cleared once the race settles: a two-minute timer left running kept every test
  // process alive for two minutes after its last assertion.
  let timer;
  const clock = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('timeout:' + (label || ''))), ms); });
  return Promise.race([Promise.resolve(promise), clock]).finally(() => clearTimeout(timer));
}

// Probe whether we're embedded in a responsive Grist. Resolves to false when the page is opened
// standalone (GitHub Pages / preview) so the app can render Demo mode.
//
// grist.ready() returns nothing — it posts "ready" to the parent window and returns synchronously,
// whatever that parent is. So awaiting it proves nothing: inside an iframe on any web page it
// "succeeded" at once, the app went live, and the first real call (settings, tables) waited
// forever for a host that was never there — a blank widget on every blog post that embedded the
// demo without ?demo. What proves a Grist host is a message FROM it: Grist answers ready with its
// settings and theme straight away, at every access level, before the user has allowed anything.
// That reply, within the timeout, is the handshake.
export async function connect(timeoutMs = 4000) {
  if (_connected) return true;
  if (!apiPresent()) return false;
  // Explicit demo flag (?demo) — preview the editor anywhere without touching Grist.
  try { const p = new URLSearchParams(location.search); if (p.has('demo') || p.has('apdemo')) return false; } catch {}
  // Top-level (not in an iframe) => definitely not embedded in Grist.
  try { if (window.self === window.top) return false; } catch { /* cross-origin => in a frame */ }
  try {
    const api = g();
    const hostAnswered = new Promise((resolve) => {
      try { api.on('message', () => resolve(true)); } catch { /* no event bus: only ready() can tell us */ }
    });
    // ready() may itself return a promise in a future API; accept either, but never rely on it.
    const readyRet = api.ready({ requiredAccess: 'read table' });
    const proof = typeof api.on === 'function' ? hostAnswered : Promise.resolve(readyRet);
    await withTimeout(proof, timeoutMs, 'host');
    _connected = true; _access = 'read table';
    return true;
  } catch (e) { return false; }
}

// Call grist.ready with the requested access (escalation). Only meaningful once connected.
// The timeout is generous: the user may take a while to click "Allow" in Grist's own prompt.
export async function ready(requiredAccess = 'read table', timeoutMs = 120000) {
  if (!apiPresent()) return false;
  try {
    await withTimeout(g().ready({ requiredAccess }), timeoutMs, 'ready');
    _connected = true; _access = requiredAccess;
    return true;
  } catch (e) { console.warn('[ANUPRESS] grist.ready failed', e); return false; }
}
export const escalateToFull = () => ready('full');

// ---- Schema ----
// The table list is memoised for the same reason the meta tables are. Grist answers
// docApi.listTables() by fetching _grist_Tables, so every call is a network round trip, and the
// log of a single session showed five of them: provider init, loadConfig, then ensureTables, a
// second init and clearStoredConfig once Edit was opened. The list only changes when a table is
// created or removed, and every one of those paths already calls invalidateMetaCache().
function fetchTableList() { return _tableListP ||= g().docApi.listTables(); }

export async function listTables() {
  if (!hasGrist()) return [];
  try {
    const ids = await fetchTableList();
    return ids.filter((t) => !/^_grist_/.test(t) && t !== CONFIG_TABLE && t !== THEME_TABLE);
  } catch { return []; }
}

// columnar { id:[...], col:[...] } -> array of row objects
function columnarToRows(tbl) {
  const keys = Object.keys(tbl || {});
  const n = tbl?.id?.length || 0;
  const rows = [];
  for (let i = 0; i < n; i++) { const r = {}; for (const k of keys) r[k] = tbl[k][i]; rows.push(r); }
  return rows;
}

// Meta tables cache — _grist_Tables and _grist_Tables_column change so rarely that a per-session
// fetch is safe and cheap. Without this cache, GristProvider.init() re-fetched both tables for
// every user table (9 tables → 18 network round-trips). One promise each, reused.
let _metaTablesP = null, _metaColumnsP = null, _metaAttachmentsP = null, _tableListP = null;
function fetchMetaTables()  { return _metaTablesP  ||= g().docApi.fetchTable('_grist_Tables'); }
function fetchMetaColumns() { return _metaColumnsP ||= g().docApi.fetchTable('_grist_Tables_column'); }
function fetchMetaAttachments() { return _metaAttachmentsP ||= g().docApi.fetchTable('_grist_Attachments'); }
export function invalidateMetaCache() { _metaTablesP = null; _metaColumnsP = null; _metaAttachmentsP = null; _tableListP = null; }

// ---- Attachments ----
// An Attachments-type cell value comes back from fetchTable as either null (empty) or a
// Grist list-tuple ['L', id1, id2, ...] (occasionally a bare array/number defensively tolerated
// too). We only ever show the first attached file per cell.
export function firstAttachmentId(cellValue) {
  if (cellValue == null) return null;
  if (typeof cellValue === 'number') return cellValue;
  if (Array.isArray(cellValue)) {
    const list = cellValue[0] === 'L' ? cellValue.slice(1) : cellValue;
    return list.length ? list[0] : null;
  }
  return null;
}

// Resolve a raw attachment row id to live metadata + a FRESH, token-authed download URL.
// Access tokens are short-lived — this is never cached; call it again each time you need the URL
// (e.g. every render pass), and never persist the resolved `url` itself into saved config.
export async function resolveAttachmentById(attId) {
  if (!hasGrist() || attId == null) return null;
  try {
    const meta = await fetchMetaAttachments();
    const idx = (meta.id || []).indexOf(attId);
    if (idx < 0) return null;
    const token = await g().docApi.getAccessToken({ readOnly: true });
    if (!token?.baseUrl || !token?.token) return null;
    return {
      id: attId,
      url: `${token.baseUrl}/attachments/${attId}/download?auth=${token.token}`,
      fileName: meta.fileName?.[idx] ?? null,
      fileType: meta.fileType?.[idx] ?? null,
      imageWidth: meta.imageWidth?.[idx] ?? null,
      imageHeight: meta.imageHeight?.[idx] ?? null,
    };
  } catch (e) { console.warn('[ANUPRESS] resolveAttachmentById failed', e); return null; }
}

// Convenience for block renderers that already have the row (e.g. from provider.records()) —
// resolves an Attachments-column cell value directly, avoiding a second per-row schema round trip.
export async function resolveAttachmentCell(cellValue) {
  const id = firstAttachmentId(cellValue);
  return id == null ? null : resolveAttachmentById(id);
}

// Read real column types from Grist metadata; fall back to value inference.
export async function getColumns(tableId) {
  if (!hasGrist()) return [];
  try {
    const [metaT, metaC] = await Promise.all([fetchMetaTables(), fetchMetaColumns()]);
    const tRowToId = {};
    for (let i = 0; i < metaT.id.length; i++) tRowToId[metaT.id[i]] = metaT.tableId[i];
    // A Reference column stores a ROW ID, and the thing to show in its place lives in another
    // table's column — named by `visibleCol`, which is itself a row id into this same metadata
    // table. Without this map a Ref cell renders as the bare number Grist stores, which is how a
    // client called "Northgate Realty" ends up printed as "4".
    const cRowToColId = {};
    for (let i = 0; i < metaC.id.length; i++) cRowToColId[metaC.id[i]] = metaC.colId[i];
    const cols = [];
    for (let i = 0; i < metaC.id.length; i++) {
      if (tRowToId[metaC.parentId[i]] !== tableId) continue;
      const colId = metaC.colId[i];
      if (!colId || colId === 'manualSort' || /^gristHelper_/.test(colId)) continue;
      // isFormula travels with the column because a formula cell cannot be written to — Grist
      // rejects the action — so the data editor has to render those read-only rather than offer
      // an input that silently fails on save. Older documents may not report it; absent means
      // "not a formula", which is the safe default (a normal column stays editable).
      // widgetOptions carries the format the document's owner already chose for this column —
      // currency, decimal places, percent. Dropping it meant a column displayed as "$204,972.00"
      // in Grist printed as "204972" here, which reads like a different number. Mirroring what
      // Grist shows is always righter than inventing our own formatting on top of it.
      let widgetOptions = null;
      try {
        const raw = metaC.widgetOptions && metaC.widgetOptions[i];
        if (raw) widgetOptions = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch { /* a malformed option blob is not worth failing a column over */ }
      const type = String(metaC.type[i] || 'Text');
      // Ref:Clients / RefList:Tasks — the target table is the half after the colon. A visibleCol of
      // 0 means the document really is showing row ids, so leaving it null keeps that faithful.
      const refMatch = /^(Ref|RefList):(.+)$/.exec(type);
      const visRow = metaC.visibleCol && metaC.visibleCol[i];
      cols.push({
        id: colId, label: metaC.label[i] || colId, type,
        isFormula: !!(metaC.isFormula && metaC.isFormula[i]) && !!(metaC.formula && metaC.formula[i]),
        widgetOptions,
        refTable: refMatch ? refMatch[2] : null,
        refVisibleCol: refMatch && visRow ? (cRowToColId[visRow] || null) : null,
      });
    }
    if (cols.length) return cols;
  } catch (e) { /* fall through to inference */ }
  try {
    const tbl = await g().docApi.fetchTable(tableId);
    return inferColumns(tbl);
  } catch { return []; }
}

function inferColumns(tbl) {
  return Object.keys(tbl).filter((k) => k !== 'id' && k !== 'manualSort' && !/^gristHelper_/.test(k))
    .map((k) => ({ id: k, label: k, type: inferType(tbl[k]) }));
}
function inferType(values) {
  let num = 0, total = 0;
  for (const v of values) { if (v == null || v === '') continue; total++; if (typeof v === 'number' || (!isNaN(parseFloat(v)) && isFinite(v))) num++; }
  if (total && num / total > 0.85) return 'Numeric';
  return 'Text';
}

// Fetch rows, converting Grist Date/DateTime timestamps to 'YYYY-MM-DD' strings for display.
//
// The conversion is per COLUMN, not per value, because a DateTime column's type string carries the
// zone its instants should be read in — see grist/dates.js. Reading every column in UTC (what this
// used to do) is correct for Date and off by a day for DateTime in one direction or the other,
// depending on which side of UTC the zone sits.
export async function getRecords(tableId, columns) {
  if (!hasGrist()) return [];
  try {
    const tbl = await g().docApi.fetchTable(tableId);
    let rows = columnarToRows(tbl);
    const dateCols = (columns || [])
      .map((c) => ({ id: c.id, zone: zoneOfType(c.type) }))
      .filter((c) => c.zone !== undefined);
    if (dateCols.length) {
      rows = rows.map((r) => {
        const o = { ...r };
        for (const { id, zone } of dateCols) o[id] = toDayString(r[id], zone);
        return o;
      });
    }
    return rows;
  } catch { return []; }
}

// ---- Widget options (persist without needing full doc access) ----
export async function getOption(key = OPTION_KEY) {
  if (!hasGrist()) return null;
  try { if (g().getOption) return await g().getOption(key);
    if (g().widgetApi) { const o = await g().widgetApi.getOptions(); return o ? o[key] : null; } } catch {}
  return null;
}
export async function setOption(value, key = OPTION_KEY) {
  if (!hasGrist()) return false;
  try { if (g().setOption) { await g().setOption(key, value); return true; }
    if (g().widgetApi) { await g().widgetApi.setOptions({ [key]: value }); return true; } } catch {}
  return false;
}

// ---- Table creation + config persistence (needs full access) ----
export async function ensureTables() {
  if (!hasGrist()) return false;
  const existing = new Set(await safeListAll());
  const actions = [];
  // Everything (layout, theme, logo, custom icons) lives in this one table's JSON value.
  if (!existing.has(CONFIG_TABLE)) actions.push(['AddTable', CONFIG_TABLE, [{ id: 'Key', type: 'Text' }, { id: 'Value', type: 'Text' }]]);
  if (!actions.length) return true;
  try { await g().docApi.applyUserActions(actions); invalidateMetaCache(); return true; }
  catch (e) { console.warn('[ANUPRESS] ensureTables failed', e); return false; }
}
async function safeListAll() { try { return await fetchTableList(); } catch { return []; }

}

// ---- Config size and chunked storage ----
//
// Grist caps an API request body at 1 MB, and that cap is IDENTICAL on every plan — Free, Pro and
// Business differ on rows, document data and attachment space, but not on this. So a paying
// customer with 300 MB of document allowance still cannot push more than 1 MB in a single save,
// and there is nothing to unlock by detecting their plan.
//
// The whole design — layout, theme, logo, hero slides, uploaded images — is one JSON string, so
// that cap was the real ceiling. Splitting the JSON across several ROWS inside one request would
// not have helped (the limit is on the request, not the row), but splitting it across several
// REQUESTS does, and that is what happens below: no ceiling, on any plan.
//
// Crash safety comes from writing in the right order. Every part is written first, under a fresh
// generation id, and only then is the pointer row flipped to that generation. An interrupted save
// therefore leaves the previous config whole and readable — a half-written design is never what
// gets loaded. Stale generations are swept afterwards.
//
// Note this trades against the document DATA quota (10 MB Free / 200 MB Pro / 300 MB Business),
// which chunking cannot change. Images stored as Grist attachments would draw on the separate
// 1-3 GB attachment allowance instead; that remains the better long-term home for artwork.
const CHUNK_BYTES = 300 * 1024;    // comfortably inside the 1 MB request cap, headroom for overhead
const OPTION_MAX = 300 * 1024;     // widget options are a render cache, not the source of truth
const CHUNK_PREFIX = 'site~';      // rows are site~<gen>~<index>
export const CONFIG_SOFT_LIMIT = 700 * 1024;   // informational: the design is getting heavy
export const CONFIG_HARD_LIMIT = 1024 * 1024;  // one request's worth — above this we chunk

export function measureConfig(configObj) {
  let bytes = 0;
  try { bytes = new Blob([JSON.stringify(configObj)]).size; }
  catch { try { bytes = JSON.stringify(configObj).length; } catch { bytes = 0; } }
  return { bytes, overSoft: bytes >= CONFIG_SOFT_LIMIT, overHard: bytes >= CONFIG_HARD_LIMIT, chunked: bytes > CHUNK_BYTES };
}

const splitChunks = (s, n) => { const out = []; for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n)); return out; };

// Write one config across as many requests as it takes. Returns true only if the pointer flipped.
async function saveChunked(json) {
  const parts = splitChunks(json, CHUNK_BYTES);
  const gen = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const tbl = await g().docApi.fetchTable(CONFIG_TABLE);
  const byKey = new Map();
  for (let i = 0; i < (tbl.id?.length || 0); i++) byKey.set(tbl.Key[i], tbl.id[i]);

  // 1. every part, one request each, under the new generation
  for (let i = 0; i < parts.length; i++) {
    await g().docApi.applyUserActions([['AddRecord', CONFIG_TABLE, null, { Key: `${CHUNK_PREFIX}${gen}~${i}`, Value: parts[i] }]]);
  }
  // 2. flip the pointer — the single moment the new config becomes the live one
  const pointer = JSON.stringify({ __apChunked: 1, gen, parts: parts.length });
  if (byKey.has(CONFIG_KEY)) await g().docApi.applyUserActions([['UpdateRecord', CONFIG_TABLE, byKey.get(CONFIG_KEY), { Value: pointer }]]);
  else await g().docApi.applyUserActions([['AddRecord', CONFIG_TABLE, null, { Key: CONFIG_KEY, Value: pointer }]]);
  // 3. sweep older generations; failure here wastes space but breaks nothing
  const stale = [];
  for (const [key, id] of byKey) if (key.startsWith(CHUNK_PREFIX) && !key.startsWith(`${CHUNK_PREFIX}${gen}~`)) stale.push(id);
  if (stale.length) {
    try { await g().docApi.applyUserActions([['BulkRemoveRecord', CONFIG_TABLE, stale]]); }
    catch (e) { console.warn('[ANUPRESS] could not sweep old config chunks', e); }
  }
  return true;
}

// Stamped on every save so the two stores can be compared. Without it there is no way to tell a
// fresh config from a stale one, which is the whole problem described on loadConfig() below.
const REV_KEY = '__apRev';
const revOf = (cfg) => { const r = Number(cfg?.[REV_KEY]); return isFinite(r) ? r : 0; };

export async function saveConfig(configObj) {
  const json = JSON.stringify({ ...configObj, [REV_KEY]: Date.now() });
  // The widget option is only a fast render cache. Past a sensible size it stops being a good
  // one, so it is cleared rather than stuffed — loadConfig then falls through to the table.
  // Clearing matters: a stale small option left behind would be preferred over the fresh data.
  await setOption(json.length <= OPTION_MAX ? json : '');
  if (!hasGrist()) return false;
  try {
    await ensureTables();
    if (json.length > CHUNK_BYTES) return await saveChunked(json);

    // Small enough for one request — the original single-row form, kept so ordinary designs
    // stay a single readable cell and older documents need no migration.
    const tbl = await g().docApi.fetchTable(CONFIG_TABLE);
    let rowId = null;
    const stale = [];
    for (let i = 0; i < (tbl.id?.length || 0); i++) {
      if (tbl.Key[i] === CONFIG_KEY) rowId = tbl.id[i];
      else if (String(tbl.Key[i] || '').startsWith(CHUNK_PREFIX)) stale.push(tbl.id[i]);
    }
    if (rowId) await g().docApi.applyUserActions([['UpdateRecord', CONFIG_TABLE, rowId, { Value: json }]]);
    else await g().docApi.applyUserActions([['AddRecord', CONFIG_TABLE, null, { Key: CONFIG_KEY, Value: json }]]);
    // A design that shrank back below the threshold leaves its old parts behind otherwise.
    if (stale.length) {
      try { await g().docApi.applyUserActions([['BulkRemoveRecord', CONFIG_TABLE, stale]]); }
      catch (e) { console.warn('[ANUPRESS] could not sweep old config chunks', e); }
    }
    return true;
  } catch (e) { console.warn('[ANUPRESS] saveConfig table write failed', e); return false; }
}

// ---- Start from scratch ----
// Removing tables is the one destructive thing this widget can do to a document, so the rules are
// narrow and enforced here rather than trusted to the caller:
//   • only ids the caller passes, which the UI takes solely from config.createdTables — the record
//     of tables the template picker itself created;
//   • never our own config table, and never anything whose name we don't recognise as ours;
//   • one table per action, so a single failure can't take the batch down with it.
// The user's own tables are never in that list, so there is no path from this function to them.
export async function removeTables(tableIds) {
  const out = { removed: [], failed: [], skipped: [] };
  if (!hasGrist() || !Array.isArray(tableIds) || !tableIds.length) return out;
  const existing = new Set(await safeListAll());
  for (const id of tableIds) {
    if (!id || id === CONFIG_TABLE || id === THEME_TABLE) { out.skipped.push(id); continue; }
    if (!existing.has(id)) { out.skipped.push(id); continue; } // already gone; nothing to do
    try { await g().docApi.applyUserActions([['RemoveTable', id]]); out.removed.push(id); }
    catch (e) { console.warn('[ANUPRESS] removeTables failed for ' + id, e); out.failed.push(id); }
  }
  invalidateMetaCache();
  return out;
}

// ---- The record of which tables WE created -------------------------------------------------
//
// This used to live inside the design, as config.createdTables. Two things went wrong with that.
//
// First, "Start from scratch" wipes the design — so the moment you used it, the record of every
// table we had ever made went with it. Second, applying a template built the record from the
// TEMPLATE's config rather than the document's current one, so it only ever remembered the most
// recent install: put Research Labs in, then Legal on top, and Research Labs' five tables became
// unrecorded. Unrecorded tables fall into the picker's "we think these are ours, but we're not
// certain" group, which is deliberately unticked — so scratch quietly left them behind, which is
// exactly what it looked like from the outside: press erase, tables stay.
//
// Its own key in the config table fixes both. clearStoredConfig() only removes the design rows
// (CONFIG_KEY and its chunks), so this one survives, and it accumulates across installs.
const CREATED_KEY = 'createdTables';

async function readConfigRow(key) {
  if (!hasGrist()) return null;
  try {
    const ids = await safeListAll();
    if (!ids.includes(CONFIG_TABLE)) return null;
    const tbl = await g().docApi.fetchTable(CONFIG_TABLE);
    for (let i = 0; i < (tbl.id?.length || 0); i++) if (tbl.Key[i] === key) return { rowId: tbl.id[i], value: tbl.Value[i] };
  } catch (e) { console.warn('[ANUPRESS] readConfigRow failed', e); }
  return null;
}

function parseCreatedRow(row) {
  if (!row?.value) return [];
  try { const v = JSON.parse(row.value); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; }
  catch { return []; }
}

export async function loadCreatedTables() {
  return parseCreatedRow(await readConfigRow(CREATED_KEY));
}

// `row` is the already-read record, passed in by both callers below. readConfigRow has no way to
// ask for one key — Grist's fetchTable returns the whole table — so every call downloads the
// design row too, which for a six-page site is 20-30KB. Reading it once to work out the new value
// and then again to find out where to put it doubled that: two identical 21KB round trips to write
// the two characters "[]". Pass `undefined` and it still reads for itself.
async function writeCreatedTables(names, row) {
  if (!hasGrist()) return false;
  try {
    await ensureTables();
    const json = JSON.stringify([...new Set(names)]);
    const target = row !== undefined ? row : await readConfigRow(CREATED_KEY);
    if (target) await g().docApi.applyUserActions([['UpdateRecord', CONFIG_TABLE, target.rowId, { Value: json }]]);
    else await g().docApi.applyUserActions([['AddRecord', CONFIG_TABLE, null, { Key: CREATED_KEY, Value: json }]]);
    return true;
  } catch (e) { console.warn('[ANUPRESS] writeCreatedTables failed', e); return false; }
}

// Additive: a second template installed alongside a first must not erase the first's entry.
export async function recordCreatedTables(names) {
  if (!Array.isArray(names) || !names.length) return false;
  const row = await readConfigRow(CREATED_KEY);
  return writeCreatedTables([...parseCreatedRow(row), ...names], row);
}

// Called after scratch actually removes them, so the list stays a record of what still exists.
export async function forgetCreatedTables(names) {
  if (!Array.isArray(names) || !names.length) return false;
  const drop = new Set(names);
  const row = await readConfigRow(CREATED_KEY);
  return writeCreatedTables(parseCreatedRow(row).filter((n) => !drop.has(n)), row);
}

// Wipe the stored design: the row in our own config table plus the widget-option cache. The table
// itself is left in place (it is ours, it is empty, and the next save needs it anyway). The
// createdTables row is deliberately NOT touched — see above.
export async function clearStoredConfig() {
  await setOption('');
  if (!hasGrist()) return false;
  try {
    const ids = await safeListAll();
    if (!ids.includes(CONFIG_TABLE)) return true;
    const tbl = await g().docApi.fetchTable(CONFIG_TABLE);
    const rowIds = [];
    for (let i = 0; i < (tbl.id?.length || 0); i++) {
      const k = String(tbl.Key[i] || '');
      // The pointer AND every chunk row — clearing only the pointer would strand the parts.
      if (k === CONFIG_KEY || k.startsWith(CHUNK_PREFIX)) rowIds.push(tbl.id[i]);
    }
    if (rowIds.length) await g().docApi.applyUserActions([['BulkRemoveRecord', CONFIG_TABLE, rowIds]]);
    return true;
  } catch (e) { console.warn('[ANUPRESS] clearStoredConfig failed', e); return false; }
}

async function loadFromOption() {
  const opt = await getOption();
  if (!opt) return null;
  try { return JSON.parse(opt); } catch { return null; }
}

async function loadFromTable() {
  if (!hasGrist()) return null;
  try {
    // safeListAll, not docApi.listTables directly: it goes through the memo, and it returns the
    // config table (which the public listTables() filters out) which is exactly what we look for.
    const ids = await safeListAll();
    if (!ids.includes(CONFIG_TABLE)) return null;
    const tbl = await g().docApi.fetchTable(CONFIG_TABLE);
    const values = new Map();
    let head = null;
    for (let i = 0; i < (tbl.id?.length || 0); i++) {
      const k = tbl.Key[i];
      if (k === CONFIG_KEY) head = tbl.Value[i]; else values.set(k, tbl.Value[i]);
    }
    if (head == null) return null;
    const parsed = JSON.parse(head);
    // A pointer, not a config: reassemble the parts written by saveChunked.
    if (parsed && parsed.__apChunked) {
      const out = [];
      for (let i = 0; i < parsed.parts; i++) {
        const part = values.get(`${CHUNK_PREFIX}${parsed.gen}~${i}`);
        // A missing part means an interrupted write or a manually edited table. Reassembling
        // around the hole would hand back silently corrupt JSON, so refuse instead.
        if (part == null) { console.warn(`[ANUPRESS] config part ${i + 1}/${parsed.parts} is missing — not loading a partial design`); return null; }
        out.push(part);
      }
      return JSON.parse(out.join(''));
    }
    return parsed;
  } catch (e) { console.warn('[ANUPRESS] loadConfig: could not read the config table', e); }
  return null;
}

/**
 * The stored design, resolved from the two places it lives.
 *
 * There are two stores for a reason: the config TABLE is durable and document-wide, while the
 * widget OPTION can be read at plain 'read table' access, which is all a viewer's first paint has.
 * This used to return the option whenever one existed and only fall through to the table when it
 * did not — so the option silently outranked the table, permanently, with nothing able to correct
 * it.
 *
 * That broke as soon as the two disagreed, and they disagree easily: widget options are stored
 * PER VIEW SECTION, so a document with the widget on two pages has two independent copies, while
 * the table is shared. Install a template from one page and the other page keeps serving whatever
 * it last saw. Reported as "I installed Higher Education, pressed Save, and it went back to
 * Research Labs" — and the giveaway in the log was that the boot sequence never fetched
 * ANUPRESS_Config at all before going off to fetch tables that no longer existed.
 *
 * Both are read now and the newer one wins, by the revision saveConfig() stamps. A config written
 * before revisions existed scores 0, so the table wins that tie — which also means an old stale
 * option repairs itself on the next load rather than needing to be cleared by hand.
 */
export async function loadConfig() {
  const [fromOption, fromTable] = await Promise.all([
    loadFromOption().catch(() => null),
    loadFromTable().catch(() => null),
  ]);
  if (fromOption && fromTable) return revOf(fromOption) > revOf(fromTable) ? fromOption : fromTable;
  return fromTable || fromOption || null;
}

// ---- Writing to the user's own tables (needs full access) ----
// Used by blocks that let a viewer edit data in place (currently just the Calendar block's
// drag-to-reschedule). Every other block in this app is read-only; this is the one write path
// into a table the user didn't create for us. Fails closed (returns false) rather than throwing,
// since the caller only has 'read table' access until someone has gone through our own Edit flow
// at least once this session — a plain viewer attempting this will hit that, not a crash.
/**
 * Write several rows in one action bundle, and append new ones.
 *
 * One bundle rather than a request per row: Grist applies a bundle atomically and records it as a
 * single entry in the document's history, so a user editing eight cells sees one undoable step
 * rather than eight. Returns {updated, added, ok} instead of throwing — the caller is a UI that
 * needs to report what happened, not abort.
 */
export async function saveRows(table, { updates = [], additions = [] } = {}) {
  const out = { updated: 0, added: 0, ok: false };
  if (!hasGrist() || !table) return out;
  const actions = [];
  for (const u of updates) {
    if (!u || u.id == null || !u.fields || !Object.keys(u.fields).length) continue;
    actions.push(['UpdateRecord', table, u.id, u.fields]);
    out.updated++;
  }
  for (const fields of additions) {
    if (!fields || !Object.keys(fields).length) continue;
    actions.push(['AddRecord', table, null, fields]);
    out.added++;
  }
  if (!actions.length) return { ...out, ok: true };
  try {
    await g().docApi.applyUserActions(actions);
    out.ok = true;
  } catch (e) {
    console.warn('[ANUPRESS] saveRows failed', e);
    out.updated = 0; out.added = 0;
  }
  return out;
}

export async function updateRecord(table, rowId, fields) {
  if (!hasGrist() || rowId == null) return false;
  try { await g().docApi.applyUserActions([['UpdateRecord', table, rowId, fields]]); return true; }
  catch (e) { console.warn('[ANUPRESS] updateRecord failed', e); return false; }
}

// Convert a JS sample-data value into whatever Grist expects for that column type. Only Date/
// DateTime and Bool need translation; Text/Choice/Numeric/Int already round-trip natively.
// Date/DateTime cells go in as numeric epoch-seconds (same shape bridge.js's toDateStr already
// assumes on the read side); strings and JS Date objects both work as inputs.
function toGristCell(value, type) {
  if (value == null || value === '') return null;
  if (/^(Date|DateTime)/i.test(type)) {
    if (typeof value === 'number') return value;
    const ms = value instanceof Date ? value.getTime() : Date.parse(String(value));
    return isFinite(ms) ? Math.floor(ms / 1000) : null;
  }
  if (/^Bool/i.test(type)) return !!value;
  return value;
}

// Build the [AddTable, BulkAddRecord] action pair for a table as ONE bundle, so Grist applies it
// atomically — the table lands *with* its rows, or nothing is created. (The earlier two-call
// version could leave a created-but-empty table when the row insert failed on its own: that empty
// table then looked like "the table exists", so every block rendered blank — 0 / No matching rows
// / 0 mapped — with no "needs a table" hint. Atomicity removes that failure mode.)
// cellFn converts each value for the column type actually being used (typed vs the Text fallback).
function buildCreateActions(tableId, columnsDef, records, cellFn) {
  const actions = [['AddTable', tableId, columnsDef.map((c) => ({ id: c.id, type: c.type || 'Text', ...(c.label && c.label !== c.id ? { label: c.label } : {}) }))]];
  if (records && records.length) {
    // BulkAddRecord: columnar arrays keyed by column id + a matching list of null row ids (Grist
    // assigns them). `id` is never in the payload — the row-id list is the separate third arg.
    const columnar = {};
    for (const c of columnsDef) columnar[c.id] = records.map((r) => cellFn(r[c.id], c.type));
    actions.push(['BulkAddRecord', tableId, records.map(() => null), columnar]);
  }
  return actions;
}

// Create a table with columns AND its rows. Used by the template picker's "also add these tables"
// checkbox — the Research Labs tables (Samples/Reagents/Tasks/People) get created with the same
// sample rows the preview uses, so the template installs as a working document. Two attempts:
// first with real column types, then (if Grist rejects any type) with every column as plain Text.
// The Text fallback is why a picky/older Grist still ends up with a populated, usable table —
// numbers still chart (parseFloat) and "YYYY-MM-DD" dates still parse. Fails closed => false.
export async function createTableWithRecords(tableId, columnsDef, records) {
  if (!hasGrist()) return false;
  try {
    await g().docApi.applyUserActions(buildCreateActions(tableId, columnsDef, records, toGristCell));
    invalidateMetaCache();
    return true;
  } catch (e1) {
    console.warn('[ANUPRESS] createTableWithRecords: typed create failed for ' + tableId + ', retrying as plain Text', e1);
  }
  try {
    // Attempt 1 rolled back atomically, so the table doesn't exist yet — this AddTable is clean.
    const textCols = columnsDef.map((c) => ({ id: c.id, label: c.label, type: 'Text' }));
    await g().docApi.applyUserActions(buildCreateActions(tableId, textCols, records, (v) => (v == null || v === '' ? null : String(v))));
    invalidateMetaCache();
    return true;
  } catch (e2) {
    console.warn('[ANUPRESS] createTableWithRecords: Text fallback also failed for ' + tableId, e2);
    return false;
  }
}

// Add rows to an EXISTING table (no AddTable). Backfills a template table that already exists but
// is empty — typically one a previous, partially-failed apply left behind. Inserts only columns
// that actually exist on the target (existingColIds) so a differently-shaped table can't throw.
// Returns rows added, or 0 on failure.
export async function addRecordsToTable(tableId, columnsDef, records, existingColIds) {
  if (!hasGrist() || !records || !records.length) return 0;
  const use = columnsDef.filter((c) => !existingColIds || existingColIds.includes(c.id));
  if (!use.length) return 0;
  try {
    const columnar = {};
    for (const c of use) columnar[c.id] = records.map((r) => toGristCell(r[c.id], c.type));
    await g().docApi.applyUserActions([['BulkAddRecord', tableId, records.map(() => null), columnar]]);
    invalidateMetaCache();
    return records.length;
  } catch (e) { console.warn('[ANUPRESS] addRecordsToTable failed for ' + tableId, e); return 0; }
}

export async function getDocName() {
  if (!hasGrist()) return null;
  try { return await g().docApi.getDocName(); } catch { return null; }
}
