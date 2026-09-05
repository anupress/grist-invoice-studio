// Turning a row in somebody's document into an invoice the renderer can draw.
//
// Everything above this file speaks in ROLES ("the client", "the due date"); everything below it
// speaks in columns. This is where the two meet, and it is the only place that should know a role
// map exists. Renderers, exporters and email templates all take the object this produces, so a
// document that maps unusually costs us one function rather than one branch in every feature.
//
// The rules are the ones the existing Advanced Charts invoice block learned the hard way, kept
// because each of them was a real document rendering wrongly:
//
//   • A client column holds either a row id (a Grist reference) or a name (plain text). Both are
//     followed, because a document should not have to be restructured to produce an invoice.
//   • Line items link back either by row id or by matching the invoice NUMBER as text.
//   • A stored line total is trusted over quantity × price, because it may be a formula carrying a
//     rounding rule or a discount that multiplication would not reproduce.
//   • No line-item table, or none matching, still yields a document: one line standing for the
//     invoice's own amount. An invoice with a single figure on it is a normal thing to send.

import { clone } from '../core/util.js';
import { normaliseDraft, computeDraftTotals } from './draft.js';
import { kindFromCell } from '../doc/kinds.js';

const num = (v) => {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? '').replace(/[^0-9.eE+-]/g, ''));
  return isFinite(n) ? n : 0;
};

const str = (v) => (v == null ? '' : String(v)).trim();

/** Read a role off a row, or undefined when the role is not mapped in this document. */
const byRole = (row, roles, role) => (roles && roles[role] ? row[roles[role]] : undefined);

/** The invoices available to choose between, newest-looking first. */
export function listInvoices(schema, provider) {
  if (!schema?.invoice) return [];
  const roles = schema.invoice.roles;
  const rows = provider.records(schema.invoice.table) || [];
  return rows.map((r) => {
    // The total is only carried when it is genuinely a number. Grist's own template stores Total
    // as text and leaves it empty, and a list that showed "" or NaN would be worse than one that
    // shows nothing.
    const rawTotal = Number(byRole(r, roles, 'total'));
    return {
      id: r.id,
      number: str(byRole(r, roles, 'number')) || `#${r.id}`,
      client: clientNameFor(r, schema, provider),
      issued: str(byRole(r, roles, 'issued')),
      status: str(byRole(r, roles, 'status')),
      // Null when the document has no Kind column or the cell is empty: the list then says nothing
      // about the kind, as it always did, rather than guessing.
      kind: kindFromCell(byRole(r, roles, 'kind')),
      currency: str(byRole(r, roles, 'currency')).toUpperCase(),
      total: isFinite(rawTotal) && byRole(r, roles, 'total') !== '' && byRole(r, roles, 'total') != null ? rawTotal : null,
    };
  });
}

/** Just the client's display name — used by the picker, which does not need the full address. */
function clientNameFor(row, schema, provider) {
  const raw = byRole(row, schema.invoice.roles, 'client');
  if (raw == null || raw === '') return '';
  if (!schema.client) return str(raw);
  const rows = provider.records(schema.client.table) || [];
  const nameCol = schema.client.roles.name;
  const match = typeof raw === 'number'
    ? rows.find((r) => r.id === raw)
    : rows.find((r) => str(r[nameCol]).toLowerCase() === str(raw).toLowerCase());
  return match ? str(match[nameCol]) || str(raw) : str(raw);
}

/**
 * One row of the client table as a party.
 *
 * Returns the address in STRUCTURED fields — street1, city, postcode, country — rather than
 * pre-joined lines. The renderer assembles the lines itself, and the tax engine needs the country
 * and state separately to match a rate row at all, so joining them here would throw away exactly
 * the information tax depends on.
 */
export function clientParty(row, roles) {
  if (!row) return null;
  return {
    name: str(row[roles.name]),
    street1: str(row[roles.street1]),
    street2: str(row[roles.street2]),
    city: str(row[roles.city]),
    state: str(row[roles.state]),
    postcode: str(row[roles.postcode]),
    country: str(row[roles.country]),
    email: str(row[roles.email]),
    phone: str(row[roles.phone]),
    taxNumber: str(row[roles.taxNumber]),
    language: str(row[roles.language]),
    found: true,
  };
}

/** The client as a party on the document, however the invoice happens to refer to them. */
function resolveClient(row, schema, provider) {
  const raw = byRole(row, schema.invoice.roles, 'client');
  const empty = { name: str(raw), email: '', phone: '', taxNumber: '', found: false };
  if (raw == null || raw === '' || !schema.client) return empty;

  const rows = provider.records(schema.client.table) || [];
  const R = schema.client.roles;
  // A reference arrives as a row id; a text column arrives as the name itself.
  const match = typeof raw === 'number'
    ? rows.find((r) => r.id === raw)
    : rows.find((r) => str(r[R.name]).toLowerCase() === str(raw).toLowerCase());
  if (!match) return empty;

  const party = clientParty(match, R);
  // The invoice's own text wins when the client record has no name — otherwise a document loses
  // the only name it had to a blank cell.
  if (!party.name) party.name = str(raw);
  return party;
}

/** Every client in the document, for the composer's picker. */
export function listClients(schema, provider) {
  if (!schema?.client) return [];
  const R = schema.client.roles;
  return (provider.records(schema.client.table) || [])
    .map((r) => ({ id: r.id, name: str(r[R.name]) || `#${r.id}`, party: clientParty(r, R) }))
    .filter((c) => c.name);
}

