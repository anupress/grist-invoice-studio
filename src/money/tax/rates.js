// Regional tax presets — data, not logic.
//
// Every preset here is a list of rows for the engine in ./engine.js. There is no India-specific or
// Canada-specific code anywhere in this project; there are only rows whose priorities and state
// codes make the engine's ordinary rules produce the right answer. That is the whole design, and it
// is why adding a country nobody anticipated is a few rows rather than a release.
//
// NOT TAX ADVICE. These are starting points, stamped with when they were written down, meant to be
// checked against the rates the business is actually registered for and then edited. Rates change,
// registration thresholds differ, and a business's own circumstances decide more than its country
// does. The UI states this wherever a preset is applied.

export const RATES_UPDATED = '2026-08';

const row = (r) => ({
  country: '*', state: '*', postcode: '', city: '',
  rate: 0, name: 'Tax', priority: 1, compound: false, shipping: true, class: '',
  ...r,
});

// ---------------------------------------------------------------------------------------------
// India — GST
// ---------------------------------------------------------------------------------------------
//
// The interesting one, and the reason the priority rule exists.
//
// Supply within your own state is taxed as CGST plus SGST, two halves of the same rate. Supply to
// any other state is taxed as a single IGST at the full rate. That is not two code paths here: the
// CGST and SGST rows name your home state and sit at priorities 1 and 2, the IGST row says "any
// state" and sits at priority 1. A customer in your state matches the more specific CGST row at
// priority 1 and the SGST row at priority 2; a customer anywhere else matches only IGST. The engine
// resolves it, and neither it nor this comment needs a special case.
function indiaGST({ homeState = '' } = {}) {
  const slabs = [
    { cls: '', total: 18, label: '18%' },
    { cls: 'reduced', total: 12, label: '12%' },
    { cls: 'reduced-5', total: 5, label: '5%' },
    { cls: 'luxury', total: 28, label: '28%' },
  ];
  const out = [];
  for (const s of slabs) {
    const half = s.total / 2;
    if (homeState) {
      out.push(row({ country: 'IN', state: homeState, rate: half, name: 'CGST', priority: 1, class: s.cls }));
      out.push(row({ country: 'IN', state: homeState, rate: half, name: 'SGST', priority: 2, class: s.cls }));
    }
    out.push(row({ country: 'IN', state: '*', rate: s.total, name: 'IGST', priority: 1, class: s.cls }));
  }
  out.push(row({ country: 'IN', state: '*', rate: 0, name: 'GST', priority: 1, class: 'zero' }));
  return out;
}

// ---------------------------------------------------------------------------------------------
// European Union — VAT
// ---------------------------------------------------------------------------------------------
// Every member state: the standard rate, and the reduced rate most commonly met — the one that
// applies to food, books, passenger transport and similar. Several countries have a second reduced
// rate and a "super-reduced" rate below that; those are genuinely specific to what is being sold, so
// they are left for the business to add as a row rather than guessed at across twenty-seven
// countries. The names stay as each country's own, because that is what has to appear on the
// document — a German invoice says MwSt, not VAT.
const EU_RATES = {
  AT: { standard: 20, reduced: 10, name: 'USt' },
  BE: { standard: 21, reduced: 6, name: 'BTW' },
  BG: { standard: 20, reduced: 9, name: 'ДДС' },
  HR: { standard: 25, reduced: 13, name: 'PDV' },
  CY: { standard: 19, reduced: 9, name: 'ΦΠΑ' },
  CZ: { standard: 21, reduced: 12, name: 'DPH' },
  DK: { standard: 25, reduced: 0, name: 'moms' },     // Denmark has no reduced rate
  EE: { standard: 22, reduced: 9, name: 'KM' },
  FI: { standard: 25.5, reduced: 14, name: 'ALV' },
  FR: { standard: 20, reduced: 10, name: 'TVA' },
  DE: { standard: 19, reduced: 7, name: 'MwSt' },
  GR: { standard: 24, reduced: 13, name: 'ΦΠΑ' },
  HU: { standard: 27, reduced: 18, name: 'ÁFA' },
  IE: { standard: 23, reduced: 13.5, name: 'VAT' },
  IT: { standard: 22, reduced: 10, name: 'IVA' },
  LV: { standard: 21, reduced: 12, name: 'PVN' },
  LT: { standard: 21, reduced: 9, name: 'PVM' },
  LU: { standard: 17, reduced: 8, name: 'TVA' },
  MT: { standard: 18, reduced: 7, name: 'VAT' },
  NL: { standard: 21, reduced: 9, name: 'BTW' },
  PL: { standard: 23, reduced: 8, name: 'VAT' },
  PT: { standard: 23, reduced: 13, name: 'IVA' },
  RO: { standard: 21, reduced: 11, name: 'TVA' },
  SK: { standard: 23, reduced: 19, name: 'DPH' },
  SI: { standard: 22, reduced: 9.5, name: 'DDV' },
  ES: { standard: 21, reduced: 10, name: 'IVA' },
  SE: { standard: 25, reduced: 12, name: 'moms' },
};

