// Changing the shape of somebody's document.
//
// This is the most intrusive thing the widget does, so the rules are narrow and enforced here
// rather than trusted to the caller:
//
//   • ADDITIVE ONLY. Columns are added. Nothing is renamed, retyped or removed, ever. A document
//     that has been upgraded still works exactly as it did with every other tool pointed at it,
//     including Grist's own invoice widget.
//   • NEVER OVER AN EXISTING COLUMN. If a column of that name is already there it is left alone,
//     which is also what makes running the upgrade twice a no-op rather than a mess.
//   • PLANNED, THEN SHOWN, THEN APPLIED. The plan is data. The UI can list every column and the
//     reason for it, and a person can decline the ones they do not want, before anything happens.
//
// Grist's official Invoicing template is the document this exists for. It is missing a status
// column, a paid date, a client email and a stable invoice number, and adding those four is the
// difference between a demonstration and a billing system.

import { upgradeChecklist } from './schema.js';

/** Which table each part of the checklist belongs to, given a detected schema. */
function tableFor(schema, part, products) {
  if (part === 'invoice') return schema?.invoice?.table || null;
  if (part === 'line') return schema?.line?.table || null;
  if (part === 'client') return schema?.client?.table || null;
  if (part === 'product') return products?.table || null;
  return null;
}

/**
 * A Grist column definition from one checklist item.
 *
 * Choice columns carry their options in `widgetOptions`, which Grist expects as a JSON STRING
 * rather than an object — passing the object leaves a Choice column with no choices in it, which
 * looks like it worked and then refuses every value.
 */
function columnDef(item) {
  const def = { type: item.type || 'Text', label: item.label || item.id };
  if (item.type === 'Choice' && Array.isArray(item.options)) {
    def.widgetOptions = JSON.stringify({ choices: item.options, choiceOptions: {} });
  }
  return def;
}

/**
 * What upgrading this document would add.
 *
 * `existing` is the provider's column list per table, so a column already present is dropped from
 * the plan rather than attempted and rejected. `only` narrows the plan to a chosen set of ids,
 * which is how the UI lets someone take the status column and decline the rest.
 */
export function buildUpgradePlan(schema, columnsByTable = {}, only = null, products = null) {
  const wanted = upgradeChecklist(schema, products);
  const columns = [];
  const alreadyThere = [];
  const chosen = only ? new Set(only) : null;

  for (const [part, items] of Object.entries(wanted)) {
    const table = tableFor(schema, part, products);
    if (!table) continue;
    const present = new Set((columnsByTable[table] || []).map((c) => c.id));

    for (const item of items) {
      if (chosen && !chosen.has(item.id)) continue;
      if (present.has(item.id)) { alreadyThere.push({ table, id: item.id }); continue; }

      // A column that REPLACES a formula has to inherit what that formula currently says.
      //
      // Adding a stored `InvoiceNumber` makes it the mapped number, which is the whole point — but
      // it starts empty, so every existing invoice would instantly lose its visible number and
      // show a row id instead. The old value is still computable today; after the upgrade it is
      // still there, just no longer the one being read. So it is copied across as part of the same
      // action, and the upgrade genuinely leaves the document's data intact.
      const derivedFrom = item.replacesFormula ? schema?.[part]?.derived?.[item.role] : null;

      columns.push({
        table, id: item.id, part, role: item.role, why: item.why,
        def: columnDef(item),
        backfillFrom: derivedFrom || null,
      });
    }
  }

  return {
    ok: columns.length > 0,
    columns,
    alreadyThere,
    // Stated up front and repeated in the UI, because "will this break my document" is the only
    // question anybody actually has about a button like this.
    assurance: 'Only adds columns. Nothing is renamed, retyped or removed, and running it again does nothing.',
  };
}

/** The plan as Grist user actions, ready for applyUserActions. */
export function upgradeActions(plan) {
  return (plan?.columns || []).map((c) => ['AddColumn', c.table, c.id, c.def]);
}

/**
 * The follow-up actions that copy a replaced formula's current values into its new column.
 *
 * Separate from the AddColumn actions because the column has to exist before anything can be
 * written into it, and Grist applies a bundle in order but will not let a later action in the same
 * bundle refer to a column an earlier one created.
 */
