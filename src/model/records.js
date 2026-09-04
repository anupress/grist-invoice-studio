// Clients and catalogue items as things a person edits, not rows they open a table for.
//
// The composer reads clients and products through ROLES — "the thing that is the client's email",
// "the thing that is the unit price" — and this file is the other direction: a form whose fields
// are those roles, and a plan that turns what was typed into the cells of whatever table the
// document keeps them in. A document whose client table has no Email column shows the field
// greyed with the reason, rather than hiding it and leaving a person to wonder where email went.
//
// Pure, like write.js: it produces a plan and something else carries it out.

import { toCell } from './write.js';
import { LANGUAGES } from '../doc/lang.js';

/** The client form, top to bottom. `role` is the schema role; the rest is how to ask. */
export const CLIENT_FORM = [
  { role: 'name', label: 'Name', required: true, placeholder: 'Harbour Lane Bakery' },
  { role: 'email', label: 'Email', type: 'email', placeholder: 'accounts@example.com' },
  { role: 'phone', label: 'Phone' },
  { role: 'street1', label: 'Address line 1' },
  { role: 'street2', label: 'Address line 2' },
  { role: 'city', label: 'City' },
  { role: 'state', label: 'State / county' },
  { role: 'postcode', label: 'Postcode' },
  { role: 'country', label: 'Country', code: true, placeholder: 'GB', hint: 'Two letters. Decides the tax rate, and an e-invoice will not accept anything else.' },
  { role: 'taxNumber', label: 'Tax number', placeholder: 'GB 123 4567 89', hint: 'With its country prefix, if it is a VAT number.' },
  { role: 'language', label: 'Language', type: 'language', hint: 'The language their documents are written in.' },
];

/** The catalogue form. */
export const PRODUCT_FORM = [
  { role: 'name', label: 'Name', required: true, placeholder: 'Site survey and measurement' },
  { role: 'sku', label: 'SKU', code: true },
  { role: 'unitPrice', label: 'Unit price', type: 'number', required: true },
  { role: 'unit', label: 'Unit', placeholder: 'hour, day, m², pcs' },
  { role: 'taxClass', label: 'Tax class', placeholder: 'standard, reduced, zero', hint: 'Matched against the rate table; empty is the standard rate.' },
  { role: 'hsn', label: 'HSN/SAC', code: true, hint: 'For Indian GST only.' },
  { role: 'stock', label: 'In stock', type: 'number' },
  { role: 'image', label: 'Picture', type: 'image', hint: 'Shown as a thumbnail beside every line that bills it.' },
];

export const FORMS = { client: CLIENT_FORM, product: PRODUCT_FORM };

const isAttachments = (col) => /^Attachments/i.test(String(col?.type || ''));

/**
 * The form, resolved against a real table.
 *
 * Each field learns which column it writes to, whether it can be written at all (a formula
 * column cannot be), and — for the picture — whether the column takes attachments or text.
 */
export function formFields(kind, roles = {}, columns = []) {
  const byId = new Map((columns || []).map((c) => [c.id, c]));
  return (FORMS[kind] || []).map((f) => {
    const colId = roles[f.role] || null;
    const column = colId ? byId.get(colId) || null : null;
    // A role is only as present as its column: a mapping that names a column the table has since
    // lost is no mapping, and writing through it would fail in Grist.
    return {
      ...f,
      colId,
      column,
      present: !!column,
      writable: !!column && !column.isFormula,
      attachments: f.type === 'image' && isAttachments(column),
    };
  });
}

/** What a row says, by role, as the form wants it. */
export function readRecord(row, kind, roles = {}) {
  const out = {};
  for (const f of FORMS[kind] || []) {
    const colId = roles[f.role];
    out[f.role] = colId && row ? row[colId] : (f.type === 'number' ? '' : '');
  }
  return out;
}

/** A display name for a record, for lists and toasts. */
export function recordName(values, kind) {
  const name = String(values?.name || '').trim();
  if (name) return name;
  return kind === 'product' ? 'Untitled item' : 'Unnamed client';
}

/**
 * What it would take to save this record.
 *
 * `values` is by role. Fields with no column, or a formula column, are reported as skipped rather
 * than dropped quietly — a person who typed a phone number into a document that has nowhere to
 * keep it needs to be told. Empty strings are written as empty (a cleared field is a cleared
 * cell), except on a new row where nothing is written for them at all.
 *
 * The picture is the one field that is not a string: an Attachments column takes `['L', id]`
 * (already uploaded by the caller) or null, and a Text column takes a URL or data URI.
 */
export function recordPlan({ kind, table, roles = {}, columns = [], rowId = null, values = {} }) {
  const fields = {};
  const skipped = [];
  const problems = [];
  const spec = formFields(kind, roles, columns);

  for (const f of spec) {
    const raw = values[f.role];
    if (raw === undefined) continue;
    if (!f.present) {
      if (raw !== '' && raw != null) skipped.push({ role: f.role, reason: 'no column in this table holds it' });
      continue;
    }
    if (!f.writable) {
      if (raw !== '' && raw != null) skipped.push({ role: f.role, column: f.colId, reason: 'that column is a formula, so Grist will not accept a value' });
      continue;
    }
    if (f.type === 'image') {
      if (f.attachments) {
        // Already uploaded: a list of ids, or nothing. A string here is a picture that was never
        // uploaded, and writing it would put text into an attachment cell.
        if (raw == null || raw === '') { if (rowId != null) fields[f.colId] = null; continue; }
        if (Array.isArray(raw)) { fields[f.colId] = raw; continue; }
        if (typeof raw === 'number') { fields[f.colId] = ['L', raw]; continue; }
        skipped.push({ role: f.role, column: f.colId, reason: 'the picture was not uploaded, so it cannot go into an Attachments column' });
        continue;
      }
      fields[f.colId] = raw == null ? '' : (Array.isArray(raw) ? '' : String(raw));
      continue;
    }
    if ((raw === '' || raw == null) && rowId == null) continue;   // a blank on a new row: nothing to write
    const cell = toCell(raw === '' ? (f.type === 'number' ? '' : '') : raw, f.column);
    if (cell === undefined) {
      skipped.push({ role: f.role, column: f.colId, reason: `"${String(raw)}" is not a ${String(f.column?.type || 'text').toLowerCase()} value` });
      continue;
    }
    fields[f.colId] = cell;
  }

  const required = spec.filter((f) => f.required && f.present);
  for (const f of required) {
    const v = values[f.role];
    if (v == null || String(v).trim() === '') problems.push(`${f.label} is required.`);
  }
  if (!Object.keys(fields).length && !problems.length) problems.push('Nothing on this form maps to a column that can be written.');

  return { ok: problems.length === 0, problems, skipped, table, rowId, fields, kind };
}

/** The language options for the client form: none, then the eight. */
export const LANGUAGE_OPTIONS = [{ value: '', label: 'Business default' }, ...LANGUAGES.map((l) => ({ value: l.id, label: l.label }))];
