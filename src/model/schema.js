// Working out what an invoice looks like in someone else's document.
//
// Invoice Studio never dictates a schema. It reads whatever is already there and maps it onto a set
// of ROLES — "the thing that is the invoice number", "the thing that is the client's email" — and
// every renderer, every total and every email works off roles rather than column names. That
// indirection is the entire reason the widget can be pointed at a document it has never seen.
//
// There are two ways a mapping gets produced, and the order matters:
//
//   1. RECOGNITION. Grist ships an official Invoicing template, and it is where most people who
//      need to bill someone start. Its shape is known exactly (see OFFICIAL_TEMPLATE below), so it
//      is matched as a whole rather than guessed at column by column. Someone running that template
//      points this widget at their document and it is configured — nothing to fill in.
//
//   2. HEURISTICS. Everyone else. Roles are matched by name patterns, with the vocabulary Grist's
//      own invoice widget accepts ranked first, so a document built to satisfy THAT widget also
//      satisfies this one. Swapping the widget URL is then the whole migration.
//
// Pure and dependency-free on purpose: this is the file most likely to be wrong about a real
// document, so it has to be testable without a browser or a Grist connection.

// ---------------------------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------------------------

/** Roles on the invoice header row. */
import { KIND_WORDS } from '../doc/kinds.js';

export const INVOICE_ROLES = [
  'number', 'client', 'issued', 'due', 'status', 'kind', 'paidDate', 'amountPaid',
  'currency', 'note', 'reference', 'terms', 'subtotal', 'tax', 'discount',
  'shipping', 'total', 'attachment', 'sentAt', 'sentTo', 'language', 'relatedTo',
];

/** Roles on a line-item row. */
export const LINE_ROLES = ['invoiceLink', 'description', 'quantity', 'unitPrice', 'lineTotal', 'product', 'taxClass', 'lineDiscount', 'hsn', 'unit'];

/** Roles on a client row. */
export const CLIENT_ROLES = ['name', 'email', 'phone', 'taxNumber', 'street1', 'street2', 'city', 'state', 'postcode', 'country', 'language'];

/**
 * The roles without which there is no invoice at all.
 *
 * Deliberately short. A document with a client and an amount can produce a defensible document;
 * everything else degrades to a sensible default or is simply left off the page. Demanding more
 * than this up front is how a tool ends up showing a configuration screen instead of an invoice.
 */
export const REQUIRED_INVOICE_ROLES = ['client'];

// ---------------------------------------------------------------------------------------------
// Grist's official Invoicing template
// ---------------------------------------------------------------------------------------------

/**
 * The exact shape of Grist's own Invoicing template, as read from its public API.
 *
 * Matching is by COLUMN SET rather than table name, because people rename tables and almost never
 * rename the columns a formula depends on. `signature` columns are the ones that must all be
 * present for the table to be considered that table.
 */
export const OFFICIAL_TEMPLATE = {
  id: 'grist-official-invoicing',
  label: "Grist's Invoicing template",
  invoice: {
    tableHint: 'Prepare_Invoices',
    signature: ['Number', 'Client', 'Items', 'Issued', 'Due'],
    roles: {
      number: 'Number', client: 'Client', issued: 'Issued', due: 'Due', note: 'Note',
      // `Total` is deliberately NOT mapped. In the official template it is a Text column and it is
      // empty on every row — the only real total lives in an auto-summary table. Mapping it would
      // print a blank where the amount goes on documents that otherwise look complete, which is a
      // worse failure than having no column at all: it looks like our bug, and it is silent.
      // Totals are computed from the line items instead. See `unreliable` below.
    },
    unreliable: { total: 'Total' },
    // Mapped and usable, but computed by a formula we want to replace. `Number` is `$id + 51371`,
    // so deleting one invoice renumbers every invoice after it — fine for a demo, not for a
    // document somebody has to defend to an auditor. Recorded here so the upgrade can offer a
    // stored number even though the role is already filled; see upgradeChecklist().
    derived: { number: 'Number' },
  },
  line: {
    tableHint: 'Items',
    signature: ['Description', 'Price', 'Quantity', 'Invoice'],
    roles: { invoiceLink: 'Invoice', description: 'Description', quantity: 'Quantity', unitPrice: 'Price', lineTotal: 'Total' },
  },
  client: {
    tableHint: 'Businesses',
    signature: ['Name', 'Street1', 'City'],
    roles: { name: 'Name', street1: 'Street1', street2: 'Street2', city: 'City', state: 'State', postcode: 'Zip' },
  },
};

