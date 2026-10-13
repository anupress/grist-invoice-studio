// Where the postcode goes.
//
// English-speaking countries write the town and then the postcode — "Bristol BS1 4QA" — and
// most of the rest of the world writes the postcode first: "10115 Berlin", "75008 Paris",
// "28001 Madrid". The order is not a nicety. On a German window envelope that line is the one
// the sorting machine reads, and it reads the postcode from the start of it; a document that
// printed "Berlin 10115" on every German invoice was wrong on the one line that is checked by a
// machine. The country decides when it is known, and the document's language decides when it is
// not — a document written in German to a client with no country on record is a document to a
// German-speaking client.
//
// Pure, and shared by the screen, the PDF and the email, so an address cannot be in one order
// on the page and another in the file.

const text = (v) => String(v == null ? '' : v).trim();

/** Town, then postcode. */
const CITY_FIRST = new Set([
  'GB', 'IE', 'US', 'CA', 'AU', 'NZ', 'IN', 'ZA', 'SG', 'MY', 'PH', 'HK', 'BR', 'CO', 'PE',
  'NG', 'KE', 'PK', 'LK', 'BD', 'JM', 'TT',
]);

/** Postcode, then town. */
const POSTCODE_FIRST = new Set([
  'DE', 'AT', 'CH', 'FR', 'ES', 'IT', 'NL', 'BE', 'LU', 'PT', 'PL', 'CZ', 'SK', 'HU', 'RO', 'BG',
  'GR', 'HR', 'SI', 'EE', 'LV', 'LT', 'FI', 'SE', 'DK', 'NO', 'IS', 'LI', 'MC', 'AD', 'SM', 'MT', 'CY',
  'TR', 'RU', 'UA', 'RS', 'BA', 'ME', 'MK', 'AL', 'MD', 'BY', 'JP', 'KR', 'TW', 'CN', 'VN', 'TH', 'ID',
  'MX', 'AR', 'CL', 'IL', 'MA', 'DZ', 'TN', 'EG', 'SA', 'AE',
]);

// A Country column holds a code most of the time and a name the rest of the time, in whichever
// language the person who typed it speaks. The common ones, in the languages the widget writes.
const NAMES = {
  germany: 'DE', deutschland: 'DE', allemagne: 'DE', alemania: 'DE',
  austria: 'AT', österreich: 'AT', oesterreich: 'AT', autriche: 'AT',
  switzerland: 'CH', schweiz: 'CH', suisse: 'CH', svizzera: 'CH',
  france: 'FR', frankreich: 'FR', francia: 'FR',
  netherlands: 'NL', nederland: 'NL', niederlande: 'NL', 'the netherlands': 'NL', holland: 'NL',
  belgium: 'BE', belgië: 'BE', belgique: 'BE', belgien: 'BE',
  spain: 'ES', españa: 'ES', espana: 'ES', spanien: 'ES',
  italy: 'IT', italia: 'IT', italien: 'IT', italie: 'IT',
  poland: 'PL', polska: 'PL', polen: 'PL', pologne: 'PL',
  portugal: 'PT', luxembourg: 'LU', luxemburg: 'LU',
  'united kingdom': 'GB', uk: 'GB', 'great britain': 'GB', britain: 'GB', england: 'GB', scotland: 'GB', wales: 'GB',
  'united states': 'US', usa: 'US', 'united states of america': 'US', 'u.s.': 'US', 'u.s.a.': 'US',
  ireland: 'IE', irland: 'IE', canada: 'CA', kanada: 'CA', australia: 'AU', australien: 'AU',
  'new zealand': 'NZ', 'south africa': 'ZA', india: 'IN', indien: 'IN', singapore: 'SG',
  japan: 'JP', china: 'CN', brazil: 'BR', brasil: 'BR', brasilien: 'BR', mexico: 'MX', méxico: 'MX',
  denmark: 'DK', dänemark: 'DK', danmark: 'DK', sweden: 'SE', schweden: 'SE', sverige: 'SE',
  norway: 'NO', norwegen: 'NO', norge: 'NO', finland: 'FI', finnland: 'FI', suomi: 'FI',
  czechia: 'CZ', 'czech republic': 'CZ', tschechien: 'CZ', česko: 'CZ',
  hungary: 'HU', ungarn: 'HU', greece: 'GR', griechenland: 'GR',
};

/** A two-letter code from whatever the Country column holds, or '' when it is not one we know. */
export function countryCode(v) {
  const s = text(v);
  if (!s) return '';
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  return NAMES[s.toLowerCase()] || '';
}

/** Does this party's address put the postcode before the town? */
export function postcodeFirst(party = {}, lang = 'en') {
  const code = countryCode(party.country);
  if (CITY_FIRST.has(code)) return false;
  if (POSTCODE_FIRST.has(code)) return true;
  return lang !== 'en';
}

/** The town line: "10115 Berlin", or "Bristol Somerset BS1 4QA", as the address's country writes it. */
export function placeLine(party = {}, lang = 'en') {
  const city = text(party.city);
  const state = text(party.state);
  const postcode = text(party.postcode);
  if (postcodeFirst(party, lang)) {
    // The region only when it says something the town does not: "20121 Milano MI", but never
    // "10115 Berlin Berlin".
    const region = state && state.toLowerCase() !== city.toLowerCase() ? state : '';
    return [postcode, city, region].filter(Boolean).join(' ');
  }
  return [city, state, postcode].filter(Boolean).join(' ');
}

/** The address as the lines that print under a party's name. */
export function addressLines(party = {}, lang = 'en') {
  return [party.street1, party.street2, placeLine(party, lang), party.country].map(text).filter(Boolean);
}
