// Carrying out a write plan.
//
// Two backends behind one interface. The live one talks to Grist; the demo one mutates the bundled
// sample document in memory. That is not a mock for testing — it is how the demo composer actually
// works, so everything except the final API call is exercised by anyone who opens the page.
//
// The plan itself is built and tested in model/write.js. Nothing here decides what to write.

import * as bridge from '../core/grist/bridge.js';
import { ensureFullAccess } from './access.js';
import { withChoice } from '../model/schema.js';

const g = () => (typeof window !== 'undefined' ? window.grist : undefined);

/**
 * The guard every write goes through.
 *
 * It asks Grist rather than consulting a recorded level, because grist.ready() resolves whether or
 * not the user allows what it asked for: the level the core records is the request, not the answer.
 * The answer is only knowable by trying something that needs it, and the result is remembered, so
 * this costs one round trip per session rather than one per save.
 *
 * The wording names the control to use. "Needs full access" on its own tells somebody they are
 * stuck without telling them where to go.
 */
const GRANT_ACCESS = 'Open the creator panel on the right of the Grist page, find this widget’s Access setting, and choose Full document access.';

async function requireFullAccess(what) {
  const res = await ensureFullAccess();
  if (res.ok) return null;
  return { ok: false, needsAccess: true, error: what + ' needs full access to this document. ' + GRANT_ACCESS };
}

/**
 * Send a bundle of user actions and hand back what Grist returned.
 *
 * One bundle is one entry in the document's history, so an invoice and its lines are a single
 * undoable step rather than a dozen. The plugin API is called directly rather than through
 * core/grist/bridge.js because the return values matter here — a newly added row's id is how its
 * line items find their way back to it — and bridge's helpers deliberately discard them.
 */