/**
 * What "Upgrade this document" adds, and why each one is worth adding.
 *
 * Presented to the user as a checklist before anything is written, because these are columns in
 * THEIR document. Nothing here replaces or renames an existing column — every entry is additive,
 * and one already present is simply skipped.
 */
export const UPGRADE_PLAN = {
  invoice: [
    { id: 'Status', type: 'Choice', role: 'status',
      options: ['Draft', 'Sent', 'Part paid', 'Paid', 'Overdue', 'Cancelled'],
      why: 'Nothing can be chased, aged or automated without it. This is the column the whole product turns on.' },
    { id: 'Kind', type: 'Choice', role: 'kind', options: KIND_WORDS,
      why: 'Which kind of document each row is — invoice, quote, credit note, receipt — so one table holds them all and each opens as itself. Without it every row shows as whatever the bar says, and a saved credit note reopens as an invoice.' },
    { id: 'PaidDate', type: 'Date', role: 'paidDate',
      why: 'When it was settled — the other half of knowing what is outstanding.' },
    { id: 'AmountPaid', type: 'Numeric', role: 'amountPaid',
      why: 'Deposits and instalments, so a part-paid invoice can show a real balance.' },
    { id: 'Currency', type: 'Text', role: 'currency',
      why: 'Grist’s own invoice widget hardcodes US dollars. This is how an invoice stops being American.' },
    { id: 'Terms', type: 'Text', role: 'terms',
      why: 'Due-on-receipt, net 14, net 30 — instead of a due date fixed at one month by a formula.' },
    { id: 'Reference', type: 'Text', role: 'reference',
      why: 'The client’s own PO number. Accounts payable match on this, and an invoice without it can sit unpaid while nobody is doing anything wrong.' },
    { id: 'InvoiceNumber', type: 'Text', role: 'number', replacesFormula: true,
      why: 'A number that is stored rather than derived from the row id, so deleting one invoice stops renumbering every invoice after it.' },
    { id: 'Document', type: 'Attachments', role: 'attachment',
      why: 'Where the generated PDF is filed, so the sent document is kept with the record of sending it.' },
    { id: 'SentAt', type: 'Date', role: 'sentAt',
      why: 'When it went out. An invoice that does not remember being sent is how a client gets chased for something they were never asked to pay.' },
    { id: 'SentTo', type: 'Text', role: 'sentTo',
      why: 'The address it went to — which is not always the address on the client record today.' },
    { id: 'RelatedTo', type: 'Text', role: 'relatedTo',
      why: 'Which document this one corrects or follows: the invoice a credit note reverses, the quote an invoice came from.' },
  ],
  product: [
    { id: 'Image', type: 'Attachments', role: 'image',
      why: 'A picture on each product puts a thumbnail beside every invoice line that bills it \u2014 photograph the catalogue once and every document is illustrated.' },
  ],
  client: [
    { id: 'Email', type: 'Text', role: 'email',
      why: 'The official template has no email column anywhere, which is why it can never send anything.' },
    { id: 'Phone', type: 'Text', role: 'phone', why: 'For the footer of the document.' },
    { id: 'TaxNumber', type: 'Text', role: 'taxNumber',
      why: 'VAT, GST or TRN. Required on the face of the document in most of the world.' },
    { id: 'Country', type: 'Text', role: 'country',
      why: 'Decides which tax rates apply — and, in India, whether tax splits into CGST plus SGST or stays as IGST.' },
    { id: 'Language', type: 'Text', role: 'language',
      why: 'The language their documents are written in — de, fr, es, it, nl, pl, pt — so a French client gets a Facture without anyone choosing per invoice.' },
  ],
  line: [
    { id: 'TaxClass', type: 'Text', role: 'taxClass',
      why: 'Standard, reduced or zero rate per line, instead of one tax figure typed by hand.' },
  ],
};

// ---------------------------------------------------------------------------------------------
// Heuristics
// ---------------------------------------------------------------------------------------------