const EU_STANDARD = Object.fromEntries(Object.entries(EU_RATES).map(([cc, r]) => [cc, r.standard]));

// The preset declares that it needs `homeCountry`, but the ROWS do not depend on it — every member
// state's rate is the same table whoever you are. It is needed by reverseChargeApplies() below,
// which is a condition rather than a rate and therefore cannot live in the table at all.
function euVAT() {
  const out = [];
  for (const [cc, r] of Object.entries(EU_RATES)) {
    out.push(row({ country: cc, rate: r.standard, name: r.name, priority: 1, class: '' }));
    if (r.reduced) out.push(row({ country: cc, rate: r.reduced, name: r.name, priority: 1, class: 'reduced' }));
    out.push(row({ country: cc, rate: 0, name: r.name, priority: 1, class: 'zero' }));
  }
  return out;
}

/**
 * The rest of the world's headline rates.
 *
 * One standard rate each, and a reduced one only where it is both well known and widely met. A
 * country whose tax genuinely needs more than a row or two — Brazil, or United States sales tax —
 * is deliberately not here, because a plausible-looking wrong table is worse than an empty one that
 * makes somebody go and look the answer up.
 */
const WORLD_RATES = [
  { country: 'GB', standard: 20, reduced: 5, name: 'VAT' },
  { country: 'CH', standard: 8.1, reduced: 2.6, name: 'MWST' },
  { country: 'NO', standard: 25, reduced: 15, name: 'MVA' },
  { country: 'IS', standard: 24, reduced: 11, name: 'VSK' },
  { country: 'TR', standard: 20, reduced: 10, name: 'KDV' },
  { country: 'RS', standard: 20, reduced: 10, name: 'PDV' },
  { country: 'UA', standard: 20, reduced: 7, name: 'ПДВ' },
  { country: 'AU', standard: 10, name: 'GST' },
  { country: 'NZ', standard: 15, name: 'GST' },
  { country: 'JP', standard: 10, reduced: 8, name: 'CT' },
  { country: 'KR', standard: 10, name: 'VAT' },
  { country: 'CN', standard: 13, reduced: 9, name: 'VAT' },
  { country: 'SG', standard: 9, name: 'GST' },
  { country: 'TH', standard: 7, name: 'VAT' },
  { country: 'VN', standard: 10, reduced: 8, name: 'VAT' },
  { country: 'ID', standard: 12, name: 'PPN' },
  { country: 'PH', standard: 12, name: 'VAT' },
  { country: 'MY', standard: 10, reduced: 6, name: 'SST' },
  { country: 'AE', standard: 5, name: 'VAT' },
  { country: 'SA', standard: 15, name: 'VAT' },
  { country: 'IL', standard: 18, name: 'VAT' },
  { country: 'EG', standard: 14, name: 'VAT' },
  { country: 'ZA', standard: 15, name: 'VAT' },
  { country: 'NG', standard: 7.5, name: 'VAT' },
  { country: 'KE', standard: 16, name: 'VAT' },
  { country: 'MA', standard: 20, reduced: 10, name: 'TVA' },
  { country: 'MX', standard: 16, name: 'IVA' },
  { country: 'AR', standard: 21, reduced: 10.5, name: 'IVA' },
  { country: 'CL', standard: 19, name: 'IVA' },
  { country: 'CO', standard: 19, reduced: 5, name: 'IVA' },
];

