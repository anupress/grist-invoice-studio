// Why no tax is being charged, said on the document in the words the law expects.
//
// A small business below its country's VAT threshold does not charge VAT, and an invoice that
// simply shows none looks — to a client's accountant and to a tax inspector — like one that forgot.
// Every EU state has a sentence for this, and most require it verbatim: Germany's "§ 19 UStG",
// France's "art. 293 B du CGI". The sentence is chosen by the business's home country; the
// business can always type its own instead.
//
// These are starting points, dated like the rate presets, and they are not legal advice.

export const EXEMPTIONS_UPDATED = '2026-09';

const SMALL_BUSINESS = {
  DE: 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.',
  AT: 'Umsatzsteuerbefreit gemäß § 6 Abs. 1 Z 27 UStG (Kleinunternehmerregelung).',
  FR: 'TVA non applicable, art. 293 B du CGI.',
  BE: 'Kleine onderneming onderworpen aan de vrijstellingsregeling van belasting — btw niet toepasselijk. / Petite entreprise soumise au régime de la franchise de taxe — TVA non applicable.',
  NL: 'Vrijgesteld van btw op grond van de kleineondernemersregeling (KOR).',
  LU: 'TVA non applicable — régime de franchise des petites entreprises (art. 57 LTVA).',
  IT: 'Operazione senza applicazione dell’IVA ai sensi dell’art. 1, commi 54–89, L. 190/2014 (regime forfettario).',
  ES: 'Operación exenta de IVA (régimen de franquicia).',
  PT: 'IVA — regime de isenção, art. 53.º do CIVA.',
  PL: 'Zwolnienie z VAT na podstawie art. 113 ust. 1 ustawy o VAT.',
  CZ: 'Neplátce DPH.',
  SK: 'Nie sme platiteľom DPH.',
  HU: 'Alanyi adómentes.',
  RO: 'Neplătitor de TVA.',
  IE: 'Not registered for VAT.',
  GB: 'Not VAT registered.',
  DK: 'Momsfritaget — omsætning under registreringsgrænsen.',
  SE: 'Momsbefriad — omsättning under gränsen för momsregistrering.',
  FI: 'Arvonlisäverovelvollisuuden alaraja ei ylity — ei alv:tä.',
  CH: 'Nicht mehrwertsteuerpflichtig.',
};

const GENERIC = 'VAT exempt — small business scheme.';

/**
 * The note for a small business in a given country, or the generic one.
 *
 * `custom` wins whenever it is set: the business's own wording, however it prefers to put it.
 */
export function smallBusinessNote(homeCountry, custom = '') {
  const own = String(custom || '').trim();
  if (own) return own;
  const cc = String(homeCountry || '').trim().toUpperCase();
  return SMALL_BUSINESS[cc] || GENERIC;
}

/**
 * The exemption the money settings describe, in the shape the totals engine takes.
 *
 * Only one kind so far — the small-business scheme — but the shape leaves room for others, and
 * returning null is what lets a business with no exemption pay nothing for this file existing.
 */
export function exemptionFor(money = {}) {
  if (money.exemption !== 'small_business') return null;
  return { reason: smallBusinessNote(money.homeCountry, money.exemptionText) };
}

export const EXEMPTION_CHOICES = [
  { id: '', label: 'None — tax is charged as set up above' },
  { id: 'small_business', label: 'Small-business scheme — no VAT, with the legal note' },
];