// Patterns per role, most specific first. The first entries of several roles are the exact names
// Grist's own invoice widget looks for — matching those first means a document that was built for
// that widget maps perfectly here without anybody thinking about it.
const INVOICE_PATTERNS = {
  number:     [/^invoice_?num(ber)?$/i, /^number$/i, /^inv_?no$/i, /number/i, /^ref(erence)?$/i],
  client:     [/^client$/i, /^customer$/i, /^bill_?to$/i, /client/i, /customer/i, /account/i, /company/i, /business/i, /donor/i],
  issued:     [/^issued$/i, /^issue_?date$/i, /^invoice_?date$/i, /^date$/i, /created/i],
  due:        [/^due$/i, /^due_?date$/i, /due/i],
  status:     [/^status$/i, /^state$/i, /^paid$/i, /status/i],
  paidDate:   [/^paid_?date$/i, /^date_?paid$/i, /^settled$/i],
  amountPaid: [/^amount_?paid$/i, /^paid_?amount$/i, /^received$/i, /^deposit$/i],
  currency:   [/^currency$/i, /^ccy$/i],
  note:       [/^note$/i, /^notes$/i, /^memo$/i, /^comment$/i, /description/i],
  reference:  [/^reference$/i, /^po_?num(ber)?$/i, /^purchase_?order$/i, /^your_?ref/i],
  terms:      [/^terms$/i, /^payment_?terms$/i],
  subtotal:   [/^subtotal$/i, /^sub_?total$/i, /^net$/i],
  tax:        [/^taxes$/i, /^tax$/i, /^vat$/i, /^gst$/i],
  discount:   [/^deduction$/i, /^discount$/i, /^rebate$/i],
  shipping:   [/^shipping$/i, /^freight$/i, /^delivery$/i, /^postage$/i],
  total:      [/^total$/i, /^amount$/i, /^grand_?total$/i, /^value$/i],
  attachment: [/^document$/i, /^pdf$/i, /^invoice_?file$/i, /attachment/i],
  sentAt:     [/^sent_?at$/i, /^sent_?date$/i, /^date_?sent$/i, /^sent$/i],
  sentTo:     [/^sent_?to$/i, /^emailed_?to$/i, /^recipient$/i],
  language:   [/^lang(uage)?$/i, /^locale$/i, /^sprache$/i, /^langue$/i],
  relatedTo:  [/^related(_?to)?$/i, /^against$/i, /^original(_?invoice)?$/i, /^corrects$/i, /^credits$/i, /^ref_?doc(ument)?$/i],
  kind:       [/^kind$/i, /^(doc(ument)?_?)?type$/i, /^doc(ument)?_?kind$/i, /^belegart$/i],
};

const LINE_PATTERNS = {
  invoiceLink:  [/^invoice$/i, /^invoice_?id$/i, /^order$/i, /^order_?id$/i, /invoice/i, /order/i],
  description:  [/^description$/i, /^item$/i, /^details$/i, /^service$/i, /^product$/i, /desc/i],
  quantity:     [/^quantity$/i, /^qty$/i, /^units?$/i, /^hours$/i],
  unitPrice:    [/^price$/i, /^unit_?price$/i, /^rate$/i, /^cost$/i],
  image:        [/^(image|photo|picture|thumb(?:nail)?|img)s?$/i],
  lineTotal:    [/^total$/i, /^amount$/i, /^line_?total$/i, /^subtotal$/i],
  product:      [/^product$/i, /^sku$/i, /^item_?ref$/i, /^catalog/i],
  taxClass:     [/^tax_?class$/i, /^tax_?rate$/i, /^vat_?rate$/i, /^gst_?rate$/i],
  lineDiscount: [/^discount$/i, /^line_?discount$/i],
  // An HSN/SAC code identifies WHAT is being sold, for Indian GST. It is not a tax class and must
  // not be matched as one — a column of commodity codes read as tax classes would silently stop
  // every line matching a rate row.
  hsn:          [/^hsn$/i, /^sac$/i, /^hsn_?code$/i, /^hsn_?sac$/i],
  unit:         [/^unit$/i, /^uom$/i, /^unit_?of_?measure$/i],
};

const CLIENT_PATTERNS = {
  name:      [/^name$/i, /^client_?name$/i, /^company$/i, /^business$/i, /name/i],
  email:     [/^email$/i, /^e_?mail$/i, /email/i],
  phone:     [/^phone$/i, /^tel(ephone)?$/i, /^mobile$/i, /phone/i],
  taxNumber: [/^tax_?(id|number)$/i, /^vat_?(no|number)$/i, /^gstin?$/i, /^trn$/i, /^abn$/i],
  street1:   [/^street1$/i, /^address1$/i, /^address_?line_?1$/i, /^street$/i, /^address$/i],
  street2:   [/^street2$/i, /^address2$/i, /^address_?line_?2$/i],
  city:      [/^city$/i, /^town$/i],
  state:     [/^state$/i, /^province$/i, /^region$/i, /^county$/i],
  postcode:  [/^zip$/i, /^postcode$/i, /^post_?code$/i, /^zip_?code$/i, /^pin_?code$/i],
  country:   [/^country$/i, /^nation$/i],
  language:  [/^lang(uage)?$/i, /^locale$/i, /^sprache$/i, /^langue$/i],
};

