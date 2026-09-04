// Where settings live.
//
// In the user's own document, in two places, for the same reason Advanced Charts uses two: the
// widget OPTION can be read at plain 'read table' access, which is all a viewer's first paint has;
// the config TABLE is durable and shared across every page the widget appears on. Both are read and
// the newer one wins, by a revision stamped on every save.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────
// WHY THIS DOES NOT CALL bridge.saveConfig()
//
// The shared core's saveConfig() writes to ANUPRESS_Config under the key "site", and to the widget
// option "anupressSiteConfig". Those are Advanced Charts' — its entire dashboard design lives in
// them. Both widgets on one document is a completely ordinary thing to want, and calling that
// function from here would overwrite somebody's dashboard the first time they changed a tax rate.
//
// So this file talks to the same table under its OWN key and its own option, and the two products
// coexist. It is a small amount of duplicated plumbing bought with a large amount of not destroying
// anybody's work.
// ────────────────────────────────────────────────────────────────────────────────────────────────

import * as bridge from '../core/grist/bridge.js';
import { DEFAULT_SETTINGS } from './defaults.js';
import { normaliseLanguage } from '../doc/lang.js';

export const CONFIG_TABLE = 'ANUPRESS_Config';
export const CONFIG_KEY = 'invoiceStudio';         // NOT 'site' — see the note above
export const OPTION_KEY = 'invoiceStudioSettings'; // NOT 'anupressSiteConfig'
const REV = '__rev';

const g = () => (typeof window !== 'undefined' ? window.grist : undefined);

// ---------------------------------------------------------------------------------------------
// Pure parts — merging, revisions, validation. Everything testable is here.
// ---------------------------------------------------------------------------------------------

const isPlainObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

/**
 * Fill a stored settings object out with anything it is missing.
 *
 * Recursive, and it keeps unknown keys. Settings written by a LATER version of this widget will be
 * read by an earlier one the moment somebody has two browser tabs open on different releases, and
 * quietly dropping the keys it does not recognise is how a setting disappears when a colleague
 * saves. Arrays are replaced wholesale rather than merged — a rate table with three rows must not
 * inherit a fourth from the defaults.
 */
export function mergeSettings(defaults, stored) {
  if (!isPlainObject(stored)) return clone(defaults);
  const out = clone(defaults);
  for (const [key, value] of Object.entries(stored)) {
    if (isPlainObject(value) && isPlainObject(out[key])) out[key] = mergeSettings(out[key], value);
    else out[key] = clone(value);
  }
  return out;
}

const clone = (v) => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

export const revisionOf = (s) => {
  const n = Number(s && s[REV]);
  return isFinite(n) ? n : 0;
};

/** Of two copies of the settings, the one saved most recently. */
export function pickNewer(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return revisionOf(a) >= revisionOf(b) ? a : b;
}

export function stamp(settings) {
  return { ...settings, [REV]: Date.now() };
}

/**
 * Settings, made safe to hand to the engines.
 *
 * The panel writes whatever a person typed, and a person can type "abc" into a decimals box. This
 * is the one place that has to care, because everything downstream — the rate matcher, the rounder,
 * the numberer — is written to trust its inputs so that it can be simple.
 */