function worldVAT() {
  const out = [];
  for (const r of WORLD_RATES) {
    out.push(row({ country: r.country, rate: r.standard, name: r.name, priority: 1, class: '' }));
    if (r.reduced) out.push(row({ country: r.country, rate: r.reduced, name: r.name, priority: 1, class: 'reduced' }));
    out.push(row({ country: r.country, rate: 0, name: r.name, priority: 1, class: 'zero' }));
  }
  return out;
}

/** Everywhere this project knows a headline rate for — EU and the rest, in one table. */
function everywhere(opts) {
  return [...euVAT(opts), ...worldVAT()];
}

/**
 * One rate, everywhere, typed in by hand.
 *
 * The answer for most small businesses, and the reason it exists: a sole trader registered for VAT
 * in one country does not need a table of twenty-seven, and asking them to pick a preset and then
 * check it is asking them to do work that has no bearing on their invoices. One number and one name
 * is the whole of their tax situation, so it should be the whole of their tax settings.
 *
 * It is still a rate ROW — a wildcard country at priority 1 — so it goes through exactly the same
 * engine as everything else. No second code path, and no second set of rounding behaviour.
 */
export function simpleRate({ rate = 0, name = 'VAT', appliesToShipping = true } = {}) {
  const n = Number(rate);
  if (!isFinite(n)) return [];
  return [
    row({ country: '*', state: '*', rate: n, name: name || 'Tax', priority: 1, shipping: appliesToShipping !== false, class: '' }),
    row({ country: '*', state: '*', rate: 0, name: name || 'Tax', priority: 1, class: 'zero' }),
  ];
}

/**
 * Does the EU reverse charge apply to this sale?
 *
 * Cross-border, inside the EU, and the customer has produced a VAT number. When it applies the tax
 * is not zero-rated — it is *not charged by you*, and the document must say so, which is why the
 * legend travels with the answer rather than being left to whoever renders it.
 */
export function reverseChargeApplies({ homeCountry, customerCountry, customerTaxNumber } = {}) {
  const home = String(homeCountry || '').trim().toUpperCase();
  const to = String(customerCountry || '').trim().toUpperCase();
  const vat = String(customerTaxNumber || '').trim();
  if (!home || !to || home === to) return null;
  if (!(home in EU_STANDARD) || !(to in EU_STANDARD)) return null;
  if (!vat) return null;
  return { exempt: true, reason: 'Reverse charge: VAT to be accounted for by the recipient' };
}

// ---------------------------------------------------------------------------------------------
// United Kingdom
// ---------------------------------------------------------------------------------------------
const ukVAT = () => [
  row({ country: 'GB', rate: 20, name: 'VAT', priority: 1, class: '' }),
  row({ country: 'GB', rate: 5, name: 'VAT', priority: 1, class: 'reduced' }),
  row({ country: 'GB', rate: 0, name: 'VAT', priority: 1, class: 'zero' }),
];

// ---------------------------------------------------------------------------------------------
// Canada — the compound example
// ---------------------------------------------------------------------------------------------
// Quebec charges QST on top of the base PLUS the federal GST, which is exactly what `compound`
// means and exactly what a flat 5 + 9.975 = 14.975% would get wrong.
const canada = () => [
  row({ country: 'CA', state: '*', rate: 5, name: 'GST', priority: 1, class: '' }),
  row({ country: 'CA', state: 'QC', rate: 9.975, name: 'QST', priority: 2, compound: true, class: '' }),
  row({ country: 'CA', state: 'ON', rate: 13, name: 'HST', priority: 1, class: '' }),
  row({ country: 'CA', state: 'NS', rate: 14, name: 'HST', priority: 1, class: '' }),
  row({ country: 'CA', state: 'NB', rate: 15, name: 'HST', priority: 1, class: '' }),
  row({ country: 'CA', state: 'NL', rate: 15, name: 'HST', priority: 1, class: '' }),
  row({ country: 'CA', state: 'PE', rate: 15, name: 'HST', priority: 1, class: '' }),
  row({ country: 'CA', state: 'BC', rate: 7, name: 'PST', priority: 2, class: '' }),
  row({ country: 'CA', state: 'SK', rate: 6, name: 'PST', priority: 2, class: '' }),
  row({ country: 'CA', state: 'MB', rate: 7, name: 'RST', priority: 2, class: '' }),
];