const PRODUCT_PATTERNS = {
  name:      [/^name$/i, /^product$/i, /^item$/i, /^service$/i, /^title$/i],
  sku:       [/^sku$/i, /^code$/i, /^ref$/i, /^part_?no$/i],
  unitPrice: [/^price$/i, /^unit_?price$/i, /^rate$/i, /^cost$/i, /^amount$/i],
  image: [/^(image|photo|picture|thumb(?:nail)?|img)s?$/i],
  taxClass:  [/^tax_?class$/i, /^vat_?class$/i],
  hsn:       [/^hsn$/i, /^sac$/i, /^hsn_?code$/i],
  unit:      [/^unit$/i, /^uom$/i],
  stock:     [/^stock$/i, /^quantity$/i, /^on_?hand$/i, /^qty$/i],
};

const isMoney = (t) => /^(Numeric|Int|Currency)/i.test(String(t || ''));
const isDate = (t) => /^Date/i.test(String(t || ''));
const isRef = (t) => /^Ref(?::|$)/i.test(String(t || ''));

// Roles where the column TYPE is strong evidence. Used only to break ties between equally-ranked
// name matches — a name match always beats a type match, because a column called "Issued" is the
// issue date even if somebody typed it as Text.
const TYPE_HINT = {
  issued: isDate, due: isDate, paidDate: isDate,
  subtotal: isMoney, tax: isMoney, discount: isMoney, shipping: isMoney,
  total: isMoney, amountPaid: isMoney,
  quantity: isMoney, unitPrice: isMoney, lineTotal: isMoney, lineDiscount: isMoney,
  client: isRef, invoiceLink: isRef, product: isRef,
};

/**
 * Best column for each role, by pattern rank then type hint.
 *
 * A column is used at most once. Roles are resolved in the order their patterns are declared, so
 * the specific ones (`number`, `client`) claim their column before the vague ones (`note`, which
 * would otherwise happily swallow a column called "Description").
 */
export function mapRoles(columns, patterns) {
  const out = {};
  const taken = new Set();
  const cols = (columns || []).filter((c) => c && c.id);

  for (const [role, pats] of Object.entries(patterns)) {
    let best = null, bestRank = Infinity;
    for (const col of cols) {
      if (taken.has(col.id)) continue;
      // Match on the column id and on its human label — Grist lets the two differ, and a document
      // whose columns are labelled "Invoice #" carries the id "Invoice_" or similar.
      const rank = pats.findIndex((p) => p.test(col.id) || p.test(String(col.label || '')));
      if (rank === -1 || rank > bestRank) continue;
      if (rank < bestRank) { best = col; bestRank = rank; continue; }
      // Same rank: prefer the one whose type fits the role.
      const hint = TYPE_HINT[role];
      if (hint && !hint(best.type) && hint(col.type)) best = col;
    }
    if (best) { out[role] = best.id; taken.add(best.id); }
  }
  return out;
}

/** Does this table carry every column in a signature? */
function hasSignature(table, signature) {
  const ids = new Set((table.columns || []).map((c) => c.id));
  return signature.every((s) => ids.has(s));
}

/**
 * Work out how this document holds invoices.
 *
 * `tables` is the provider's view of the document: `[{ id, label, columns: [{ id, label, type }] }]`.
 * Returns the tables, the role maps, where the mapping came from and how much of it is guesswork —
 * because a mapping the widget is confident about and one it scraped together should not be
 * presented to the user in the same tone of voice.
 */
export function detectSchema(tables, opts = {}) {
  const list = (tables || []).filter((t) => t && t.id);
  if (!list.length) return { source: 'none', confidence: 0, invoice: null, line: null, client: null, warnings: [] };

  // 1. Recognition — is this Grist's own template?  2. Heuristics.  3. The person's own choices,
  // which beat both: detection is a guess, however good, and a guess never outranks an answer.
  // First the tables they chose, then the columns they chose within them.
  const auto = detectOfficial(list) || detectHeuristic(list);
  const forced = applyForce(auto, list, opts.force);
  return applyColumnChoices(forced, list, opts.force && opts.force.columns);
}