async function apply(actions) {
  if (!actions.length) return { ok: true, retValues: [] };
  try {
    const res = await g().docApi.applyUserActions(actions);
    return { ok: true, retValues: (res && res.retValues) || [] };
  } catch (e) {
    console.warn('[Invoice Studio] applyUserActions failed', e);
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------------------------------
// Live
// ---------------------------------------------------------------------------------------------

async function liveSave(plan) {
  const inv = plan.invoice;
  let rowId = inv.rowId;

  // An existing invoice and its lines go in one bundle, because every id involved is already known.
  // A new one cannot: the lines need the header's row id, and no action in a bundle can refer to
  // what an earlier action in the same bundle returned. So the header goes first and the lines
  // follow. If the second call fails the invoice exists without its lines — visible, recoverable,
  // and the retry updates rather than duplicates, because the draft now carries the row id.
  if (rowId == null) {
    const created = await apply([['AddRecord', inv.table, null, inv.fields]]);
    if (!created.ok) return { ok: false, error: created.error, stage: 'invoice' };
    rowId = created.retValues[0];
    if (rowId == null) return { ok: false, error: 'Grist did not return a row id for the new invoice.', stage: 'invoice' };
  }

  const actions = [];
  if (inv.rowId != null) actions.push(['UpdateRecord', inv.table, rowId, inv.fields]);

  if (plan.lines) {
    const L = plan.lines;
    for (const fields of L.adds) actions.push(['AddRecord', L.table, null, resolveLink(fields, rowId)]);
    for (const u of L.updates) actions.push(['UpdateRecord', L.table, u.id, resolveLink(u.fields, rowId)]);
    if (L.removes.length) actions.push(['BulkRemoveRecord', L.table, L.removes]);
  }

  const res = await apply(actions);
  if (!res.ok) return { ok: false, error: res.error, stage: 'lines', rowId };
  return { ok: true, rowId };
}

/** Fill in the placeholder the plan leaves where a brand-new invoice's row id will go. */
function resolveLink(fields, rowId) {
  const out = { ...fields };
  for (const [k, v] of Object.entries(out)) if (v === '__INVOICE_ROW_ID__') out[k] = rowId;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Demo — the same plan, applied to the in-memory sample document
// ---------------------------------------------------------------------------------------------

const nextId = (records) => (records.reduce((m, r) => Math.max(m, r.id || 0), 0) + 1);

/**
 * Mirror what Grist does on the way BACK out.
 *
 * The write plan produces what Grist stores — a Date is epoch seconds — and the live provider
 * converts those to "YYYY-MM-DD" when reading, in core/grist/bridge.js. The demo provider has no
 * read path to do that in, so without this the demo document ends up holding a raw number where
 * every other part of the app expects a day string, and the saved invoice renders its issue date
 * as "1784505600".
 *
 * Converting here rather than writing day strings in the first place keeps the plan honest: the
 * plan is what goes to the real API, and it has to stay correct for that.
 */
function asStored(fields, columns) {
  const types = new Map((columns || []).map((c) => [c.id, String(c.type || 'Text')]));
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    if (/^Date/i.test(types.get(k) || '') && typeof v === 'number' && isFinite(v)) {
      out[k] = new Date(v * 1000).toISOString().slice(0, 10);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function demoSave(plan, data) {
  const inv = plan.invoice;
  const table = data.tables[inv.table];
  if (!table) return { ok: false, error: `The demo document has no table called ${inv.table}.` };

  const invFields = asStored(inv.fields, table.columns);
  let rowId = inv.rowId;
  if (rowId == null) {
    rowId = nextId(table.records);
    table.records.push({ id: rowId, ...invFields });
  } else {
    const row = table.records.find((r) => r.id === rowId);
    if (!row) return { ok: false, error: 'That invoice is no longer in the document.' };
    Object.assign(row, invFields);
  }

  if (plan.lines) {
    const L = plan.lines;
    const lt = data.tables[L.table];
    if (lt) {
      if (L.removes.length) {
        const drop = new Set(L.removes);
        lt.records = lt.records.filter((r) => !drop.has(r.id));
      }
      for (const u of L.updates) {
        const row = lt.records.find((r) => r.id === u.id);
        if (row) Object.assign(row, asStored(resolveLink(u.fields, rowId), lt.columns));
      }
      for (const fields of L.adds) {
        lt.records.push({ id: nextId(lt.records), ...asStored(resolveLink(fields, rowId), lt.columns) });
      }
    }
  }

  return { ok: true, rowId };
}

// ---------------------------------------------------------------------------------------------
// The interface the composer uses
// ---------------------------------------------------------------------------------------------

/**
 * Save a plan against whichever document is in front of us.
 *
 * `provider` is the app's data provider; when it is the demo one, its data is mutated in place and
 * it is told to re-read. When it is live, the invalidated tables are re-fetched so the page shows
 * what was actually stored rather than what we hoped we stored.
 */
export async function savePlan(plan, provider, { live }) {
  if (!plan || !plan.invoice) return { ok: false, error: 'Nothing to save.' };

  if (!live) {
    const res = demoSave(plan, provider.data);
    if (res.ok) {
      ensureStatusChoiceDemo(plan, provider.data);
      provider.setData(provider.data);
    }
    return res;
  }

  const denied = await requireFullAccess('Saving');
  if (denied) return denied;

  // Before the row lands, not after: a Choice column shows a value outside its list as invalid,
  // and a person who just typed their own status should never see it arrive flagged.
  await ensureStatusChoice(plan, provider);

  const res = await liveSave(plan);
  if (res.ok) {
    // Read back what landed, rather than assuming. A formula column, a Choice that rejected a
    // value, or a trigger elsewhere in the document can all make the stored row differ from the
    // one we sent, and the person looking at the screen should see the stored one.
    provider.invalidate(plan.invoice.table);
    if (plan.lines) provider.invalidate(plan.lines.table);
    await provider.prime([plan.invoice.table, plan.lines?.table].filter(Boolean));
  }
  return res;
}

/**
 * A status typed by hand becomes a real choice on the column, not an intruder in it.
 *
 * Grist accepts any text into a Choice column but marks values outside the list as invalid, so a
 * business inventing "Awaiting approval" would see it flagged in their own grid forever. Extending
 * the list is an addition that preserves everything else in the options — the colours on existing
 * choices included — and a failure here only costs the registration, never the save, which is why
 * it warns instead of failing.
 */
async function ensureStatusChoice(plan, provider) {
  const inv = plan.invoice;
  if (!inv.statusColumn || !inv.statusValue) return;
  const col = (provider.columns(inv.table) || []).find((c) => c.id === inv.statusColumn);
  if (!col || !/^Choice/.test(String(col.type || ''))) return;
  const next = withChoice(col.widgetOptions, inv.statusValue);
  if (!next.changed) return;
  const res = await apply([['ModifyColumn', inv.table, inv.statusColumn, { widgetOptions: next.widgetOptions }]]);
  if (!res.ok) console.warn('[Invoice Studio] could not add the new status to the column choices', res.error);
  else bridge.invalidateMetaCache();
}

/** The same registration for the demo document, so the suggestions grow there too. */
function ensureStatusChoiceDemo(plan, data) {
  const inv = plan.invoice;
  if (!inv.statusColumn || !inv.statusValue) return;
  const col = (data.tables[inv.table]?.columns || []).find((c) => c.id === inv.statusColumn);
  if (!col || !/^Choice/.test(String(col.type || ''))) return;
  const next = withChoice(col.widgetOptions, inv.statusValue);
  if (next.changed) col.widgetOptions = next.widgetOptions;
}

/**
 * Put a message in the outbox.
 *
 * The table is created on first use rather than up front: a business that only ever sends by
 * opening its own mail client should not find a table it never asked for sitting in its document.
 *
 * The row lands HELD. Releasing it is a separate action, which is both the review step and the
 * false→true transition a Grist webhook actually fires on — see send/outbox.js.
 */
export async function queueToOutbox(row, provider, { live }) {
  const { OUTBOX_TABLE, createOutboxActions } = await import('../send/outbox.js');

  if (!live) {
    const data = provider.data;
    const created = !data.tables[OUTBOX_TABLE];
    if (created) {
      const { OUTBOX_COLUMNS } = await import('../send/outbox.js');
      data.tables[OUTBOX_TABLE] = {
        id: OUTBOX_TABLE, label: 'Outbox',
        columns: OUTBOX_COLUMNS.map((c) => ({ id: c.id, label: c.label, type: c.type, isFormula: false })),
        records: [],
      };
    }
    const t = data.tables[OUTBOX_TABLE];
    const id = nextId(t.records);
    t.records.push({ id, ...row });
    provider.setData(data);
    return { ok: true, rowId: id, created };
  }

  const denied = await requireFullAccess('Queueing a message, which writes into your document,');
  if (denied) return denied;

  const existing = provider.tables().some((t) => t.id === OUTBOX_TABLE);
  if (!existing) {
    const made = await apply(createOutboxActions());
    if (!made.ok) return { ok: false, error: `Could not create the outbox table — ${made.error}` };
    bridge.invalidateMetaCache();
    await provider.refreshTables();
  }

  const added = await apply([['AddRecord', OUTBOX_TABLE, null, row]]);
  if (!added.ok) return { ok: false, error: added.error };
  provider.invalidate(OUTBOX_TABLE);
  await provider.prime([OUTBOX_TABLE]);
  return { ok: true, rowId: added.retValues[0], created: !existing };
}

/** Flip held messages to ready, which is what actually sets a webhook off. */
export async function releaseOutbox(rowIds, provider, { live }) {
  const { OUTBOX_TABLE, releaseActions } = await import('../send/outbox.js');
  const actions = releaseActions(rowIds);
  if (!actions.length) return { ok: true, released: 0 };

  if (!live) {
    const t = provider.data.tables[OUTBOX_TABLE];
    if (t) for (const r of t.records) if (rowIds.includes(r.id)) { r.Ready = true; r.Status = 'Ready'; }
    provider.setData(provider.data);
    return { ok: true, released: rowIds.length };
  }

  const res = await apply(actions);
  if (!res.ok) return { ok: false, error: res.error };
  provider.invalidate(OUTBOX_TABLE);
  await provider.prime([OUTBOX_TABLE]);
  return { ok: true, released: rowIds.length };
}

/**
 * The columns to hand to the atomic create, and the ones to add afterwards.
 *
 * The core's create sends AddTable and BulkAddRecord as one bundle, and if Grist rejects ANY column
 * type it retries the whole table as plain Text. That fallback is the right trade for a chart's
 * sample data; here it would quietly turn the reference columns into text and leave a document that
 * looks built but does not join up.
 *
 * So the create only gets types every Grist accepts, and the one column that could plausibly be
 * refused — the attachments column, which is a Grist-version question rather than a data question —
 * is added separately afterwards, where failing loses one column instead of the whole shape.
 */
function structural(columns) {
  return columns.filter((c) => c.type !== 'Attachments').map(({ id, label, type }) => ({ id, label, type }));
}

/**
 * The parts the atomic create cannot carry: the attachments column, and the choice list.
 *
 * Cosmetic in the sense that the document reads correctly without them, so a failure here is
 * reported to the console and otherwise ignored rather than being allowed to fail a setup that has
 * already written four tables of working data. Without the choice list, Grist marks every status
 * as an unrecognised value; without the attachments column, the upgrade offer simply reappears.
 */
async function dressColumns(table) {
  const extra = table.columns.filter((c) => c.type === 'Attachments');
  const choices = table.columns.filter((c) => c.widgetOptions);
  if (!extra.length && !choices.length) return;

  const actions = [
    ...extra.map((c) => ['AddColumn', table.id, c.id, { type: c.type, label: c.label }]),
    ...choices.map((c) => ['ModifyColumn', table.id, c.id, { widgetOptions: c.widgetOptions }]),
  ];
  const res = await apply(actions);
  if (!res.ok) console.warn(`[Invoice Studio] ${table.id} was created, but its choice list and attachments column were not`, res.error);
}

/**
 * The sample pictures, turned into real attachments.
 *
 * The starter carries them as data URIs, which is the only form an in-memory demo can hold — but
 * an Attachments column holds attachment ids, not text. So on a live document each picture is
 * uploaded through Grist's attachment API and the returned id written into the cell as the
 * list-tuple Grist expects. Uploading is owner-gated where ACLs apply, and decorative: any
 * failure costs the pictures, never the setup, which is why it warns instead of failing.
 */
function dataUriToBlob(uri) {
  const comma = uri.indexOf(',');
  const header = uri.slice(5, comma);            // e.g. "image/svg+xml;charset=utf-8"
  const type = header.split(';')[0] || 'application/octet-stream';
  const body = uri.slice(comma + 1);
  if (/;base64/.test(header)) {
    const bin = atob(body);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type });
  }
  return new Blob([decodeURIComponent(body)], { type });
}

async function seedSampleAttachments(table) {
  const col = (table.columns || []).find((c) => c.type === 'Attachments' && c.id === 'Image');
  if (!col) return;
  const rows = (table.records || [])
    .map((r, i) => ({ rowId: i + 1, uri: r[col.id] }))
    .filter((x) => typeof x.uri === 'string' && x.uri.startsWith('data:image/'));
  if (!rows.length) return;

  try {
    const token = await g().docApi.getAccessToken({ readOnly: false });
    if (!token?.baseUrl || !token?.token) return;

    const updates = [];
    for (const r of rows) {
      const blob = dataUriToBlob(r.uri);
      const form = new FormData();
      form.append('upload', blob, `sample-${table.id.toLowerCase()}-${r.rowId}.svg`);
      const res = await fetch(`${token.baseUrl}/attachments?auth=${token.token}`, {
        method: 'POST',
        body: form,
        // Grist's CSRF guard: without this header the upload endpoint refuses the POST.
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      if (!res.ok) throw new Error(`upload answered ${res.status}`);
      const ids = await res.json();
      if (Array.isArray(ids) && ids[0] != null) {
        updates.push(['UpdateRecord', table.id, r.rowId, { [col.id]: ['L', ids[0]] }]);
      }
    }
    if (updates.length) await apply(updates);
  } catch (e) {
    console.warn('[Invoice Studio] the sample pictures could not be attached — the document works without them', e);
  }
}

/**
 * Build the tables a fresh document needs, with a few invoices in them.
 *
 * Uses the core's `createTableWithRecords`, which sends AddTable and BulkAddRecord as ONE action
 * bundle. That atomicity is not a nicety: the two-call version it replaced could leave a created but
 * EMPTY table when the row insert failed on its own, and an empty table is not a missing one, so
 * every block rendered blank with nothing to explain why. It also retries with all-Text columns if
 * Grist rejects a type, which is why a picky or older instance still ends up with a usable table.
 *
 * Tables are created in the order given, because a Ref column cannot point at a table that does not
 * exist yet. A table already present is skipped rather than overwritten.
 */
export async function createStarterTables(tables, provider, { live }) {
  // Access first, and the table list re-read after it, in that order. The list this widget is
  // holding may have been drawn up while Grist was refusing to answer, and a refusal comes back as
  // an empty list — so trusting it here is how a document would end up with a second Clients table
  // sitting beside the one it already had.
  if (live) {
    const denied = await requireFullAccess('Creating tables');
    if (denied) return denied;
    bridge.invalidateMetaCache();
    await provider.refreshTables();
  }

  const existing = new Set((provider.tables() || []).map((t) => t.id));
  const todo = tables.filter((t) => !existing.has(t.id));
  if (!todo.length) return { ok: true, created: [], skipped: tables.map((t) => t.id) };

  if (!live) {
    for (const t of todo) {
      provider.data.tables[t.id] = {
        id: t.id, label: t.label,
        // widgetOptions included: the status suggestions read the choice list off the column, and
        // a demo column without one would order the offer differently from a live document.
        columns: t.columns.map((c) => ({ id: c.id, label: c.label, type: c.type, isFormula: false, widgetOptions: c.widgetOptions || null })),
        records: t.records.map((r, i) => ({ id: i + 1, ...r })),
      };
    }
    // A document that had nothing in it has no default table either, and provider.columns() with no
    // argument reads through it.
    if (!provider.data.defaultTable) provider.data.defaultTable = todo[todo.length - 1].id;
    provider.setData(provider.data);
    return { ok: true, created: todo.map((t) => t.id), skipped: [] };
  }

  const created = [];
  for (const t of todo) {
    const ok = await bridge.createTableWithRecords(t.id, structural(t.columns), t.records);
    if (!ok) {
      return {
        ok: false, created,
        error: `Could not create ${t.id}.` + (created.length ? ` ${created.join(' and ')} were created first; remove them before trying again.` : ''),
      };
    }
    created.push(t.id);
    await dressColumns(t);
    await seedSampleAttachments(t);
  }

  bridge.invalidateMetaCache();
  await provider.refreshTables();
  // Rows, not just columns. refreshTables loads both for tables it has not seen, and these are all
  // new — but priming again is cheap and makes the dependency explicit rather than incidental.
  await provider.prime(created);
  return { ok: true, created, skipped: tables.length - todo.length ? tables.filter((t) => existing.has(t.id)).map((t) => t.id) : [] };
}

/** Add the columns an upgrade plan asks for. */
export async function applyUpgrade(plan, provider, { live }) {
  const { upgradeActions, backfillActions } = await import('../model/migrate.js');
  const actions = upgradeActions(plan);
  if (!actions.length) return { ok: true, added: 0, backfilled: 0 };

  // Worked out BEFORE the columns are added, while the values being copied are still the ones
  // being read — see migrate.js. Afterwards the new column is the mapped one and the old formula,
  // though still present, is no longer what anything looks at.
  const backfill = backfillActions(plan, provider);

  if (!live) {
    for (const c of plan.columns) {
      const t = provider.data.tables[c.table];
      if (t && !t.columns.some((x) => x.id === c.id)) {
        t.columns.push({ id: c.id, label: c.def.label, type: c.def.type, isFormula: false });
      }
    }
    for (const [, table, rowIds, fields] of backfill) {
      const t = provider.data.tables[table];
      if (!t) continue;
      rowIds.forEach((id, i) => {
        const row = t.records.find((r) => r.id === id);
        if (row) for (const [col, values] of Object.entries(fields)) row[col] = values[i];
      });
    }
    provider.setData(provider.data);
    return { ok: true, added: plan.columns.length, backfilled: backfill.length };
  }

  const denied = await requireFullAccess('Adding columns');
  if (denied) return denied;
  const res = await apply(actions);
  if (!res.ok) return { ok: false, error: res.error };

  // A failed backfill is not a failed upgrade: the columns are there and usable, and the only loss
  // is that older rows show a row id where a number used to be. Reported rather than rolled back.
  let backfilled = 0;
  if (backfill.length) {
    const b = await apply(backfill);
    if (b.ok) backfilled = backfill.length;
    else console.warn('[Invoice Studio] columns added, but existing values could not be copied across', b.error);
  }

  bridge.invalidateMetaCache();
  await provider.refreshTables();
  await provider.prime([...new Set(plan.columns.map((c) => c.table))]);
  return { ok: true, added: actions.length, backfilled };
}