/** The billable lines: itemised where a line table exists and has rows for this invoice. */
function resolveLines(row, schema, provider, opts) {
  if (schema.line) {
    const R = schema.line.roles;
    const all = provider.records(schema.line.table) || [];
    const myNumber = str(byRole(row, schema.invoice.roles, 'number'));
    const mine = all.filter((r) => {
      const link = R.invoiceLink ? r[R.invoiceLink] : null;
      if (link == null || link === '') return false;
      // A reference gives the row id; a text column usually carries the invoice number.
      return link === row.id || (myNumber !== '' && str(link) === myNumber);
    });

    if (mine.length) {
      return mine.map((r) => {
        const quantity = R.quantity ? num(r[R.quantity]) : 1;
        const unitPrice = R.unitPrice ? num(r[R.unitPrice]) : 0;
        const stored = R.lineTotal ? r[R.lineTotal] : null;
        // Trust a stored total when the column actually holds one — it may be a formula with a
        // rounding rule or a discount baked in that quantity × price would not reproduce.
        const amount = stored != null && stored !== '' ? num(stored) : quantity * unitPrice;
        return {
          description: str(r[R.description]) || 'Item',
          quantity, unitPrice, amount, itemised: true,
          taxClass: R.taxClass ? str(r[R.taxClass]) : '',
          hsn: R.hsn ? str(r[R.hsn]) : '',
          unit: R.unit ? str(r[R.unit]) : '',
          discountAmount: R.lineDiscount ? num(r[R.lineDiscount]) : 0,
          image: R.image ? (r[R.image] ?? null) : null,
        };
      });
    }
  }

  // Flat fallback: the invoice's own amount as a single line.
  const amount = num(byRole(row, schema.invoice.roles, 'total'));
  return [{
    description: opts?.singleLineLabel || 'Services rendered',
    quantity: 1, unitPrice: amount, amount, itemised: false,
  }];
}


/**
 * One row, resolved into everything a document needs.
 *
 * `settings.sender` is the business doing the invoicing. It is settings rather than table data on
 * purpose — it is identical on every invoice, it is branding, and Grist's own template putting it
 * in a formula column is the clearest possible argument for not doing that.
 */
/**
 * A line with no image of its own borrows the catalogue's, matched by name.
 *
 * The line table rarely stores pictures — the catalogue is their natural home — and a business
 * that photographed its products should not have to photograph every invoice line again. Name
 * matching is the same linkage the composer's picker uses, so what fills a line is what
 * illustrates it.
 */
export function borrowCatalogueImages(lines, products, provider) {
  if (!products?.roles?.image || !provider) return lines;
  const R = products.roles;
  const rows = provider.records(products.table) || [];
  const byName = new Map();
  for (const r of rows) {
    const name = str(r[R.name]).toLowerCase();
    if (name && r[R.image] != null && r[R.image] !== '') byName.set(name, r[R.image]);
  }
  if (!byName.size) return lines;
  return lines.map((l) => (l.image == null || l.image === '')
    ? { ...l, image: byName.get(str(l.description).toLowerCase()) ?? null }
    : l);
}

export function resolveInvoice(row, schema, provider, settings = {}) {
  if (!row || !schema?.invoice) return null;
  const roles = schema.invoice.roles;
  const lines = resolveLines(row, schema, provider, settings);
  const client = resolveClient(row, schema, provider);

  const raw = byRole(row, roles, 'client');

  // Everything below goes through normaliseDraft so a row and a composed draft arrive at the
  // renderer in exactly the same shape — that is the whole point of ./draft.js.
  const draft = normaliseDraft({
    // The row's own kind first. A table holds invoices and credit notes and quotes side by side,
    // and each has to open as itself; the chooser's kind is only for rows that do not say.
    kind: kindFromCell(byRole(row, roles, 'kind')) || settings.kind || 'invoice',
    layout: settings.layout || 'classic',
    rowId: row.id,
    number: str(byRole(row, roles, 'number')) || `#${row.id}`,
    // `derived` is carried through so the document can be honest about a number that will move if
    // a row is deleted, rather than presenting it with the same authority as a stored one.
    numberIsDerived: !!schema.invoice.derived?.number,
    issued: str(byRole(row, roles, 'issued')),
    due: str(byRole(row, roles, 'due')),
    status: str(byRole(row, roles, 'status')),
    reference: str(byRole(row, roles, 'reference')),
    serviceDate: str(byRole(row, roles, 'serviceDate')),
    terms: str(byRole(row, roles, 'terms')),
    note: str(byRole(row, roles, 'note')),
    language: str(byRole(row, roles, 'language')),
    relatedTo: str(byRole(row, roles, 'relatedTo')),
    currency: str(byRole(row, roles, 'currency')) || settings.money?.currency || settings.currency || 'USD',
    client,
    sender: clone(settings.sender || {}),
    // How money is written down travels with the invoice, so the renderer never has to reach back
    // into settings and the composer can preview a draft with the same rules a saved row uses.
    //
    // Currency is applied AFTER the spread, deliberately. The format object describes separators and
    // symbol position; if it also happens to carry a currency — and a stored one did — spreading it
    // last would let a stale copy shadow the real answer, and changing the currency setting would
    // visibly do nothing to the symbol on the document.
    format: {
      ...(settings.money?.format || {}),
      currency: str(byRole(row, roles, 'currency')) || settings.money?.currency || settings.currency || 'USD',
    },
    lines,
    // Money the document carries in its own right, read off the row where columns exist for it.
    discountAmount: num(byRole(row, roles, 'discount')),
    shippingAmount: num(byRole(row, roles, 'shipping')),
    amountPaid: num(byRole(row, roles, 'amountPaid')),
    // The row id behind a reference, kept so saving can write the reference back rather than
    // degrading it to the client's name.
    clientRef: typeof raw === 'number' && raw > 0 ? raw : null,
  });

  draft.totals = computeDraftTotals(draft, settings);
  return draft;
}