/** The roles a part can map, in the order a person is asked about them. */
export const ROLES_BY_PART = {
  invoice: INVOICE_ROLES,
  line: LINE_ROLES,
  client: CLIENT_ROLES,
  product: ['name', 'sku', 'unitPrice', 'unit', 'taxClass', 'hsn', 'stock', 'image'],
};

/**
 * Pin roles to columns the person chose.
 *
 * `choices` is `{ invoice: { number: 'Nr', client: '-' }, … }`: a column id says "this one", a
 * dash says "none — leave the role unmapped", and anything absent keeps the automatic guess. A
 * column can serve one role only, so choosing it for one takes it away from whatever guessed it.
 * A choice naming a column the table no longer has is ignored rather than honoured blindly.
 */
export function applyRoleChoices(roles, columns, choices) {
  if (!choices || !Object.keys(choices).length) return roles;
  const ids = new Set((columns || []).map((c) => c.id));
  const out = { ...roles };
  for (const [role, colId] of Object.entries(choices)) {
    if (colId === '-') { delete out[role]; continue; }
    if (!colId || !ids.has(colId)) continue;
    for (const [r, c] of Object.entries(out)) if (c === colId && r !== role) delete out[r];
    out[role] = colId;
  }
  return out;
}

function applyColumnChoices(schema, list, columns) {
  if (!columns) return schema;
  const byId = new Map(list.map((t) => [t.id, t]));
  const out = { ...schema };
  let touched = false;
  for (const part of ['invoice', 'line', 'client']) {
    const choices = columns[part];
    if (!out[part] || !choices || !Object.keys(choices).length) continue;
    const table = byId.get(out[part].table);
    if (!table) continue;
    const roles = applyRoleChoices(out[part].roles, table.columns, choices);
    if (JSON.stringify(roles) !== JSON.stringify(out[part].roles)) {
      out[part] = { ...out[part], roles, derived: {} };
      touched = true;
    }
  }
  if (!touched) return schema;
  out.warnings = warningsFor(out);
  return out;
}

/**
 * Pin parts of the schema to tables the person chose.
 *
 * Roles within a chosen table are still matched by name — choosing says WHERE the invoices are,
 * not which of its columns is the due date. Any pin rewrites the warnings, because warnings about
 * a table that is no longer in the mapping would be warnings about nothing.
 */
function applyForce(schema, list, force) {
  if (!force) return schema;
  const byId = new Map(list.map((t) => [t.id, t]));
  const parts = [['invoice', INVOICE_PATTERNS], ['line', LINE_PATTERNS], ['client', CLIENT_PATTERNS]];

  let touched = false;
  const out = { ...schema };
  for (const [part, patterns] of parts) {
    const id = force[part];
    if (!id || !byId.has(id) || out[part]?.table === id) continue;
    out[part] = { table: id, roles: mapRoles(byId.get(id).columns || [], patterns) };
    touched = true;
  }
  if (!touched) return schema;

  out.source = 'chosen';
  out.sourceLabel = 'Tables chosen by you';
  out.confidence = 1;
  out.warnings = warningsFor(out);
  return out;
}

/** The standard warnings, computed from a finished schema so every path reports the same way. */
function warningsFor(schema) {
  const warnings = [];
  if (schema.invoice && !schema.line) {
    warnings.push({ code: 'flat-invoice', text: 'No line-item table found, so each invoice bills a single amount. Keep line items in their own table and they will be itemised.' });
  }
  if (schema.client && !schema.client.roles.email) {
    warnings.push({ code: 'no-client-email', text: 'No email column on the client table, so invoices cannot be sent until one is added.' });
  }
  if (schema.invoice) {
    const missing = REQUIRED_INVOICE_ROLES.filter((r) => !schema.invoice.roles[r]);
    if (missing.length) warnings.push({ code: 'missing-required', text: `Could not work out which column holds the ${missing.join(', ')}.` });
  }
  return warnings;
}

/**
 * Recognition gives the reliable backbone; name matching fills in whatever else has been added.
 *
 * A recognised template is not frozen. People add columns to it — and the whole upgrade path
 * depends on them doing exactly that. Mapping only the columns the template shipped with would mean
 * a Status column we had just added ourselves was never actually used, and the upgrade would go on
 * offering to add it forever. So the template's own mapping wins where it applies, and everything
 * left over is matched by name.
 *
 * Two refinements make that safe:
 *   • columns listed as `unreliable` are withheld from the name matcher entirely, or it would
 *     cheerfully re-map the empty Text `Total` that recognition exists to avoid;
 *   • a role recognition marked as `derived` gives way when name matching finds a DIFFERENT column
 *     for it, which is how the stored `InvoiceNumber` takes over from the `$id + 51371` formula the
 *     moment the upgrade creates it — and how `derived` stops being true at the same instant.
 */