// ---------------------------------------------------------------------------------------------
// The simple ones
// ---------------------------------------------------------------------------------------------
const australia = () => [
  row({ country: 'AU', rate: 10, name: 'GST', priority: 1, class: '' }),
  row({ country: 'AU', rate: 0, name: 'GST', priority: 1, class: 'zero' }),
];

const uae = () => [
  row({ country: 'AE', rate: 5, name: 'VAT', priority: 1, class: '' }),
  row({ country: 'AE', rate: 0, name: 'VAT', priority: 1, class: 'zero' }),
];

const singapore = () => [row({ country: 'SG', rate: 9, name: 'GST', priority: 1, class: '' })];
const southAfrica = () => [row({ country: 'ZA', rate: 15, name: 'VAT', priority: 1, class: '' })];

// ---------------------------------------------------------------------------------------------
// United States — deliberately almost empty
// ---------------------------------------------------------------------------------------------
//
// US sales tax is destination-based and set by state, county, city and special districts, so a
// national preset would be wrong nearly everywhere it was used. Shipping a plausible-looking table
// of state rates would be worse than shipping nothing: it would look authoritative and quietly
// under-collect. What is useful is the SHAPE, so these two rows are examples to edit.
const unitedStates = () => [
  row({ country: 'US', state: 'CA', rate: 7.25, name: 'Sales tax', priority: 1, shipping: false, class: '' }),
  row({ country: 'US', state: 'NY', postcode: '10001...10292', rate: 8.875, name: 'Sales tax', priority: 1, shipping: false, class: '' }),
];

// ---------------------------------------------------------------------------------------------

export const TAX_PRESETS = [
  { id: 'eu-all', label: 'European Union — every member state', build: euVAT, needs: ['homeCountry'],
    note: 'Standard and main reduced rate for all 27, each under its own name — a German invoice says MwSt, not VAT. Cross-border sales to a business with a VAT number are reverse-charged.' },
  { id: 'world', label: 'Europe and the wider world', build: everywhere, needs: ['homeCountry'],
    note: 'The EU plus thirty more: the UK, Switzerland, Norway, Turkey, Japan, China, Australia, the Gulf, Africa and Latin America. Headline rates only — anything sold under a special rate needs a row of its own.' },
  { id: 'in-gst', label: 'India — GST', build: indiaGST, needs: ['homeState'],
    note: 'Charges CGST plus SGST within your own state and IGST everywhere else, decided by the customer’s state. Set your registered state, and put HSN codes on your line items.' },
  { id: 'eu-vat', label: 'European Union — standard rates only', build: euVAT, needs: ['homeCountry'],
    note: 'Kept for documents set up before the fuller EU preset existed; it now builds the same rows.' },
  { id: 'gb-vat', label: 'United Kingdom — VAT', build: ukVAT, needs: [],
    note: 'Standard 20%, reduced 5%, and a zero class for the goods that qualify.' },
  { id: 'ca-gst', label: 'Canada — GST, HST, PST and QST', build: canada, needs: [],
    note: 'Includes Quebec’s QST, which compounds on top of the federal GST rather than being added alongside it.' },
  { id: 'au-gst', label: 'Australia — GST', build: australia, needs: [],
    note: 'A flat 10%. Australian businesses usually advertise prices with tax already included — turn on tax-inclusive pricing to match.' },
  { id: 'ae-vat', label: 'United Arab Emirates — VAT', build: uae, needs: [],
    note: 'A flat 5%. Put your TRN on the document.' },
  { id: 'sg-gst', label: 'Singapore — GST', build: singapore, needs: [], note: 'A flat 9%.' },
  { id: 'za-vat', label: 'South Africa — VAT', build: southAfrica, needs: [], note: 'A flat 15%.' },
  { id: 'us-sales', label: 'United States — sales tax (examples)', build: unitedStates, needs: [],
    note: 'Two example rows, not a national table. US sales tax is set by state, county, city and district, so a preset would be wrong almost everywhere — replace these with the rates you are actually registered to collect.' },
];

export function buildPreset(id, options = {}) {
  const preset = TAX_PRESETS.find((p) => p.id === id);
  if (!preset) return [];
  return preset.build(options);
}

export function findPreset(id) { return TAX_PRESETS.find((p) => p.id === id) || null; }
