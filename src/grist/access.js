// Finding out what this widget is actually allowed to do.
//
// Invoice Studio is not a one-table widget. It reads invoices, their line items, the client list
// and a product catalogue, and it writes rows back to all of them, so "read table" — the level the
// shared core connects at — is not a reduced mode of it. It is a mode in which nothing works.
//
// Two things make that failure look like something else entirely:
//
// grist.ready() resolves whether or not the user allows the access it asks for, so the level the
// core records afterwards is a statement of what was requested, not what was granted. Asking is not
// the same as being told yes, and nothing in the API says which happened.
//
// And the core's listTables() answers a refusal with an empty array. An unreadable document and an
// empty one are then indistinguishable, which is how a document full of invoices came to be
// reported as having none, followed by an offer to build the tables it already has.
//
// So: ask, then prove it by trying something that only full access permits.

import * as bridge from '../core/grist/bridge.js';

const g = () => (typeof window !== 'undefined' ? window.grist : undefined);

/**
 * Ask for full access and report whether Grist gave it.
 *
 * The cache invalidation is not housekeeping. The core memoises the listTables *promise*, so a
 * rejection under insufficient access is memoised with it, and every later call — including the
 * ones made after the user grants access — replays the same failure. Escalating without clearing it
 * leaves the widget permanently convinced the document is empty.
 */
// Proving access costs a round trip, and every write path asks. Access is never revoked mid-session
// — Grist reloads the widget when it changes — so a yes is remembered. A no is not: the whole point
// of the retry is that the user has just gone and granted it.
let _granted = false;

export async function ensureFullAccess() {
  if (_granted) return { ok: true };
  if (!g()?.docApi) return { ok: false, reason: 'no-grist' };

  await bridge.escalateToFull();
  bridge.invalidateMetaCache();

  try {
    await g().docApi.listTables();
    _granted = true;
    return { ok: true };
  } catch (e) {
    const message = (e && e.message) || String(e);
    return { ok: false, reason: 'denied', message };
  }
}