export function sanitise(settings) {
  const s = mergeSettings(DEFAULT_SETTINGS, settings);
  const m = s.money;

  m.currency = String(m.currency || 'USD').trim().toUpperCase().slice(0, 3) || 'USD';
  if (!['left', 'right', 'left_space', 'right_space'].includes(m.format.position)) m.format.position = 'left';
  if (!['halfUp', 'halfEven', 'up', 'down'].includes(m.roundingMode)) m.roundingMode = 'halfUp';
  if (!['billing', 'shipping', 'base'].includes(m.taxBasedOn)) m.taxBasedOn = 'billing';
  if (!['itemized', 'single'].includes(m.displayTaxTotals)) m.displayTaxTotals = 'itemized';

  const dp = Number(m.format.decimals);
  m.format.decimals = m.format.decimals == null || m.format.decimals === '' ? null : (isFinite(dp) ? Math.max(0, Math.min(6, Math.round(dp))) : null);

  // A separator has to be exactly one character, and the two cannot be the same one — "1,234,56"
  // is not a number anybody can read.
  m.format.thousandSeparator = String(m.format.thousandSeparator ?? ',').slice(0, 1);
  m.format.decimalSeparator = String(m.format.decimalSeparator ?? '.').slice(0, 1) || '.';
  if (m.format.thousandSeparator === m.format.decimalSeparator) m.format.thousandSeparator = m.format.decimalSeparator === '.' ? ',' : '.';

  if (!['simple', 'preset', 'none'].includes(m.taxMode)) m.taxMode = 'simple';
  const simple = Number(m.simpleRate);
  // A rate is a percentage, and a percentage over a hundred is a typo rather than a tax regime.
  m.simpleRate = isFinite(simple) ? Math.max(0, Math.min(100, simple)) : 0;
  m.simpleName = String(m.simpleName || 'Tax').trim().slice(0, 24) || 'Tax';

  m.taxRates = Array.isArray(m.taxRates) ? m.taxRates.filter((r) => r && isFinite(Number(r.rate))) : [];
  for (const key of ['homeCountry', 'homeState', 'defaultCustomerCountry']) {
    m[key] = String(m[key] || '').trim().toUpperCase();
  }

  const n = s.numbering;
  const pad = Number(n.padding);
  n.padding = isFinite(pad) ? Math.max(0, Math.min(12, Math.round(pad))) : 4;
  const start = Number(n.start);
  n.start = isFinite(start) && start > 0 ? Math.round(start) : 1;
  if (!['yearly', 'monthly', 'never'].includes(n.resetPeriod)) n.resetPeriod = 'yearly';

  const doc = s.document;
  if (!['a4', 'letter', 'legal', 'a5', 'receipt80', 'receipt58'].includes(doc.paperSize)) doc.paperSize = 'a4';
  if (!['compact', 'normal', 'roomy'].includes(doc.density)) doc.density = 'normal';
  doc.language = normaliseLanguage(doc.language) || 'en';
  if (!['auto', 'embed'].includes(doc.pdfFont)) doc.pdfFont = 'auto';
  doc.lockIssued = doc.lockIssued !== false;
  doc.showPayQr = doc.showPayQr !== false;

  // The logo ends up in an <img src>, in an email body, and spliced into a PDF, so nothing but a
  // well-formed image data URI is kept — a javascript: URL or an external address stored here would
  // be replayed into every document rendered from these settings. The size cap keeps the settings
  // JSON, which is written to a Grist cell on every save, from quietly carrying a photograph.
  const dataImage = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/;
  for (const key of ['logoData', 'logoJpeg']) {
    const v = s.business[key];
    s.business[key] = typeof v === 'string' && v.length <= 400000 && dataImage.test(v) ? v : null;
  }
  if (s.business.logoJpeg && !s.business.logoJpeg.startsWith('data:image/jpeg')) s.business.logoJpeg = null;

  // Ways of being paid. An IBAN is stored the way the standard wants it; a payment link has to be
  // https, because it is printed on a document and encoded into a code a client scans.
  const b = s.business;
  b.iban = String(b.iban || '').replace(/\s+/g, '').toUpperCase().slice(0, 34);
  b.bic = String(b.bic || '').replace(/\s+/g, '').toUpperCase().slice(0, 11);
  b.accountHolder = String(b.accountHolder || '').trim().slice(0, 70);
  b.upiId = String(b.upiId || '').trim().slice(0, 64);
  b.paymentLink = /^https:\/\/\S+$/i.test(String(b.paymentLink || '').trim()) ? String(b.paymentLink).trim().slice(0, 500) : '';
  b.legalText = String(b.legalText || '').trim().slice(0, 600);

  if (!['', 'small_business'].includes(m.exemption)) m.exemption = '';
  m.exemptionText = String(m.exemptionText || '').trim().slice(0, 300);

  s.delivery.endpoint = String(s.delivery.endpoint || '').trim();
  if (!['pdf', 'html', 'none', 'facturx', 'ubl', 'cii'].includes(s.delivery.attachFormat)) s.delivery.attachFormat = 'pdf';
  if (!['', 'en16931', 'xrechnung', 'peppol'].includes(s.einvoice.profile)) s.einvoice.profile = '';
  // An e-invoice format as the default attachment only makes sense with a profile to write it under.
  if (!s.einvoice.profile && ['facturx', 'ubl', 'cii'].includes(s.delivery.attachFormat)) s.delivery.attachFormat = 'pdf';
  s.delivery.includeInBody = s.delivery.includeInBody !== false;

  // Table overrides are ids, and an id is a short string. Anything else stored there is noise.
  for (const key of ['invoice', 'line', 'client', 'product']) {
    s.tables[key] = typeof s.tables[key] === 'string' ? s.tables[key].slice(0, 64) : '';
  }

  // Saved message wordings: strings, capped, and an entry that overrides nothing is dropped.
  const messages = {};
  for (const [id, m] of Object.entries(s.messages || {})) {
    if (!m || typeof m !== 'object') continue;
    const entry = {};
    if (typeof m.subject === 'string') entry.subject = m.subject.slice(0, 300);
    if (typeof m.body === 'string') entry.body = m.body.slice(0, 8000);
    if (Object.keys(entry).length) messages[String(id).slice(0, 64)] = entry;
  }
  s.messages = messages;
  return s;
}

