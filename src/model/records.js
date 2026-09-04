// Clients and catalogue items as things a person edits, not rows they open a table for.
//
// The composer reads clients and products through ROLES — "the thing that is the client's email",
// "the thing that is the unit price" — and this file is the other direction: a form whose fields
// are those roles, and a plan that turns what was typed into the cells of whatever table the
// document keeps them in. A document whose client table has no Email column shows the field
// greyed with the reason, rather than hiding it and leaving a person to wonder where email went.
//
// Two kinds of field, and the second is what makes this work on somebody else's table:
//
//   KNOWN    the roles the widget itself uses — name, price, picture — asked for in a fixed order
//            with the right control and the right hint.
//   EXTRA    every other column the table has. A catalogue with Colour, Size and Supplier gets
//            three more boxes, because they are that business's columns and there is no reason
//            the widget should be the one place they cannot be filled in.
//
// Pure, like write.js: it produces a plan and something else carries it out.

import { toCell } from './write.js';
import { choicesOf } from './schema.js';
import { LANGUAGES } from '../doc/lang.js';

/** The client form, top to bottom. `role` is the schema role; the rest is how to ask. */
export const CLIENT_FORM = [
  { role: 'name', label: 'Name', required: true, placeholder: 'Harbour Lane Bakery', wide: true },
  { role: 'email', label: 'Email', type: 'email', placeholder: 'accounts@example.com' },
  { role: 'phone', label: 'Phone' },
  { role: 'street1', label: 'Address line 1', wide: true },
  { role: 'street2', label: 'Address line 2', wide: true },
  { role: 'city', label: 'City' },
  { role: 'state', label: 'State / county' },
  { role: 'postcode', label: 'Postcode' },
  { role: 'country', label: 'Country', code: true, placeholder: 'GB', suggest: 'country', hint: 'Two letters. Decides the tax rate, and an e-invoice will not accept anything else.' },
  { role: 'taxNumber', label: 'Tax number', placeholder: 'GB 123 4567 89', hint: 'With its country prefix, if it is a VAT number.' },
  { role: 'language', label: 'Language', type: 'language', hint: 'The language their documents are written in.' },
];

/** The catalogue form. */
export const PRODUCT_FORM = [
  { role: 'name', label: 'Name', required: true, placeholder: 'Site survey and measurement', wide: true },
  { role: 'sku', label: 'SKU', code: true },
  { role: 'unitPrice', label: 'Unit price', type: 'number', required: true },
  { role: 'unit', label: 'Unit', placeholder: 'hour, day, m², pack', suggest: 'unit' },
  { role: 'taxClass', label: 'Tax class', placeholder: 'standard', suggest: 'taxClass', hint: 'Matched against your rate table; empty is the standard rate.' },
  { role: 'hsn', label: 'HSN/SAC', code: true, hint: 'For Indian GST only.' },
  { role: 'stock', label: 'In stock', type: 'number' },
  { role: 'image', label: 'Picture', type: 'image', wide: true, hint: 'Shown as a thumbnail beside every line that bills it.' },
];

export const FORMS = { client: CLIENT_FORM, product: PRODUCT_FORM };

/** Which upgrade column would fill a role the table is missing, per kind. */
export const ADDABLE = {
  client: { email: 'Email', phone: 'Phone', taxNumber: 'TaxNumber', country: 'Country', language: 'Language' },
  product: { image: 'Image' },
};

const isAttachments = (col) => /^Attachments/i.test(String(col?.type || ''));

/** Columns nobody should be asked to fill in: Grist's own, and ours. */
const HIDDEN_COLUMNS = /^(id|manualSort|gristHelper_|_grist)/;

/**
 * The control an ordinary column deserves, from its Grist type.
 *
 * Anything structured — a reference, a choice list, a second attachments column — is left out
 * rather than given a text box that would write a string where a list belongs.
 */
function controlFor(col) {
  const type = String(col?.type || 'Text');
  if (/^(Numeric|Int|Currency)/i.test(type)) return 'number';
  if (/^Bool/i.test(type)) return 'bool';
  if (/^Date$/i.test(type)) return 'date';
  if (/^Choice$/i.test(type)) return 'choice';
  if (/^(Ref|RefList|ChoiceList|Attachments|DateTime|Any)/i.test(type)) return null;
  return 'text';
}

/**
 * The form, resolved against a real table.
 *
 * Each field learns which column it writes to, whether it can be written at all (a formula
 * column cannot be), and — for the picture — whether the column takes attachments or text.
 * A role mapped to a column the table no longer has counts as absent: writing through it would
 * simply fail in Grist.
 */
