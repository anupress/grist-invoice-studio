// Remembering things without a server.
//
// anupress.com stores nothing. It has no database for this, no account, and no copy of anybody's
// invoice — which is the promise the page makes and the reason there is nothing to sign into. So
// the only place anything can be kept is the visitor's own browser, and the two kinds of thing
// worth keeping have different lifetimes:
//
//   what a business decides once   name, address, tax number, logo, currency, how numbers run.
//                                  localStorage, until they clear it. Retyping this on every
//                                  invoice is the whole friction of a free generator.
//   the document in hand           sessionStorage, so a reload or a stray back button does not
//                                  empty a half-typed invoice — and gone when the tab closes.
//
// A sent document is finished, so `forgetDraft()` runs after a send: the next visit starts on a
// blank one rather than on somebody's last invoice, which is what a shared or borrowed computer
// makes of a tool that remembers too much.
//
// Every call is wrapped. Storage throws outright in some browsers (private windows, embedded
// contexts, site data switched off) and returns nothing in others; a tool that cannot remember
// still has to work, so every failure here is silent and the caller gets a null.

const SETTINGS_KEY = 'anupress.invoice.settings.v1';
const DRAFT_KEY = 'anupress.invoice.draft.v1';

function local() {
  try { return window.localStorage; } catch { return null; }
}
function session() {
  try { return window.sessionStorage; } catch { return null; }
}

function read(store, key) {
  try {
    const raw = store && store.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function write(store, key, value) {
  try {
    store && store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Quota, most likely a logo that is too big to keep. The tool carries on with it in memory.
    return false;
  }
}

function drop(store, key) {
  try { store && store.removeItem(key); } catch { /* nothing to do about it */ }
}

/* ---- what a business decides once ----------------------------------------------------------- */

export const recallSettings = () => read(local(), SETTINGS_KEY);
export const rememberSettings = (settings) => write(local(), SETTINGS_KEY, settings);
export const forgetSettings = () => drop(local(), SETTINGS_KEY);

/** Is anything of theirs kept in this browser? Decides whether the page offers to forget it. */
export function hasRemembered() {
  return !!recallSettings();
}

/* ---- the document in hand -------------------------------------------------------------------- */

export const recallDraft = () => read(session(), DRAFT_KEY);
export const rememberDraft = (draft) => write(session(), DRAFT_KEY, draft);
export const forgetDraft = () => drop(session(), DRAFT_KEY);

/* ---- the numbers this browser has given out --------------------------------------------------- */

// Without a table of invoices there is nothing to count from, so every new document would be
// number 0001 — and two invoices with the same number is the one mistake an accountant will not
// forgive. So the numbers this browser has issued are kept, and the next one is worked out from
// them exactly as the widget works it out from a table. A number is "issued" the moment the
// document leaves the page: downloaded, printed or sent. Capped, because a list that only grows
// is a leak; a year of daily invoices fits easily.
const ISSUED_KEY = 'anupress.invoice.issued.v1';
const ISSUED_MAX = 2000;

export function recallIssued() {
  const v = read(local(), ISSUED_KEY);
  return Array.isArray(v) ? v.filter((n) => typeof n === 'string' && n) : [];
}
export function rememberIssued(list) {
  return write(local(), ISSUED_KEY, list.slice(-ISSUED_MAX));
}
export const forgetIssued = () => drop(local(), ISSUED_KEY);

/* ---- all of it ------------------------------------------------------------------------------- */

/** Everything this tool has put in this browser, gone. Nothing to ask a server to delete. */
export function forgetEverything() {
  forgetSettings();
  forgetDraft();
  forgetIssued();
}

/**
 * Save, but not on every keystroke.
 *
 * The form writes into the settings object on every character typed, and each of those would
 * otherwise be a JSON serialise plus a synchronous storage write on the main thread while
 * somebody is mid-word. A short delay collapses a sentence into one write.
 */
export function debounced(fn, ms = 600) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn(...args); }, ms);
  };
}
