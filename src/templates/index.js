// Starting points, by trade.
//
// A template here is not a design — the four layouts already cover that. It is the set of decisions
// a particular kind of business would otherwise make one at a time and mostly get wrong: what the
// document is called, what wording it needs, how its numbers run, whether prices include tax, and
// what a typical line on it looks like.
//
// Each one is deliberately small. A template that fills in twenty fields is a template somebody has
// to undo; these set the handful that differ by trade and leave the rest alone.

const T = (id, label, sector, spec) => ({ id, label, sector, ...spec });

export const TEMPLATES = [
  T('freelancer', 'Freelancer or consultant', 'Services', {
    kind: 'invoice',
    document: { layout: 'minimal', paymentDetailsLabel: 'How to pay', closingText: 'Thank you — it was good to work with you.' },
    terms: 'Payment within 14 days, please.',
    lines: [{ description: 'Consultancy, day rate', quantity: 1, unitPrice: 550, unit: 'day' }],
  }),

  T('agency', 'Creative or marketing agency', 'Services', {
    kind: 'invoice',
    document: { layout: 'headline', referenceLabel: 'Your PO number' },
    terms: 'Net 30. Late payment is charged at 8% above base rate.',
    lines: [
      { description: 'Creative direction', quantity: 4, unitPrice: 750, unit: 'day' },
      { description: 'Artwork and production', quantity: 12, unitPrice: 320, unit: 'hour' },
    ],
  }),

  T('saas', 'Software or subscription', 'Services', {
    kind: 'invoice',
    document: { layout: 'slate', closingText: 'This subscription renews automatically. Cancel any time from your account.' },
    numbering: { prefixes: { invoice: 'SUB-{YYYY}{MM}-' } },
    terms: 'Charged monthly in advance.',
    lines: [{ description: 'Team plan — monthly, per seat', quantity: 12, unitPrice: 15 }],
  }),

  T('retail', 'Retail — a till receipt', 'Goods', {
    kind: 'receipt',
    // A shop advertises the price on the shelf, and that is the price the customer pays.
    money: { pricesIncludeTax: true },
    document: { layout: 'minimal', closingText: 'Thank you. Please keep this receipt — it is your proof of purchase.' },
    numbering: { prefixes: { receipt: 'R{YYYY}{MM}{DD}-' }, padding: 4, resetPeriod: 'never' },
    lines: [{ description: 'Item', quantity: 1, unitPrice: 12.99 }],
  }),

  T('restaurant', 'Restaurant or café', 'Goods', {
    kind: 'receipt',
    money: { pricesIncludeTax: true },
    document: { layout: 'minimal', closingText: 'Service is not included. Thank you for visiting.' },
    lines: [
      { description: 'Set lunch', quantity: 2, unitPrice: 18.5 },
      { description: 'Coffee', quantity: 2, unitPrice: 3.2 },
    ],
  }),

  T('ecommerce', 'Online shop — packing slip', 'Goods', {
    kind: 'packing_slip',
    document: { layout: 'classic' },
    numbering: { prefixes: { packing_slip: 'PS-{YYYY}-' } },
    note: 'Please check the contents against this slip. Anything missing or damaged, tell us within 14 days.',
    lines: [{ description: 'Product name (SKU)', quantity: 2, unitPrice: 0 }],
  }),

  T('construction', 'Construction and trades', 'Trades', {
    kind: 'invoice',
    document: { layout: 'banded', referenceLabel: 'Job reference' },
    terms: 'Payment within 30 days of the invoice date. Materials remain our property until paid for.',
    lines: [
      { description: 'Labour', quantity: 3, unitPrice: 280, unit: 'day' },
      { description: 'Materials, as scheduled', quantity: 1, unitPrice: 1450 },
    ],
  }),

  T('auto', 'Vehicle repair', 'Trades', {
    kind: 'invoice',
    document: { layout: 'rail', referenceLabel: 'Registration' },
    terms: 'Payment on collection.',
    lines: [
      { description: 'Labour', quantity: 2.5, unitPrice: 65, unit: 'hour' },
      { description: 'Parts — as listed', quantity: 1, unitPrice: 184.4 },
    ],
  }),

  T('medical', 'Clinic or practice', 'Professional', {
    kind: 'invoice',
    // A clinic's paperwork travels to an insurer, so it says so on the document.
    document: { layout: 'letterhead', referenceLabel: 'Policy or claim number', closingText: 'This invoice may be submitted to your insurer.' },
    terms: 'Payable on receipt.',
    lines: [{ description: 'Consultation', quantity: 1, unitPrice: 120 }],
  }),

  T('legal', 'Legal practice', 'Professional', {
    kind: 'invoice',
    document: { layout: 'centred', referenceLabel: 'Matter reference' },
    numbering: { prefixes: { invoice: 'LI-{YYYY}-' } },
    terms: 'Payable within 30 days. Interest may be charged on overdue amounts.',
    lines: [
      { description: 'Professional charges', quantity: 6.5, unitPrice: 240, unit: 'hour' },
      { description: 'Disbursements', quantity: 1, unitPrice: 95 },
    ],
  }),

  T('tuition', 'School, tutor or course', 'Education', {
    kind: 'invoice',
    document: { layout: 'classic', referenceLabel: 'Student reference' },
    numbering: { prefixes: { invoice: 'FEE-{YYYY}-' } },
    terms: 'Fees are due before the start of term.',
    lines: [{ description: 'Tuition — autumn term', quantity: 1, unitPrice: 1250 }],
  }),

  T('nonprofit', 'Charity — donation receipt', 'Nonprofit', {
    kind: 'receipt',
    // A donation is not a sale, and a receipt that charges tax on one is wrong in a way a regulator
    // notices.
    money: { taxEnabled: false },
    document: { layout: 'banded', closingText: 'Thank you for your support. Please keep this receipt for your records.' },
    numbering: { prefixes: { receipt: 'DON-{YYYY}-' } },
    note: 'No goods or services were provided in exchange for this donation.',
    lines: [{ description: 'Donation', quantity: 1, unitPrice: 100 }],
  }),

  T('rental', 'Property or equipment rental', 'Rental', {
    kind: 'invoice',
    document: { layout: 'classic', referenceLabel: 'Agreement number' },
    numbering: { prefixes: { invoice: 'RENT-{YYYY}{MM}-' }, resetPeriod: 'monthly' },
    terms: 'Due on the first of the month.',
    lines: [{ description: 'Monthly rent', quantity: 1, unitPrice: 950 }],
  }),

  T('logistics', 'Haulage and logistics', 'Logistics', {
    kind: 'invoice',
    document: { layout: 'banded', referenceLabel: 'Consignment number' },
    numbering: { prefixes: { invoice: 'CON-{YYYY}-' } },
    terms: 'Net 30. Demurrage charged after 2 hours free time.',
    lines: [
      { description: 'Collection and delivery', quantity: 1, unitPrice: 420 },
      { description: 'Waiting time', quantity: 1.5, unitPrice: 45, unit: 'hour' },
    ],
  }),
];