function augmentRoles(table, base, derived, patterns, unreliable) {
  const withhold = new Set(Object.values(unreliable || {}));
  const columns = (table.columns || []).filter((c) => !withhold.has(c.id));
  const found = mapRoles(columns, patterns);

  const roles = { ...found, ...base };
  const stillDerived = { ...(derived || {}) };
  for (const role of Object.keys(stillDerived)) {
    if (found[role] && found[role] !== base[role]) {
      roles[role] = found[role];
      delete stillDerived[role];
    }
  }
  return { roles, derived: stillDerived };
}

function detectOfficial(list) {
  const T = OFFICIAL_TEMPLATE;
  const invoiceTable = list.find((t) => hasSignature(t, T.invoice.signature));
  const lineTable = list.find((t) => hasSignature(t, T.line.signature));
  if (!invoiceTable || !lineTable) return null;
  const clientTable = list.find((t) => hasSignature(t, T.client.signature)) || null;

  const invoice = augmentRoles(invoiceTable, T.invoice.roles, T.invoice.derived, INVOICE_PATTERNS, T.invoice.unreliable);
  const line = augmentRoles(lineTable, T.line.roles, null, LINE_PATTERNS, null);
  const client = clientTable ? augmentRoles(clientTable, T.client.roles, null, CLIENT_PATTERNS, null) : null;

  const warnings = [];
  // Explain the trap rather than silently working around it — someone looking at their own document
  // and at our output needs to know why the two disagree about where the total comes from.
  if ((invoiceTable.columns || []).some((c) => c.id === T.invoice.unreliable.total)) {
    warnings.push({
      code: 'official-total-unused',
      text: 'The Total column on this table is text and is empty in the template, so totals are added up from the line items instead.',
    });
  }
  if (client && !client.roles.email) {
    warnings.push({
      code: 'no-client-email',
      text: 'Clients have no email column, so invoices cannot be sent until one is added. Upgrade this document adds it.',
    });
  }

  return {
    source: T.id,
    sourceLabel: T.label,
    confidence: 1,
    invoice: { table: invoiceTable.id, roles: invoice.roles, derived: invoice.derived },
    line: { table: lineTable.id, roles: line.roles },
    client: client ? { table: clientTable.id, roles: client.roles } : null,
    warnings,
  };
}

function detectHeuristic(list) {
  // The invoice table is the one whose columns look most like an invoice header. Scoring on matched
  // roles rather than picking the first table means a document with Invoices, Clients and Products
  // does not hand the job to whichever happens to sort first.
  const scored = list.map((t) => {
    const roles = mapRoles(t.columns, INVOICE_PATTERNS);
    return { table: t, roles, score: Object.keys(roles).length };
  }).sort((a, b) => b.score - a.score);

  const top = scored[0];
  if (!top || top.score === 0) {
    return { source: 'none', confidence: 0, invoice: null, line: null, client: null, warnings: [] };
  }

  // Line items live in a different table that points back at this one. Requiring a plausible link
  // column keeps a Products catalogue from being mistaken for the lines of an invoice.
  const lineCandidates = list
    .filter((t) => t.id !== top.table.id)
    .map((t) => ({ table: t, roles: mapRoles(t.columns, LINE_PATTERNS) }))
    .filter((c) => c.roles.invoiceLink && (c.roles.description || c.roles.unitPrice))
    .sort((a, b) => Object.keys(b.roles).length - Object.keys(a.roles).length);

  const clientCandidates = list
    .filter((t) => t.id !== top.table.id)
    .map((t) => ({ table: t, roles: mapRoles(t.columns, CLIENT_PATTERNS) }))
    .filter((c) => c.roles.name && /client|customer|account|business|compan|contact|donor|people/i.test(c.table.id))
    .sort((a, b) => Object.keys(b.roles).length - Object.keys(a.roles).length);

  const warnings = [];
  if (!lineCandidates.length) {
    warnings.push({ code: 'flat-invoice', text: 'No line-item table found, so each invoice bills a single amount. Keep line items in their own table and they will be itemised.' });
  }
  const client = clientCandidates[0] || null;
  if (client && !client.roles.email) {
    warnings.push({ code: 'no-client-email', text: 'No email column on the client table, so invoices cannot be sent until one is added.' });
  }

  const missing = REQUIRED_INVOICE_ROLES.filter((r) => !top.roles[r]);
  if (missing.length) warnings.push({ code: 'missing-required', text: `Could not work out which column holds the ${missing.join(', ')}.` });

  return {
    source: 'heuristic',
    sourceLabel: 'Matched by column names',
    // A rough, honest confidence: how much of the header we recognised. Used to decide whether to
    // show the mapping for confirmation or just get on with it.
    confidence: Math.min(1, top.score / 8),
    invoice: { table: top.table.id, roles: top.roles },
    line: lineCandidates[0] ? { table: lineCandidates[0].table.id, roles: lineCandidates[0].roles } : null,
    client: client ? { table: client.table.id, roles: client.roles } : null,
    warnings,
  };
}

