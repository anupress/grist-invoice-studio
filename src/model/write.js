// Turning a draft back into rows.
//
// This is the direction that can damage somebody's document, so it is pure and it is planned. It
// produces a PLAN — which rows to add, which to update, which to remove, and which columns it
// deliberately would not touch — and something else carries the plan out. That split is what makes
// it testable without a Grist connection, and it is what lets the UI show a person exactly what is
// about to happen to their table before it happens.
//
// Three rules do most of the work, and each was a real failure before it was a rule:
//
//   FORMULA COLUMNS ARE NEVER WRITTEN. Grist rejects the action, so an invoice would half-save with
//   no obvious reason. Grist's own template computes its `Number` from the row id, so this is not a
//   corner case — it is the default document this widget is pointed at.
//
//   ONLY MAPPED ROLES ARE WRITTEN. A document with no status column does not get one invented; the
//   value is dropped and reported. Silently creating columns in someone's table is the upgrade's
//   job, and it asks first.
//
//   VALUES ARE CONVERTED TO WHAT THE COLUMN HOLDS. Grist stores a Date as epoch seconds, not as
//   "2026-08-27". Sending the string puts text in a date column, which then sorts alphabetically
//   and breaks every formula pointing at it.

const isFormula = (col) => !!(col && col.isFormula);
const typeOf = (col) => String((col && col.type) || 'Text');
const isDateType = (t) => /^Date/i.test(t);
const isRefType = (t) => /^Ref(?::|$)/i.test(t);
const isNumericType = (t) => /^(Numeric|Int|Currency)/i.test(t);
const isBoolType = (t) => /^Bool/i.test(t);

/** Index a column list by id, so lookups are not a scan per field. */
const indexColumns = (columns) => {
  const map = new Map();
  for (const c of columns || []) if (c && c.id) map.set(c.id, c);
  return map;
};

/**
 * Convert one value into what the column actually stores.
 *
 * Returns `undefined` to mean "do not write this at all", which is different from null — null
 * clears a cell, and clearing a cell somebody filled in by hand is not what an empty field in our
 * form means.
 */
export function toCell(value, col) {
  const type = typeOf(col);
  if (value === undefined) return undefined;
  if (value === null) return null;

  if (isDateType(type)) {
    const s = String(value).trim();
    if (!s) return null;
    // Grist keeps Date and DateTime as epoch SECONDS. A "YYYY-MM-DD" is read as UTC midnight,
    // which is what the read side (core/grist/dates.js) assumes too, so a value round-trips to
    // the same day rather than drifting by one in whichever direction the viewer's zone lies.
    const ms = /^\d{4}-\d{2}-\d{2}$/.test(s) ? Date.parse(s + 'T00:00:00Z') : Date.parse(s);
    return isFinite(ms) ? Math.floor(ms / 1000) : null;
  }

  if (isBoolType(type)) return !!value;

  if (isNumericType(type)) {
    if (value === '') return null;
    if (typeof value === 'number') return isFinite(value) ? value : null;

    // Currency symbols and thousands separators are stripped, because "£1,234.50" is a number
    // somebody typed. Letters are NOT, and this is the important half: parseFloat on a stripped
    // "INV-2026-0001" happily returns -2026, so a text invoice number written into a Numeric
    // column becomes a plausible-looking wrong value with no error anywhere. Refusing to write is
    // the only safe answer — undefined means "do not write this", and the caller reports it.
    const cleaned = String(value).trim().replace(/[£$€₹¥,\s]/g, '');
    if (cleaned === '') return null;
    const n = Number(cleaned);
    return isFinite(n) ? n : undefined;
  }

  if (isRefType(type)) {
    // A reference holds a row id. Anything that is not a number would be written as text into an
    // integer column, which Grist accepts and then cannot resolve.
    const n = typeof value === 'number' ? value : parseInt(String(value), 10);
    return isFinite(n) && n > 0 ? n : 0;   // 0 is Grist's empty reference
  }

  return value == null ? '' : String(value);
}

