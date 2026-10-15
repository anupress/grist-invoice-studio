// The interface in German.
//
// From a German user's second round: "Would it be possible to translate the rest of the widget?"
// The documents already had their own words per language; the menus, buttons, hints and messages
// around them were English only. The interface now follows the browser, or a choice in Settings →
// Document, and these are the guarantees that make that safe to ship: every piece of interface
// text the code writes as a plain string has German (or is on the short list of words that are
// the same, examples, and names), text built from values is matched, a translation never matches
// again (so the observer that applies it cannot loop), and English is left exactly as it was.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => import(pathToFileURL(_resolve(ROOT, p)).href);

const { translateText, resolveUiLanguage, UI_LANGUAGES } = await load('src/i18n/ui.js');
const { DE, DE_PATTERNS } = await load('src/i18n/de.js');
const { uiStrings } = await load('scripts/ui-strings.mjs');
const { UPGRADE_PLAN } = await load('src/model/schema.js');
const { DOCUMENT_KINDS } = await load('src/doc/kinds.js');
const { SORTS } = await load('src/model/listing.js');
const { PERIODS } = await load('src/model/lifecycle.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };
const de = (s) => translateText(s, 'de');

// ---------------------------------------------------------------------------------------------
// Choosing the language
// ---------------------------------------------------------------------------------------------
{
  eq('automatic, German browser', resolveUiLanguage('auto', 'de-DE'), 'de');
  eq('automatic, Austrian German', resolveUiLanguage('auto', 'de-AT'), 'de');
  eq('automatic, plain de', resolveUiLanguage('auto', 'de'), 'de');
  eq('automatic, English browser', resolveUiLanguage('auto', 'en-GB'), 'en');
  eq('automatic, another language falls back to English', resolveUiLanguage('auto', 'fr-FR'), 'en');
  eq('automatic, no language at all', resolveUiLanguage('auto', ''), 'en');
  eq('chosen English wins over a German browser', resolveUiLanguage('en', 'de-DE'), 'en');
  eq('chosen German wins over an English browser', resolveUiLanguage('de', 'en-US'), 'de');
  eq('the three choices', UI_LANGUAGES.map((l) => l.id), ['auto', 'en', 'de']);
}

// ---------------------------------------------------------------------------------------------
// One text
// ---------------------------------------------------------------------------------------------
{
  eq('English is untouched', translateText('Save', 'en'), 'Save');
  eq('a word', de('Save'), 'Speichern');
  eq('space around it is kept', de('  Save \n'), '  Speichern \n');
  eq('unknown text stays as it is', de('Kingfisher Print Works'), 'Kingfisher Print Works');
  eq('no letters, nothing to do', de('€ 1.234,56'), '€ 1.234,56');
  eq('a required field keeps its star', de('Name *'), 'Name *');
  eq('a required field, translated', de('Country *'), 'Land *');
  eq('a reason after a dash', de('— For the footer of the document.'), '— Für die Fußzeile des Dokuments.');
  eq('null passes through', translateText(null, 'de'), null);
}

// ---------------------------------------------------------------------------------------------
// Every plain interface string the code writes is covered
// ---------------------------------------------------------------------------------------------
{
  // Words that are the same in German, examples a person replaces, names, Grist's own column labels
  // for the Outbox table (which are the table's, not the interface's), and document wording.
  const SAME = new Set([
    'Logo', 'Name', 'Website', 'IBAN', 'BIC', 'Suffix', 'Layout', 'Normal', 'Minimal', 'Ledger', 'HSN/SAC',
    'DIN 5008 (Form B)', 'DIN 5008 (Form A)', 'XML — UBL 2.1 (Peppol, XRechnung)', 'XML — UN/CEFACT CII (XRechnung, Factur-X)',
    'Invoice Studio', 'Invoice Studio v', 'Outbox', 'Status', 'Einschreiben\nPersönlich',
    'Thornbury Works', 'Harbour Lane Bakery', 'GB', 'GBP', 'GB 123 4567 89', 'DE89 3704 0044 0532 0130 00', 'name@bank',
    'https://pay.example/your-page', 'https://your-relay.example/send', 'nobody@example.com', 'accounts@example.com', '9930:DE123456789',
    'Ready to send', 'Cc', 'Bcc', 'Reply to', 'Body (HTML)', 'Attachment', 'Queued', 'Result',
    'No goods or services were provided in exchange for this donation.',
    // Prefixes of messages finished with a value; the whole message is a pattern.
    'Could not refresh —', 'The picture could not be uploaded:',
  ]);
  const all = uiStrings();
  ok('the scan finds the interface', all.size > 300);
  const missing = [...all].filter(([s]) => de(s) === s && !SAME.has(s));
  eq('every plain interface string has German', missing.map(([s, at]) => `${at} ${s}`), []);
  // And the list of exceptions is kept honest: an entry that has since been translated, or no
  // longer exists, is taken off it.
  const stale = [...SAME].filter((s) => !all.has(s) || de(s) !== s);
  eq('no stale exceptions', stale, []);
}

// ---------------------------------------------------------------------------------------------
// Words from lists the interface draws
// ---------------------------------------------------------------------------------------------
{
  for (const k of DOCUMENT_KINDS) ok(`kind ${k.id}`, de(k.label) !== k.label);
  for (const s of SORTS) ok(`order ${s.id}`, de(s.label) !== s.label);
  for (const p of PERIODS) ok(`period ${p.id}`, de(p.label) !== p.label);
  for (const [part, items] of Object.entries(UPGRADE_PLAN)) {
    for (const i of items) ok(`why ${part}.${i.id}`, de(i.why) !== i.why || console.log('    ', i.why));
  }
}

// ---------------------------------------------------------------------------------------------
// Text built from values
// ---------------------------------------------------------------------------------------------
{
  eq('a count of a total', de('3 of 12'), '3 von 12');
  eq('owed', de('Owed €1.250,00 · 4'), 'Offen €1.250,00 · 4');
  eq('a new document', de('New invoice'), 'Neu: Rechnung');
  eq('a new quote', de('New quote / estimate'), 'Neu: Angebot');
  eq('a client called New Horizons is not a new document', de('New Horizons Ltd'), 'New Horizons Ltd');
  eq('editing', de('Editing invoice INV-2026-0012'), 'Rechnung INV-2026-0012 bearbeiten');
  eq('editing a record', de('Editing Muster GmbH'), 'Muster GmbH bearbeiten');
  eq('make a credit note', de('Make credit note'), 'Gutschrift erstellen');
  eq('a product called Make-up stays', de('Make-up remover'), 'Make-up remover');
  eq('added columns, one', de('Added 1 column.'), '1 Spalte hinzugefügt.');
  eq('added columns, many', de('Added 4 columns.'), '4 Spalten hinzugefügt.');
  eq('the upgrade strip', de('13 columns would make this document a full billing system, and 2 are hidden on their pages.'),
    '13 Spalten würden dieses Dokument zu einem vollständigen Abrechnungssystem machen, und 2 sind auf ihren Seiten ausgeblendet.');
  eq('the upgrade summary', de('1 column would make this document a full billing system'),
    '1 Spalte würde dieses Dokument zu einem vollständigen Abrechnungssystem machen');
  eq('the extras heading', de('Also in Invoices'), 'Weitere Spalten in Invoices');
  eq('the extras heading, no table name', de('Also in this table'), 'Weitere Spalten in dieser Tabelle');
  eq('a record added', de('Muster GmbH added to your clients.'), 'Muster GmbH wurde zu Ihren Kunden hinzugefügt.');
  eq('a line description label', de('Line 2 description'), 'Beschreibung Position 2');
  eq('a line discount label', de('Line 3 discount: a percentage such as 10% or an amount'), 'Rabatt Position 3: ein Prozentsatz wie 10% oder ein Betrag');
  eq('an add-column button', de('Add picture column'), 'Spalte für Bild hinzufügen');
  eq('raised again', de('Raised for the next quarter. Save it when it is right.'), 'Für das nächste Quartal ausgestellt. Speichern Sie, wenn alles stimmt.');
  eq('a send title', de('Send INV-2026-0003'), 'INV-2026-0003 senden');
  eq('a send title, no number', de('Send this document'), 'Dieses Dokument senden');
  eq('issued read-only', de('This invoice has been issued, so it opens read-only.'), 'Rechnung wurde ausgestellt und öffnet daher schreibgeschützt.');
  eq('the e-invoice check', de('Line 2 has no description.'), 'Position 2 hat keine Beschreibung.');
  eq('access needed', de('Saving needs full access to this document. Open the creator panel on the right of the Grist page, find this widget’s Access setting, and choose Full document access.'),
    'Speichern braucht Vollzugriff auf dieses Dokument. Öffnen Sie rechts in Grist das Ersteller-Panel, suchen Sie die Einstellung Zugriff dieses Widgets und wählen Sie „Vollzugriff auf das Dokument“.');
  ok('the webhook step keeps its table', de('Open Document Settings, then API, then Manage Webhooks, and add one:\n\n  Table            Outbox\n  URL              https://x.example').endsWith('  Table            Outbox\n  URL              https://x.example'));
  ok('the webhook step is German', de('Open Document Settings, then API, then Manage Webhooks, and add one:\n\n  Table  Outbox').startsWith('Öffnen Sie'));
  eq('a field with nowhere to go', de('No column in this table holds it. One press adds it — nothing else in the table changes.'),
    'Keine Spalte dieser Tabelle nimmt das auf. Ein Klick fügt sie hinzu — sonst ändert sich nichts an der Tabelle.');
  eq('the save described', de('Add 1 invoice, add 3 lines, remove 1 line.'), '1 Rechnung anlegen, 3 Positionen hinzufügen, 1 Position entfernen.');
  eq('a field the save cannot keep', de('number'), 'Nummer');
  eq('why it cannot', de(' — that column is a formula, so Grist will not accept a value'), ' — diese Spalte ist eine Formel, Grist nimmt also keinen Wert an');
  eq('a trade summary',de('Sets up Thornbury Works: invoices · Classic layout · numbered INV-2026-0001. The preview below shows it.'),
    'Richtet Thornbury Works ein: Rechnungen · Layout Klassisch · nummeriert INV-2026-0001. Die Vorschau unten zeigt es.');
}

// ---------------------------------------------------------------------------------------------
// A translation is final: German never matches again, so the observer that applies it settles
// ---------------------------------------------------------------------------------------------
{
  const unsettled = Object.entries(DE).filter(([, v]) => de(v) !== v).map(([k, v]) => `${k} → ${v} → ${de(v)}`);
  eq('every German entry is final', unsettled, []);
  const samples = ['3 of 12', 'New invoice', 'Added 4 columns.', 'Editing invoice INV-1', 'Also in Invoices', 'Send INV-1',
    'Muster GmbH added to your clients.', 'This invoice has been issued, so it opens read-only.'];
  for (const s of samples) eq(`pattern output is final: ${s}`, de(de(s)), de(s));
  ok('every pattern is anchored', DE_PATTERNS.every(([re]) => re.source.startsWith('^') && re.source.endsWith('$')));
  ok('no empty German', Object.values(DE).every((v) => typeof v === 'string' && v.trim()));
}

console.log(`ui-language: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