/**
 * What the document is missing for the full feature set, as a per-table checklist.
 *
 * Nothing here is destructive: an entry is dropped the moment a column already fills that role, so
 * running it twice adds nothing the second time. That idempotence is what makes it safe to offer as
 * a button rather than a wizard with warnings.
 *
 * The one exception is a role that IS filled but by a formula we have a specific reason to replace
 * — Grist's `Number = $id + 51371`. Skipping those on the "already mapped" rule would withhold the
 * stored-number fix from the one document that most needs it, so an item marked `replacesFormula`
 * is offered whenever the schema recorded that role as derived. It still disappears once the real
 * column exists, because then the role maps to that column instead and nothing is derived.
 */
/**
 * A product catalogue, if this document has one.
 *
 * Kept apart from detectSchema because a catalogue is optional in a way the invoice tables are
 * not — plenty of service businesses have none, and the composer simply does without the picker.
 * Both a name AND a price are required before a table counts: a Clients table has a name too, and
 * offering a list of clients as products would be worse than offering nothing.
 */
export function detectProducts(tables, schema = null, opts = {}) {
  const found = detectProductsAuto(tables, schema, opts);
  if (!found || !opts.columns) return found;
  const t = (tables || []).find((x) => x && x.id === found.table);
  const roles = applyRoleChoices(found.roles, t ? t.columns : [], opts.columns);
  return roles.name ? { ...found, roles } : found;
}

function detectProductsAuto(tables, schema, opts) {
  // A chosen catalogue skips the scoring entirely — but it still has to look like one. A table
  // with no name column cannot fill a picker, so pointing at it yields nothing rather than junk.
  if (opts.force) {
    const t = (tables || []).find((x) => x && x.id === opts.force);
    if (t) {
      // The person's column choices apply before the name test: a catalogue whose name column is
      // called "Bezeichnung" is a catalogue once they have said so.
      const roles = applyRoleChoices(mapRoles(t.columns, PRODUCT_PATTERNS), t.columns, opts.columns || {});
      return roles.name ? { table: t.id, roles } : null;
    }
  }
  const used = new Set([schema?.invoice?.table, schema?.line?.table, schema?.client?.table].filter(Boolean));
  const candidates = (tables || [])
    .filter((t) => t && t.id && !used.has(t.id))
    .map((t) => ({ table: t, roles: mapRoles(t.columns, PRODUCT_PATTERNS) }))
    .filter((c) => c.roles.name && c.roles.unitPrice)
    // A table actually named like a catalogue beats one that merely has a name and a price.
    .sort((a, b) => score(b.table.id) - score(a.table.id));

  function score(id) { return /product|catalog|item|service|price|sku/i.test(id) ? 1 : 0; }
  const best = candidates[0];
  return best ? { table: best.table.id, roles: best.roles } : null;
}

/** The catalogue as options the composer's picker can show. */
export function productOptions(products, provider) {
  if (!products) return [];
  const R = products.roles;
  return (provider.records(products.table) || []).map((r) => {
    const name = String(r[R.name] ?? '').trim();
    const sku = R.sku ? String(r[R.sku] ?? '').trim() : '';
    const price = R.unitPrice ? Number(r[R.unitPrice]) : null;
    return {
      label: [sku, name].filter(Boolean).join(' · ') || `#${r.id}`,
      name,
      description: name,
      unitPrice: isFinite(price) ? price : null,
      taxClass: R.taxClass ? String(r[R.taxClass] ?? '').trim() : '',
      hsn: R.hsn ? String(r[R.hsn] ?? '').trim() : '',
      // Raw, not stringified: an Attachments cell is a list-tuple, and turning it into text here
      // would destroy the id the renderer needs to resolve it.
      image: R.image ? (r[R.image] ?? null) : null,
    };
  }).filter((p) => p.name);
}