export function formFields(kind, roles = {}, columns = []) {
  const byId = new Map((columns || []).map((c) => [c.id, c]));
  return (FORMS[kind] || []).map((f) => {
    const colId = roles[f.role] || null;
    const column = colId ? byId.get(colId) || null : null;
    return {
      ...f,
      colId,
      column,
      present: !!column,
      writable: !!column && !column.isFormula,
      attachments: f.type === 'image' && isAttachments(column),
      addable: !column && !!ADDABLE[kind]?.[f.role],
    };
  });
}

/**
 * The table's own columns, the ones no role claims.
 *
 * This is the difference between a form that works on our four tables and a form that works on
 * anybody's: a business that added Supplier, Colour or "Sold by weight" fills those in here.
 */
export function extraFields(kind, roles = {}, columns = []) {
  const used = new Set(Object.values(roles || {}).filter(Boolean));
  const out = [];
  for (const col of columns || []) {
    if (!col || !col.id || used.has(col.id) || col.isFormula) continue;
    if (HIDDEN_COLUMNS.test(col.id)) continue;
    const control = controlFor(col);
    if (!control) continue;
    out.push({
      role: '@' + col.id,          // '@' so an extra can never collide with a role name
      label: col.label || col.id,
      type: control,
      choices: control === 'choice' ? choicesOf(col.widgetOptions) : null,
      colId: col.id,
      column: col,
      present: true,
      writable: true,
      extra: true,
    });
  }
  return out;
}

/** Every field the form shows, known then extra. */
export const allFields = (kind, roles, columns) => [...formFields(kind, roles, columns), ...extraFields(kind, roles, columns)];

/** What a row says, by role, as the form wants it. */
export function readRecord(row, kind, roles = {}, columns = []) {
  const out = {};
  for (const f of FORMS[kind] || []) {
    const colId = roles[f.role];
    out[f.role] = colId && row ? row[colId] : '';
  }
  for (const f of extraFields(kind, roles, columns)) {
    const v = row ? row[f.colId] : undefined;
    out[f.role] = v === undefined || v === null ? (f.type === 'bool' ? false : '') : v;
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
 * `values` is by role ('@Column' for the table's own columns). Fields with no column, or a
 * formula column, are reported as skipped rather than dropped quietly — a person who typed a
 * phone number into a document that has nowhere to keep it needs to be told. Empty strings are
 * written as empty (a cleared field is a cleared cell), except on a new row where nothing is
 * written for them at all.
 *
 * The picture is the one field that is not a string. `imageMode` says what its column can hold:
 *
 *   'attachment'  the live case — the caller has already uploaded, so the value is `['L', id]`
 *   'inline'      the demo, and any Text picture column — a data URI or an https address
 */
export function recordPlan({ kind, table, roles = {}, columns = [], rowId = null, values = {}, imageMode = 'attachment' }) {
  const fields = {};
  const skipped = [];
  const problems = [];
  const spec = allFields(kind, roles, columns);

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
      if (raw == null || raw === '') { if (rowId != null) fields[f.colId] = null; continue; }
      if (Array.isArray(raw)) { fields[f.colId] = raw; continue; }                 // already an attachment cell
      if (typeof raw === 'number') { fields[f.colId] = ['L', raw]; continue; }     // a bare attachment id
      if (!f.attachments) { fields[f.colId] = String(raw); continue; }             // a Text picture column
      if (imageMode === 'inline') { fields[f.colId] = raw; continue; }             // the demo's in-memory table
      skipped.push({ role: f.role, column: f.colId, reason: 'the picture was not uploaded, so it cannot go into an Attachments column' });
      continue;
    }

    if (f.type === 'bool') { fields[f.colId] = !!raw; continue; }
    if ((raw === '' || raw == null) && rowId == null) continue;   // a blank on a new row: nothing to write

    const cell = toCell(raw, f.column);
    if (cell === undefined) {
      skipped.push({ role: f.role, column: f.colId, reason: `"${String(raw)}" is not a ${String(f.column?.type || 'text').toLowerCase()} value` });
      continue;
    }
    fields[f.colId] = cell;
  }

  for (const f of spec) {
    if (!f.required || !f.present) continue;
    const v = values[f.role];
    if (v == null || String(v).trim() === '') problems.push(`${f.label} is required.`);
  }
  if (!Object.keys(fields).length && !problems.length) problems.push('Nothing on this form maps to a column that can be written.');

  return { ok: problems.length === 0, problems, skipped, table, rowId, fields, kind };
}

/** The language options for the client form: none, then the eight. */
export const LANGUAGE_OPTIONS = [{ value: '', label: 'Business default' }, ...LANGUAGES.map((l) => ({ value: l.id, label: l.label }))];
