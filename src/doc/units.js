// Units of measure, as the codes an electronic invoice requires.
//
// EN 16931 — the European e-invoice standard behind XRechnung, Factur-X and Peppol — does not
// accept "hours" or "pcs" on a line; it wants a UN/ECE Recommendation 20 code: HUR, C62. A person
// types the word they use, the document prints the word they typed, and the XML carries the code
// this table gives it. Anything unrecognised becomes C62, "one", which is the code for a unit
// that is simply a unit — valid, and honest about not knowing better.

const CODES = [
  ['C62', ['', 'unit', 'units', 'pc', 'pcs', 'piece', 'pieces', 'each', 'ea', 'item', 'items', 'stk', 'stück', 'st', 'pièce', 'pz', 'szt', 'ud', 'uds', 'un']],
  ['H87', ['piece_h87']],
  ['HUR', ['h', 'hr', 'hrs', 'hour', 'hours', 'std', 'stunde', 'stunden', 'heure', 'heures', 'ora', 'ore', 'uur', 'godz', 'hora', 'horas']],
  ['DAY', ['d', 'day', 'days', 'tag', 'tage', 'jour', 'jours', 'giorno', 'giorni', 'dag', 'dagen', 'dzień', 'dni', 'día', 'dias', 'dia']],
  ['WEE', ['wk', 'week', 'weeks', 'woche', 'wochen', 'semaine', 'settimana', 'tydzień', 'semana']],
  ['MON', ['mo', 'month', 'months', 'monat', 'monate', 'mois', 'mese', 'mesi', 'maand', 'miesiąc', 'mes', 'meses', 'mês']],
  ['ANN', ['yr', 'year', 'years', 'jahr', 'jahre', 'an', 'année', 'anno', 'jaar', 'rok', 'año', 'ano']],
  ['MIN', ['min', 'minute', 'minutes', 'minuten', 'minuto', 'minuti']],
  ['KGM', ['kg', 'kilo', 'kilogram', 'kilograms', 'kilogramm', 'kilogramme', 'kilogrammes']],
  ['GRM', ['g', 'gram', 'grams', 'gramm', 'gramme', 'grammes', 'grammo', 'grammi']],
  ['TNE', ['t', 'tonne', 'tonnes', 'ton', 'tons']],
  ['MTR', ['m', 'metre', 'metres', 'meter', 'meters', 'mètre', 'mètres', 'metro', 'metri', 'metros']],
  ['CMT', ['cm', 'centimetre', 'centimeter']],
  ['MMT', ['mm', 'millimetre', 'millimeter']],
  ['KMT', ['km', 'kilometre', 'kilometer', 'kilomètre']],
  ['MTK', ['m2', 'm²', 'sqm', 'sq m', 'square metre', 'square meter', 'qm', 'quadratmeter', 'mètre carré', 'metro quadro', 'metr kw']],
  ['MTQ', ['m3', 'm³', 'cbm', 'cubic metre', 'cubic meter', 'kubikmeter', 'mètre cube', 'metro cubo']],
  ['LTR', ['l', 'lt', 'ltr', 'litre', 'litres', 'liter', 'liters', 'litro', 'litri', 'litros']],
  ['MLT', ['ml', 'millilitre', 'milliliter']],
  ['SET', ['set', 'sets', 'satz', 'jeu', 'kit', 'kits']],
  ['PR', ['pair', 'pairs', 'paar', 'paire', 'paio', 'para', 'par']],
  ['BX', ['box', 'boxes', 'karton', 'boîte', 'scatola', 'doos', 'pudełko', 'caja', 'caixa']],
  ['PK', ['pack', 'packs', 'package', 'packung', 'paquet', 'pacco', 'pak', 'opakowanie', 'paquete', 'pacote']],
  ['CT', ['carton', 'cartons']],
  ['PF', ['pallet', 'pallets', 'palette', 'paletten', 'pallet']],
  ['RO', ['roll', 'rolls', 'rolle', 'rouleau', 'rotolo', 'rol', 'rolka', 'rollo']],
  ['BO', ['bottle', 'bottles', 'flasche', 'bouteille', 'bottiglia', 'fles', 'butelka', 'botella', 'garrafa']],
  ['BG', ['bag', 'bags', 'sack', 'beutel', 'sachet', 'sacco', 'zak', 'worek', 'bolsa', 'saco']],
  ['LS', ['lump sum', 'lumpsum', 'lot', 'pauschal', 'forfait', 'forfettario', 'ryczałt']],
  ['E48', ['service', 'services', 'dienstleistung', 'prestation', 'servizio', 'dienst', 'usługa', 'servicio', 'serviço']],
  ['KWH', ['kwh', 'kilowatt hour', 'kilowatt-hour']],
  ['LM', ['lm', 'linear metre', 'linear meter', 'laufmeter', 'lfm', 'mètre linéaire', 'metro lineare']],
];

const LOOKUP = new Map();
for (const [code, words] of CODES) for (const w of words) LOOKUP.set(w, code);

/** The UN/ECE unit code for a unit as a person wrote it. C62 when nothing matches. */
export function unitCode(unit) {
  const key = String(unit == null ? '' : unit).trim().toLowerCase().replace(/\.$/, '');
  return LOOKUP.get(key) || 'C62';
}

/** Is this already a UN/ECE code somebody typed directly? */
export function isUnitCode(unit) {
  const key = String(unit == null ? '' : unit).trim().toUpperCase();
  return CODES.some(([code]) => code === key);
}

/** The code for a line: a code typed as such, else the word's code. */
export function lineUnitCode(unit) {
  return isUnitCode(unit) ? String(unit).trim().toUpperCase() : unitCode(unit);
}