/** The statuses every document understands before anyone adds their own. */
export const STATUS_DEFAULTS = ['Draft', 'Sent', 'Part paid', 'Paid', 'Overdue', 'Cancelled'];

/** The choices inside a column's widgetOptions, whether Grist handed them over parsed or as JSON. */
export function choicesOf(widgetOptions) {
  let wo = widgetOptions;
  if (typeof wo === 'string') { try { wo = JSON.parse(wo); } catch { return []; } }
  return Array.isArray(wo?.choices) ? wo.choices.map((c) => String(c)).filter(Boolean) : [];
}

/**
 * The statuses this document actually uses, in the order a person would want them offered.
 *
 * Three sources, most specific first: the Status column's own choice list (the vocabulary the
 * document's owner set up in Grist), then every value present in the rows (a status in use is a
 * real status whether or not anyone registered it), then the built-in defaults. Deduplicated
 * case-insensitively with the first-seen casing kept, because "paid" and "Paid" are one status
 * and the owner's spelling of it wins.
 */
export function statusOptions(schema, provider) {
  const out = [];
  const seen = new Set();
  const add = (v) => {
    const t = String(v || '').trim();
    if (!t || seen.has(t.toLowerCase())) return;
    seen.add(t.toLowerCase());
    out.push(t);
  };

  const statusCol = schema?.invoice?.roles?.status;
  if (statusCol && provider) {
    const col = (provider.columns(schema.invoice.table) || []).find((c) => c.id === statusCol);
    for (const c of choicesOf(col?.widgetOptions)) add(c);
    for (const r of provider.records(schema.invoice.table) || []) add(r[statusCol]);
  }
  for (const s of STATUS_DEFAULTS) add(s);
  return out;
}

/**
 * A column's widgetOptions with one more choice in it.
 *
 * Returns `{ changed, widgetOptions }` where widgetOptions is the JSON string Grist stores.
 * Everything else in the options — choiceOptions with their colours, alignment, whatever a later
 * Grist adds — is preserved, because this is an addition, never a rewrite. A value already present
 * (case-insensitively) changes nothing.
 */
export function withChoice(widgetOptions, value) {
  const v = String(value || '').trim();
  if (!v) return { changed: false, widgetOptions: null };
  let wo = widgetOptions;
  if (typeof wo === 'string') { try { wo = JSON.parse(wo); } catch { wo = null; } }
  if (!wo || typeof wo !== 'object' || Array.isArray(wo)) wo = {};
  const choices = Array.isArray(wo.choices) ? wo.choices.map(String) : [];
  if (choices.some((c) => c.toLowerCase() === v.toLowerCase())) return { changed: false, widgetOptions: null };
  return { changed: true, widgetOptions: JSON.stringify({ ...wo, choices: [...choices, v] }) };
}

/**
 * The columns this widget has a stake in that the document already has: `[{table, id}]`.
 *
 * The same roles the upgrade adds, resolved to the column actually serving each — so a catalogue
 * whose picture column is called Photo reports Photo. This is the list views.js checks for
 * columns present in the table but missing from its page, which is the state every column this
 * widget added before 1.20.1 was left in.
 */
export function widgetColumns(schema, products = null) {
  const out = [];
  if (!schema || !schema.invoice) return out;
  for (const [part, items] of Object.entries(UPGRADE_PLAN)) {
    const source = part === 'product' ? products : schema[part];
    if (!source?.table) continue;
    const mapped = source.roles || {};
    for (const item of items) {
      if (mapped[item.role]) out.push({ table: source.table, id: mapped[item.role] });
    }
  }
  return out;
}

export function upgradeChecklist(schema, products = null) {
  const out = { invoice: [], client: [], line: [], product: [] };
  if (!schema || !schema.invoice) return out;

  for (const [part, items] of Object.entries(UPGRADE_PLAN)) {
    // A part the document does not have at all (no client table, say) cannot be upgraded in place;
    // creating it is a different action with different consequences, so it is left out here. The
    // catalogue lives outside the schema — detected separately — so it is looked up separately.
    const source = part === 'product' ? products : schema[part];
    if (!source) continue;
    const mapped = source.roles || {};
    const derived = source.derived || {};
    for (const item of items) {
      if (item.replacesFormula && derived[item.role]) { out[part].push(item); continue; }
      if (mapped[item.role]) continue;
      out[part].push(item);
    }
  }
  return out;
}