export function backfillActions(plan, provider) {
  const actions = [];
  for (const c of plan?.columns || []) {
    if (!c.backfillFrom) continue;
    const rows = (provider.records(c.table) || []).filter((r) => r[c.backfillFrom] != null && r[c.backfillFrom] !== '');
    if (!rows.length) continue;
    const asText = String(c.def.type || 'Text').startsWith('Text');
    actions.push(['BulkUpdateRecord', c.table, rows.map((r) => r.id), {
      [c.id]: rows.map((r) => (asText ? String(r[c.backfillFrom]) : r[c.backfillFrom])),
    }]);
  }
  return actions;
}

// ---------------------------------------------------------------------------------------------
// A document with nothing in it yet
// ---------------------------------------------------------------------------------------------

/**
 * The tables a fresh document needs, shaped the way this widget reads best.
 *
 * Deliberately close to Grist's own template — same names for the same things where they overlap —
 * so a document created here and one created from that template are recognised identically and
 * neither is a dialect only we can read.
 */
export const STARTER_TABLES = [
  {
    id: 'Invoices',
    label: 'Invoices',
    columns: [
      { id: 'InvoiceNumber', label: 'Invoice number', type: 'Text' },
      { id: 'Client', label: 'Client', type: 'Ref:Clients' },
      { id: 'Issued', label: 'Issued', type: 'Date' },
      { id: 'Due', label: 'Due', type: 'Date' },
      { id: 'Status', label: 'Status', type: 'Choice',
        widgetOptions: JSON.stringify({ choices: ['Draft', 'Sent', 'Part paid', 'Paid', 'Overdue', 'Cancelled'], choiceOptions: {} }) },
      { id: 'PaidDate', label: 'Paid', type: 'Date' },
      { id: 'AmountPaid', label: 'Amount paid', type: 'Numeric' },
      { id: 'Currency', label: 'Currency', type: 'Text' },
      { id: 'Reference', label: 'Their reference', type: 'Text' },
      { id: 'Terms', label: 'Payment terms', type: 'Text' },
      { id: 'Note', label: 'Note', type: 'Text' },
      { id: 'Total', label: 'Total', type: 'Numeric' },
    ],
  },
  {
    id: 'InvoiceItems',
    label: 'Invoice items',
    columns: [
      { id: 'Invoice', label: 'Invoice', type: 'Ref:Invoices' },
      { id: 'Description', label: 'Description', type: 'Text' },
      { id: 'Quantity', label: 'Quantity', type: 'Numeric' },
      { id: 'Price', label: 'Unit price', type: 'Numeric' },
      { id: 'Total', label: 'Amount', type: 'Numeric' },
      { id: 'TaxClass', label: 'Tax class', type: 'Text' },
      { id: 'HSN', label: 'HSN/SAC', type: 'Text' },
    ],
  },
  {
    id: 'Clients',
    label: 'Clients',
    columns: [
      { id: 'Name', label: 'Name', type: 'Text' },
      { id: 'Email', label: 'Email', type: 'Text' },
      { id: 'Phone', label: 'Phone', type: 'Text' },
      { id: 'Street1', label: 'Address line 1', type: 'Text' },
      { id: 'Street2', label: 'Address line 2', type: 'Text' },
      { id: 'City', label: 'City', type: 'Text' },
      { id: 'State', label: 'State / county', type: 'Text' },
      { id: 'Zip', label: 'Postcode', type: 'Text' },
      { id: 'Country', label: 'Country', type: 'Text' },
      { id: 'TaxNumber', label: 'Tax number', type: 'Text' },
    ],
  },
];

/** Which starter tables this document does not already have. */
export function missingStarterTables(existingTableIds = []) {
  const have = new Set(existingTableIds);
  return STARTER_TABLES.filter((t) => !have.has(t.id));
}

/**
 * Create-table actions.
 *
 * The reference from items to invoices is created in a SECOND pass, after both tables exist —
 * `Ref:Invoices` on a table Grist has not made yet is rejected, and the whole bundle fails with it.
 */
export function createTableActions(tables) {
  const actions = [];
  const deferred = [];
  const names = new Set(tables.map((t) => t.id));

  for (const t of tables) {
    const plain = [];
    for (const c of t.columns) {
      const refTo = /^Ref:(.+)$/.exec(c.type || '');
      if (refTo && names.has(refTo[1])) {
        // Create it as Text now, convert it to a reference once its target exists.
        plain.push({ ...c, type: 'Text' });
        deferred.push(['ModifyColumn', t.id, c.id, { type: c.type }]);
      } else {
        plain.push(c);
      }
    }
    actions.push(['AddTable', t.id, plain]);
  }
  return actions.concat(deferred);
}