export const findTemplate = (id) => TEMPLATES.find((t) => t.id === id) || null;

/** The templates grouped the way the chooser shows them. */
export function templatesBySector() {
  const out = new Map();
  for (const t of TEMPLATES) {
    if (!out.has(t.sector)) out.set(t.sector, []);
    out.get(t.sector).push(t);
  }
  return [...out.entries()].map(([sector, items]) => ({ sector, items }));
}

/**
 * What applying a template would change.
 *
 * Returned as a plan rather than applied, so the chooser can say "this will change your layout and
 * your invoice prefix" before it does. Nothing about the BUSINESS is ever touched — a template that
 * overwrote somebody's own name and address would be unforgivable.
 */
export function templateChanges(template, settings) {
  if (!template) return [];
  const changes = [];
  const compare = (section, values) => {
    for (const [key, value] of Object.entries(values || {})) {
      if (key === 'prefixes') {
        for (const [kind, prefix] of Object.entries(value)) {
          if ((settings.numbering.prefixes || {})[kind] !== prefix) {
            changes.push({ path: `numbering.prefixes.${kind}`, from: settings.numbering.prefixes[kind], to: prefix });
          }
        }
        continue;
      }
      if (settings[section] && settings[section][key] !== value) {
        changes.push({ path: `${section}.${key}`, from: settings[section][key], to: value });
      }
    }
  };
  compare('document', template.document);
  compare('money', template.money);
  compare('numbering', template.numbering);
  return changes;
}

/**
 * Merge a template into settings.
 *
 * Returns a NEW object. The business section is passed through untouched, deliberately and always.
 */
export function applyTemplate(template, settings) {
  if (!template) return settings;
  const next = {
    ...settings,
    business: settings.business,          // never, under any circumstances
    document: { ...settings.document, ...(template.document || {}) },
    money: { ...settings.money, ...(template.money || {}) },
    numbering: {
      ...settings.numbering,
      ...(template.numbering || {}),
      prefixes: { ...settings.numbering.prefixes, ...((template.numbering || {}).prefixes || {}) },
    },
  };
  return next;
}

/** The starter document a template describes, for someone who wants to see it filled in. */
export function templateDraft(template) {
  if (!template) return null;
  return {
    kind: template.kind || 'invoice',
    terms: template.terms || '',
    note: template.note || '',
    lines: (template.lines || []).map((l) => ({ ...l })),
  };
}