/**
 * The values a draft wants to put in the invoice row, by role.
 *
 * Totals are included because plenty of documents keep them — but they are written only where a
 * real, non-formula column exists for them. A table whose Total is a formula keeps its formula.
 */
function invoiceValues(draft) {
  const t = draft.totals || {};
  return {
    number: draft.number,
    client: draft.clientRef != null ? draft.clientRef : draft.client?.name,
    issued: draft.issued,
    due: draft.due,
    status: draft.status,
    note: draft.note,
    reference: draft.reference,
    terms: draft.terms,
    // Currency is the one field where empty is an instruction, not an omission: it means "follow
    // the business currency", and on an existing row that only comes true if the stored override
    // is actually cleared. So a cleared field writes null on an update — null clears the cell —
    // while a new row simply doesn't write one.
    currency: draft.currency || (draft.rowId != null ? null : undefined),
    sentAt: draft.sentAt,
    sentTo: draft.sentTo,
    amountPaid: t.amountPaid,
    subtotal: t.subtotal,
    tax: t.taxTotal,
    discount: t.discountTotal,
    shipping: t.shipping?.amount,
    total: t.total,
  };
}

/** The values one draft line wants to put in a line row. */
function lineValues(line) {
  return {
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    lineTotal: line.amount,
    taxClass: line.taxClass,
    hsn: line.hsn,
    unit: line.unit,
    lineDiscount: line.discountAmount || undefined,
  };
}

/**
 * Build the field object for one row from a role→value map.
 *
 * Everything skipped is reported rather than dropped quietly: a person who typed a purchase-order
 * number into a document that has nowhere to keep it needs to be told, not left to discover it.
 */
/**
 * Roles the engine works out rather than the user typing them.
 *
 * They are still written where a column exists — plenty of documents keep a Total, and other tools
 * read it. But their ABSENCE is not worth reporting: warning somebody that a figure they never
 * entered could not be saved, when it is recomputed from the lines every time the document is
 * opened, is noise. And noise in a warning list is how people learn to ignore the list, which
 * matters because the same list is where "your purchase-order number was not saved" appears.
 */
const COMPUTED_ROLES = new Set(['subtotal', 'tax', 'discount', 'shipping', 'total']);

function fieldsFor(values, roles, columnIndex, skipped, where) {
  const fields = {};
  for (const [role, raw] of Object.entries(values)) {
    if (raw === undefined || raw === '') continue;
    const colId = roles[role];
    if (!colId) {
      if (!COMPUTED_ROLES.has(role)) skipped.push({ where, role, reason: 'no column in this document holds it' });
      continue;
    }
    const col = columnIndex.get(colId);
    if (isFormula(col)) {
      skipped.push({ where, role, column: colId, reason: 'that column is a formula, so Grist will not accept a value' });
      continue;
    }
    const cell = toCell(raw, col);
    if (cell === undefined) {
      skipped.push({
        where, role, column: colId,
        reason: `"${String(raw)}" is not a ${typeOf(col).toLowerCase()} value, so it would be stored wrongly`,
      });
      continue;
    }
    fields[colId] = cell;
  }
  return fields;
}

/**
 * What it would take to save this draft.
 *
 * `context` carries the document's own shape: the column lists for each table, and the line rows
 * that currently belong to this invoice so that removed lines can be removed rather than orphaned.
 */
