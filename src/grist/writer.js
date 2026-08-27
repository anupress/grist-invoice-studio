// Carrying out a write plan.
//
// Two backends behind one interface. The live one talks to Grist; the demo one mutates the bundled
// sample document in memory. That is not a mock for testing — it is how the demo composer actually
// works, so everything except the final API call is exercised by anyone who opens the page.
//
// The plan itself is built and tested in model/write.js. Nothing here decides what to write.

import * as bridge from '../core/grist/bridge.js';

const g = () => (typeof window !== 'undefined' ? window.grist : undefined);

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
    if (res.ok) provider.setData(provider.data);
    return res;
  }

  if (bridge.accessLevel() !== 'full') {
    return { ok: false, error: 'Saving needs full access to this document. Choose Enable editing first.', needsAccess: true };
  }

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

  if (bridge.accessLevel() !== 'full') {
    return { ok: false, error: 'Queueing a message writes into your document, which needs full access.', needsAccess: true };
  }

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

  if (bridge.accessLevel() !== 'full') {
    return { ok: false, error: 'Adding columns needs full access to this document.', needsAccess: true };
  }
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
