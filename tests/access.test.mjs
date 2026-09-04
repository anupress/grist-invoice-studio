// What the widget is allowed to do, and how it finds out.
//
// The bug these cover: grist.ready() resolves whether or not the user allows the access it asked
// for, so the level the shared core records afterwards is the request, not the answer. Every write
// path trusted that record, and the core reports a refused listTables as an empty array — so a
// document full of invoices arrived looking empty, and then refused to have tables built into it.
//
// window.grist is stubbed here because that is the whole surface involved: what matters is which
// calls are made, in which order, and what is believed afterwards.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

/**
 * A Grist that behaves the way the real one does: ready() always resolves, and listTables refuses
 * until access is actually granted.
 */
function stubGrist({ grantsAccess }) {
  const calls = [];
  globalThis.window = globalThis;
  globalThis.grist = {
    ready: async (opts) => { calls.push(`ready:${opts?.requiredAccess}`); },
    docApi: {
      listTables: async () => {
        calls.push('listTables');
        if (!grantsAccess) throw new Error('Access denied: full access required');
        return ['Invoices', 'InvoiceItems'];
      },
      applyUserActions: async () => { calls.push('applyUserActions'); return { retValues: [1] }; },
      fetchTable: async () => ({ id: [] }),
    },
  };
  return calls;
}

// A fresh module graph per case: ensureFullAccess remembers a granted result on purpose, and that
// memory must not leak between the granted and refused cases.
async function loadAccess(bust) {
  return import(pathToFileURL(_resolve(ROOT, 'src/grist/access.js')).href + `?${bust}`);
}

// ---- refused ---------------------------------------------------------------------------------
{
  const calls = stubGrist({ grantsAccess: false });
  const { ensureFullAccess } = await loadAccess('a');
  const res = await ensureFullAccess();

  eq('a refusal is reported as a refusal', res.ok, false);
  eq('and says why', res.reason, 'denied');
  ok('carrying what Grist said', /Access denied/.test(res.message || ''));
  // The order is the point: asking, then proving. Asking alone proves nothing.
  eq('it asks for full access before testing it', calls[0], 'ready:full');
  ok('and then tests it', calls.includes('listTables'));

  // A refusal is never remembered, because the retry exists for somebody who has just gone and
  // granted access. Caching the no would make the "Check again" button permanently useless.
  const before = calls.length;
  await ensureFullAccess();
  ok('a refusal is re-checked, not cached', calls.length > before);
}

// ---- granted ---------------------------------------------------------------------------------
{
  const calls = stubGrist({ grantsAccess: true });
  const { ensureFullAccess } = await loadAccess('b');

  eq('a grant is reported as one', (await ensureFullAccess()).ok, true);
  const after = calls.length;
  eq('and is remembered, so a save costs no extra round trip', (await ensureFullAccess()).ok, true);
  eq('nothing was asked the second time', calls.length, after);
}

// ---- the write guards ------------------------------------------------------------------------
// Every live write must go through the probe. A guard that reads a recorded level is the bug.
{
  const src = await import('node:fs').then((fs) => fs.readFileSync(_resolve(ROOT, 'src/grist/writer.js'), 'utf8'));
  ok('no write guard consults the recorded access level', !/accessLevel\(\)/.test(src));
  // Save, outbox queue, outbox release, create tables, upgrade, remove sample rows, save a record,
  // remove a record, upload a picture, show hidden columns on their pages — and the guard itself.
  eq('every live write path asks instead', (src.match(/requireFullAccess\(/g) || []).length, 10);
  ok('and the refusal tells the user where the control is', /creator panel/.test(src));
}

// A refused write is refused before anything is sent, and says how to fix it.
{
  stubGrist({ grantsAccess: false });
  const { createStarterTables } = await import(pathToFileURL(_resolve(ROOT, 'src/grist/writer.js')).href + '?c');
  const provider = { tables: () => [], refreshTables: async () => {}, prime: async () => {} };
  const res = await createStarterTables([{ id: 'Invoices', label: 'Invoices', columns: [], records: [] }], provider, { live: true });

  eq('creating tables is refused', res.ok, false);
  eq('and flagged as an access problem', res.needsAccess, true);
  ok('with instructions', /Full document access/.test(res.error));
}

// The demo document is not subject to any of this: there is no Grist to ask.
{
  delete globalThis.grist;
  const { createStarterTables } = await import(pathToFileURL(_resolve(ROOT, 'src/grist/writer.js')).href + '?d');
  const data = { defaultTable: null, tables: {} };
  const provider = { data, tables: () => Object.values(data.tables), setData(d) { this.data = d; } };
  const res = await createStarterTables(
    [{ id: 'Invoices', label: 'Invoices', columns: [{ id: 'N', label: 'N', type: 'Text' }], records: [{ N: 'x' }] }],
    provider, { live: false },
  );
  eq('the demo document builds without asking anyone', res.ok, true);
  eq('and the table is there', Object.keys(provider.data.tables), ['Invoices']);
  eq('with a default table to read through', provider.data.defaultTable, 'Invoices');
}

console.log(`${pass} passed, ${fail} failed`);
// Explicit, unlike the other suites. The core's grist.ready() wrapper races the call against a
// two-minute setTimeout it never clears, so once this file has called it the event loop stays alive
// for two minutes after the last assertion.
process.exit(fail ? 1 : 0);