// ---------------------------------------------------------------------------------------------
// Reading and writing
// ---------------------------------------------------------------------------------------------

async function readOption() {
  try {
    const raw = await bridge.getOption(OPTION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function readTable() {
  if (!bridge.hasGrist()) return null;
  try {
    const tbl = await g().docApi.fetchTable(CONFIG_TABLE);
    for (let i = 0; i < (tbl.id?.length || 0); i++) {
      if (tbl.Key[i] === CONFIG_KEY) return JSON.parse(tbl.Value[i]);
    }
  } catch { /* no table yet, or nothing of ours in it */ }
  return null;
}

/** Whatever was saved last, filled out and made safe. */
export async function loadSettings() {
  const [fromOption, fromTable] = await Promise.all([readOption(), readTable()]);
  const stored = pickNewer(fromOption, fromTable);
  return sanitise(stored || {});
}

/**
 * Save, to both stores.
 *
 * The option is written first and always, because it is the one a plain viewer can read. The table
 * write needs full access and is allowed to fail — settings that live only in the widget option
 * still work for the person who set them, which is a much better outcome than refusing to save.
 */
export async function saveSettings(settings) {
  const payload = stamp(sanitise(settings));
  const json = JSON.stringify(payload);

  await bridge.setOption(json, OPTION_KEY);
  if (!bridge.hasGrist() || bridge.accessLevel() !== 'full') {
    return { ok: true, settings: payload, storedInTable: false };
  }

  try {
    await bridge.ensureTables();
    const tbl = await g().docApi.fetchTable(CONFIG_TABLE);
    let rowId = null;
    for (let i = 0; i < (tbl.id?.length || 0); i++) if (tbl.Key[i] === CONFIG_KEY) rowId = tbl.id[i];

    await g().docApi.applyUserActions([
      rowId
        ? ['UpdateRecord', CONFIG_TABLE, rowId, { Value: json }]
        : ['AddRecord', CONFIG_TABLE, null, { Key: CONFIG_KEY, Value: json }],
    ]);
    return { ok: true, settings: payload, storedInTable: true };
  } catch (e) {
    console.warn('[Invoice Studio] settings saved to the widget only — the document could not be written', e);
    return { ok: true, settings: payload, storedInTable: false, warning: 'Saved for this widget, but not into the document. Enable editing to share them across pages.' };
  }
}