export function buildWritePlan(draft, schema, context = {}) {
  const problems = [];
  const skipped = [];

  if (!schema?.invoice?.table) {
    return { ok: false, problems: ['This document has no invoice table to save into.'], skipped, invoice: null, lines: null };
  }

  const invoiceIndex = indexColumns(context.invoiceColumns);
  const invoiceFields = fieldsFor(invoiceValues(draft), schema.invoice.roles, invoiceIndex, skipped, 'invoice');

  if (!Object.keys(invoiceFields).length) {
    problems.push('Nothing on this document maps to a column that can be written.');
  }

  const plan = {
    ok: false,
    problems,
    skipped,
    invoice: {
      table: schema.invoice.table, rowId: draft.rowId ?? null, fields: invoiceFields,
      // Carried so the writer can extend a Choice column's list when a status is new. The plan is
      // the only thing that knows both the column and the value as typed.
      statusColumn: schema.invoice.roles.status || null,
      statusValue: String(draft.status || '').trim(),
    },
    lines: null,
  };

  // ---- line items --------------------------------------------------------------------------
  if (schema.line?.table) {
    const lineIndex = indexColumns(context.lineColumns);
    const roles = schema.line.roles;
    const linkCol = roles.invoiceLink ? lineIndex.get(roles.invoiceLink) : null;

    const adds = [];
    const updates = [];
    for (const line of draft.lines || []) {
      // A line with nothing on it is what an empty row in the grid looks like — and a new document
      // opens with one, so this is the common case rather than an edge one. Writing it would put a
      // blank row in somebody's table every time they pressed Add and changed their mind.
      //
      // Quantity is deliberately NOT part of the test: a fresh row defaults to a quantity of 1, so
      // counting it as content would make every empty row look filled in. A description or a price
      // is somebody having typed something; a quantity on its own is not.
      if (!String(line.description || '').trim() && !line.unitPrice && !line.amount) continue;

      const fields = fieldsFor(lineValues(line), roles, lineIndex, skipped, 'line');
      if (linkCol && !isFormula(linkCol)) {
        // A reference link needs the invoice's row id, which a brand-new invoice does not have yet
        // — the executor fills it in after the header row is created. A text link carries the
        // invoice number instead, which is known now.
        fields[roles.invoiceLink] = isRefType(typeOf(linkCol))
          ? (draft.rowId ?? '__INVOICE_ROW_ID__')
          : toCell(draft.number, linkCol);
      }
      if (line.rowId) updates.push({ id: line.rowId, fields });
      else adds.push(fields);
    }

    // Anything that was on this invoice and is not any more.
    const kept = new Set((draft.lines || []).map((l) => l.rowId).filter(Boolean));
    const removes = (context.existingLineRows || [])
      .map((r) => r.id)
      .filter((id) => !kept.has(id));

    plan.lines = { table: schema.line.table, adds, updates, removes };
  } else if ((draft.lines || []).some((l) => String(l.description || '').trim())) {
    problems.push('This document has no line-item table, so the individual lines cannot be saved. The invoice total still can.');
  }

  plan.ok = problems.length === 0;
  return plan;
}

/** A short, plain summary of what a plan will do, for a confirmation the user actually reads. */
export function describePlan(plan) {
  if (!plan) return '';
  const bits = [];
  bits.push(plan.invoice.rowId ? 'Update 1 invoice' : 'Add 1 invoice');
  if (plan.lines) {
    if (plan.lines.adds.length) bits.push(`add ${plan.lines.adds.length} line${plan.lines.adds.length === 1 ? '' : 's'}`);
    if (plan.lines.updates.length) bits.push(`update ${plan.lines.updates.length} line${plan.lines.updates.length === 1 ? '' : 's'}`);
    if (plan.lines.removes.length) bits.push(`remove ${plan.lines.removes.length} line${plan.lines.removes.length === 1 ? '' : 's'}`);
  }
  return bits.join(', ') + '.';
}

/**
 * The invoice numbers already used in this document, for the numbering module to count from.
 *
 * Read straight off the rows rather than kept in a counter, because a counter and a table drift
 * apart the moment anyone edits the table directly — and people do.
 */
export function existingNumbers(schema, provider) {
  if (!schema?.invoice?.roles?.number) return [];
  const col = schema.invoice.roles.number;
  return (provider.records(schema.invoice.table) || [])
    .map((r) => r[col])
    .filter((v) => v != null && v !== '')
    .map(String);
}
