// The words on the form and the bar, in the languages the FORM speaks.
//
// Not to be confused with doc/lang.js, which is the language the DOCUMENT is written in. A German
// business using the English form still gets a German invoice; and a German page gets a German
// form because a tool that says "Your business" above a box for a Rechnung is a tool half
// translated. The two are chosen separately: the document per client, the form per page.
//
// English is complete; every other language falls back to it per key, so a missing entry is an
// English word rather than "undefined" on a button.

const EN = {
  // sections
  yourBusiness: 'Your business', yourClient: 'Your client', theDocument: 'The document',
  items: 'What you are billing for', moneyTax: 'Money and tax', howTheyPay: 'How they pay you',
  whatItSays: 'What it says',
  // the business and the client
  businessName: 'Business name', name: 'Name', email: 'Email', phone: 'Phone', street: 'Street',
  street2: 'Street, second line', city: 'Town or city', postcode: 'Postcode', region: 'Region or state',
  country: 'Country', countryHint: 'Two letters. It decides the tax treatment.', website: 'Website',
  taxIdHint: 'A VAT number here and on the client turns on the EU reverse charge by itself.',
  legalLine: 'Legal footer line', legalLineHint: 'Registration number, court, managing director. Printed small at the foot.',
  logo: 'Logo', logoHint: 'PNG or JPEG. It is scaled down and kept in this browser, never uploaded.',
  logoError: 'That file could not be read as an image. PNG and JPEG work.', chooseLogo: 'Choose a logo',
  logoAlt: 'Your logo, as it will print', remove: 'Remove',
  logoSize: 'Size', logoSmall: 'Small', logoNormal: 'Normal', logoLarge: 'Large',
  logoPlate: 'White plate behind the logo on coloured layouts',
  logoPlateHint: 'Ticked by itself for a dark mark, unticked for a light one. A mark drawn for white paper vanishes on a navy band without it.',
  logoOnly: 'The logo carries the name', logoOnlyHint: 'The header prints the mark alone; your name still appears in the From block.',
  accent: 'Accent colour', accentHint: 'Rules, headings and the masthead follow it.', useDefault: 'Use the default',
  theirTax: 'Their tax number', language: 'Language', followDocument: 'Follow the document setting',
  languageHint: 'The document is written in the client’s language; your own words are never translated.',
  // the document
  number: 'Number', issued: 'Issued', due: 'Due', serviceDate: 'Service or delivery date',
  serviceDateHint: 'German law asks for it, and an XRechnung is refused without one.',
  rulebook: 'Electronic invoice rulebook', rulebookNone: 'None — an ordinary PDF is enough',
  rulebookHint: 'Choose one and the E-invoice button checks the document against its rules before building the file.',
  leitweg: 'Leitweg-ID or buyer reference', leitwegHint: 'A German public body will not accept an XRechnung without the reference it gave you.',
  // money
  currency: 'Currency', howTax: 'How tax works', taxSimple: 'One rate I type in',
  taxPreset: 'A table of rates by country', taxNone: 'No tax at all', ratePercent: 'Rate, per cent',
  taxCustom: 'My own rates, typed in', yourRates: 'Your rates',
  customHint: 'One row per rate. Leave the country and region blank for a rate that applies everywhere; a row naming a country wins over one that does not. Rates are yours to check.',
  rowCountry: 'Country', rowRegion: 'Region', rowRate: 'Rate %', rowName: 'Name', rowAnywhere: 'anywhere',
  addRow: 'Add a rate', removeRow: 'Remove this rate',
  taxName: 'What it is called', taxNameHint: 'MwSt, TVA, IVA — whatever your country calls it.',
  rateTable: 'Rate table', rateTableHint: 'Rates are a starting point and change. They are not tax advice.',
  yourCountry: 'Your country', yourRegion: 'Your region or state',
  pricesInclude: 'Prices already include tax', pricesIncludeHint: 'What a shop advertises on the shelf is what the customer pays.',
  discount: 'Discount', discountFor: 'What the discount is for', discountPlaceholder: 'Introductory discount',
  shipping: 'Delivery or shipping', alreadyPaid: 'Already paid', alreadyPaidHint: 'Leaves the balance still owed on the document.',
  // getting paid
  ibanHint: 'A euro document with an IBAN carries the SEPA code banking apps scan.',
  accountHolder: 'Account holder', upi: 'UPI id', upiHint: 'For rupee documents.',
  paymentLink: 'Payment link', paymentLinkHint: 'Your Stripe or PayPal page. Serves any currency.',
  howToPay: 'How to pay', howToPayHint: 'Printed as typed, under the totals.',
  paidFor: 'The boxes for a business banking in {country}. Change the country under Your business.',
  accountNumber: 'Account number', sortCode: 'Sort code', routingNumber: 'Routing number (ABA)', bsb: 'BSB',
  ifsc: 'IFSC code', transitNumber: 'Transit and institution number', bankCode: 'Bank code', bankName: 'Bank',
  bic: 'BIC / SWIFT', abroadHint: 'For clients paying from abroad.',
  accountHolderHint: 'Left empty, your business name is used.',
  ibanNonEuroHint: 'Printed under the totals. The SEPA code banking apps scan appears on euro documents.',
  // wording
  terms: 'Payment terms', note: 'Note on this document', closing: 'Closing line',
  closingHint: 'The same on every document you make.',
  creditKeep: 'Keep the line saying where this was made',
  creditHint: 'One small line at the very foot, in the document’s language. It is how the tool stays free and unlimited, and it is yours to remove.',
  // the bar
  document: 'Document', layout: 'Layout', docLanguage: 'Language', paper: 'Paper', density: 'Density',
  compact: 'Compact', normal: 'Normal', roomy: 'Roomy',
  print: 'Print', downloadHtml: 'HTML file', einvoice: 'E-invoice', einvoiceFormat: 'Electronic invoice format',
  downloadPdf: 'Download PDF',
  a4: 'A4', letter: 'US Letter', legal: 'US Legal', a5: 'A5', receipt80: 'Till roll, 80mm', receipt58: 'Till roll, 58mm',
  // the setup strip
  setUpFor: 'Set up for', chooseTrade: 'Choose a trade…', convertTo: 'Convert to', choose: 'Choose…',
  fillExample: 'Fill with an example', newDocument: 'New document', saveFile: 'Save my details as a file',
  loadFile: 'Load a details file', forget: 'Forget my details', setsUp: 'Sets up',
  edit: 'Edit', preview: 'Preview',
  // the language switch, the section heads and the help buttons
  interfaceLanguage: 'Language of this tool', switchedLanguage: 'The tool now speaks English. Your document is unchanged.',
  whatIsThis: 'What does this do?', aboutField: 'About: {label}', closeTip: 'Close',
  sectionFilled: 'Filled in', sectionEmpty: 'Nothing here yet', documentSetup: 'Document',
  moreSettings: 'Language, paper and spacing', closeSettings: 'Done',
  // the foot
  footRemembered: 'Everything here happens in your browser. Your business details are kept in this browser so you do not retype them; the document is dropped when you close the tab. Nothing is uploaded, and anupress.com keeps no copy of any of it.',
  footFresh: 'Everything here happens in your browser. Nothing is uploaded, and anupress.com keeps no copy of anything you type.',
  // messages
  filledExample: 'Filled in with an example. Change anything, or start again.',
  blankDoc: 'A blank document. Your own details are still here.',
  forgotten: 'Forgotten. Nothing of yours is left in this browser, and there was never a copy anywhere else.',
  downloaded: 'Downloaded {name}.',
  validateFirst: 'Downloaded {name}. Validate the first one with your receiver’s own checker, as every sender does.',
  pdfFailed: 'The PDF could not be built: {why}', einvFailed: 'The e-invoice could not be built: {why}',
  fileFailed: 'The file could not be built: {why}', unknownWhy: 'unknown reason',
  wouldBeRejected: 'This file would be rejected by a receiver. Fix these first:',
  mayAsk: 'Downloaded {name}. A receiver may still ask about:',
  converted: 'Now a {kind}{ref}, with its own number.', referringTo: ', referring to {ref}',
  kitSaved: 'Saved {name}. Load it on any device and your details and numbering carry on from here.',
  kitLoaded: 'Loaded. Your details are back, and the next number follows the last one you issued.',
  notKit: 'That is not a details file from this tool.',
  // the send dialog
  _lang: 'en',
  emailIt: 'Email it to me', closeDialog: 'Close', cancel: 'Cancel', send: 'Send', sending: 'Sending…',
  selfIntro: 'We email the file to you and to nobody else. Then you forward it to your client from your own mailbox, so your client sees your address as the sender.',
  yourEmail: 'Your email address', yourEmailHint: 'The first time, we email you a code to check that the address is yours. After that, this browser remembers it for a month.',
  sendCode: 'Send me a code', codeLabel: 'The code from your email', codeHint: 'Six digits, valid for ten minutes.',
  codeSent: 'A code is on its way to {email}. Enter it below.', verifiedAs: 'This browser already knows {email}. No code needed.',
  attach: 'File', needCode: 'Enter the code we emailed you, or ask for one.', emailInvalid: 'Enter your email address first.',
  exampleData: 'This is still the example, with made-up addresses. Put in your own details first, then email it to yourself.',
  botCheckWait: 'The bot check has not finished. Give it a second.', botCheckFailed: 'The bot check could not load. Reload the page and try again.',
  sentToYou: 'Sent to {email}. Forward that email to your client. Nothing was stored on anupress.com.', couldNot: 'Not sent: {why}',
  sendingOff: 'Emailing from this page is switched off at the moment. Download the PDF instead.',
};

const DE = {
  yourBusiness: 'Ihr Unternehmen', yourClient: 'Ihr Kunde', theDocument: 'Das Dokument',
  items: 'Was Sie abrechnen', moneyTax: 'Beträge und Steuer', howTheyPay: 'So bezahlt man Sie',
  whatItSays: 'Was darauf steht',
  businessName: 'Firmenname', name: 'Name', email: 'E-Mail', phone: 'Telefon', street: 'Straße',
  street2: 'Straße, zweite Zeile', city: 'Ort', postcode: 'PLZ', region: 'Bundesland oder Region',
  country: 'Land', countryHint: 'Zwei Buchstaben. Entscheidet über die steuerliche Behandlung.', website: 'Website',
  taxIdHint: 'Eine USt-IdNr. hier und beim Kunden schaltet das EU-Reverse-Charge-Verfahren von selbst ein.',
  legalLine: 'Pflichtangaben in der Fußzeile', legalLineHint: 'Handelsregister, Gericht, Geschäftsführung. Klein am Fuß gedruckt.',
  logo: 'Logo', logoHint: 'PNG oder JPEG. Wird verkleinert und nur in diesem Browser behalten, nie hochgeladen.',
  logoError: 'Diese Datei ließ sich nicht als Bild lesen. PNG und JPEG funktionieren.', chooseLogo: 'Logo auswählen',
  logoAlt: 'Ihr Logo, so wie es gedruckt wird', remove: 'Entfernen',
  logoSize: 'Größe', logoSmall: 'Klein', logoNormal: 'Normal', logoLarge: 'Groß',
  logoPlate: 'Weiße Fläche hinter dem Logo auf farbigen Layouts',
  logoPlateHint: 'Bei einem dunklen Logo von selbst an, bei einem hellen aus. Ein für weißes Papier gezeichnetes Logo verschwindet sonst auf einem dunklen Band.',
  logoOnly: 'Das Logo trägt den Namen', logoOnlyHint: 'Der Kopf zeigt nur das Logo; Ihr Name steht weiterhin im Absenderblock.',
  accent: 'Akzentfarbe', accentHint: 'Linien, Überschriften und der Kopf folgen ihr.', useDefault: 'Standard verwenden',
  theirTax: 'USt-IdNr. des Kunden', language: 'Sprache', followDocument: 'Wie in der Dokumenteinstellung',
  languageHint: 'Das Dokument wird in der Sprache des Kunden geschrieben; Ihre eigenen Texte werden nie übersetzt.',
  number: 'Nummer', issued: 'Rechnungsdatum', due: 'Fällig', serviceDate: 'Leistungs- oder Lieferdatum',
  serviceDateHint: 'Nach § 14 UStG Pflicht, und eine XRechnung wird ohne abgelehnt.',
  rulebook: 'Regelwerk für die E-Rechnung', rulebookNone: 'Keines — ein normales PDF genügt',
  rulebookHint: 'Mit Regelwerk prüft die Schaltfläche E-Rechnung das Dokument vor dem Erstellen der Datei.',
  leitweg: 'Leitweg-ID oder Käuferreferenz', leitwegHint: 'Eine deutsche Behörde nimmt eine XRechnung ohne die vergebene Leitweg-ID nicht an.',
  currency: 'Währung', howTax: 'So wird die Steuer berechnet', taxSimple: 'Ein Satz, den ich eintrage',
  taxPreset: 'Eine Tabelle nach Ländern', taxNone: 'Keine Steuer', ratePercent: 'Satz in Prozent',
  taxCustom: 'Eigene Sätze, selbst eingetragen', yourRates: 'Ihre Steuersätze',
  customHint: 'Eine Zeile je Satz. Land und Region leer lassen für einen Satz, der überall gilt; eine Zeile mit Land gewinnt gegen eine ohne. Die Sätze prüfen Sie selbst.',
  rowCountry: 'Land', rowRegion: 'Region', rowRate: 'Satz %', rowName: 'Bezeichnung', rowAnywhere: 'überall',
  addRow: 'Satz hinzufügen', removeRow: 'Diesen Satz entfernen',
  taxName: 'Bezeichnung', taxNameHint: 'MwSt., USt., TVA — wie es in Ihrem Land heißt.',
  rateTable: 'Steuertabelle', rateTableHint: 'Sätze sind ein Ausgangspunkt und ändern sich. Keine Steuerberatung.',
  yourCountry: 'Ihr Land', yourRegion: 'Ihr Bundesland oder Ihre Region',
  pricesInclude: 'Preise enthalten bereits die Steuer', pricesIncludeHint: 'Was im Laden am Regal steht, zahlt der Kunde.',
  discount: 'Rabatt', discountFor: 'Wofür der Rabatt ist', discountPlaceholder: 'Einführungsrabatt',
  shipping: 'Lieferung oder Versand', alreadyPaid: 'Bereits bezahlt', alreadyPaidHint: 'Lässt den noch offenen Betrag auf dem Dokument stehen.',
  ibanHint: 'Ein Euro-Dokument mit IBAN trägt den GiroCode, den Banking-Apps scannen.',
  accountHolder: 'Kontoinhaber', upi: 'UPI-ID', upiHint: 'Für Dokumente in Rupien.',
  paymentLink: 'Zahlungslink', paymentLinkHint: 'Ihre Stripe- oder PayPal-Seite. Für jede Währung.',
  paidFor: 'Die Felder für ein Unternehmen mit Bankkonto in {country}. Das Land ändern Sie unter Ihr Unternehmen.',
  accountNumber: 'Kontonummer', sortCode: 'Sort code', routingNumber: 'Routing number (ABA)', bsb: 'BSB',
  ifsc: 'IFSC-Code', transitNumber: 'Transit- und Institutsnummer', bankCode: 'Bankleitzahl', bankName: 'Bank',
  bic: 'BIC / SWIFT', abroadHint: 'Für Kunden, die aus dem Ausland zahlen.',
  accountHolderHint: 'Leer gelassen wird Ihr Firmenname verwendet.',
  ibanNonEuroHint: 'Wird unter den Summen gedruckt. Der SEPA-Code für Banking-Apps erscheint auf Euro-Dokumenten.',
  howToPay: 'Zahlungshinweis', howToPayHint: 'Wird wie eingegeben unter den Summen gedruckt.',
  terms: 'Zahlungsbedingungen', note: 'Hinweis auf diesem Dokument', closing: 'Schlusszeile',
  closingHint: 'Auf jedem Dokument, das Sie erstellen, gleich.',
  creditKeep: 'Die Zeile behalten, die sagt, wo dies erstellt wurde',
  creditHint: 'Eine kleine Zeile ganz unten, in der Sprache des Dokuments. Sie hält das Werkzeug kostenlos und unbegrenzt, und Sie dürfen sie entfernen.',
  document: 'Dokument', layout: 'Layout', docLanguage: 'Sprache', paper: 'Papier', density: 'Dichte',
  compact: 'Kompakt', normal: 'Normal', roomy: 'Großzügig',
  print: 'Drucken', downloadHtml: 'HTML-Datei', einvoice: 'E-Rechnung', einvoiceFormat: 'Format der E-Rechnung',
  downloadPdf: 'PDF herunterladen',
  a4: 'A4', letter: 'US Letter', legal: 'US Legal', a5: 'A5', receipt80: 'Bonrolle, 80 mm', receipt58: 'Bonrolle, 58 mm',
  setUpFor: 'Einrichten für', chooseTrade: 'Branche wählen…', convertTo: 'Umwandeln in', choose: 'Wählen…',
  fillExample: 'Mit Beispiel füllen', newDocument: 'Neues Dokument', saveFile: 'Meine Daten als Datei sichern',
  loadFile: 'Datendatei laden', forget: 'Meine Daten vergessen', setsUp: 'Richtet ein:',
  edit: 'Bearbeiten', preview: 'Vorschau',
  interfaceLanguage: 'Sprache dieses Werkzeugs', switchedLanguage: 'Das Werkzeug spricht jetzt Deutsch. Ihr Dokument bleibt unverändert.',
  whatIsThis: 'Wofür ist das?', aboutField: 'Hinweis zu: {label}', closeTip: 'Schließen',
  sectionFilled: 'Ausgefüllt', sectionEmpty: 'Noch nichts eingetragen', documentSetup: 'Dokument',
  moreSettings: 'Sprache, Papier und Abstände', closeSettings: 'Fertig',
  footRemembered: 'Alles hier geschieht in Ihrem Browser. Ihre Firmendaten bleiben in diesem Browser, damit Sie sie nicht neu eingeben; das Dokument wird beim Schließen des Tabs verworfen. Nichts wird hochgeladen, und anupress.com behält keine Kopie.',
  footFresh: 'Alles hier geschieht in Ihrem Browser. Nichts wird hochgeladen, und anupress.com behält keine Kopie von dem, was Sie eingeben.',
  filledExample: 'Mit einem Beispiel gefüllt. Ändern Sie, was Sie möchten, oder beginnen Sie neu.',
  blankDoc: 'Ein leeres Dokument. Ihre eigenen Daten sind noch da.',
  forgotten: 'Vergessen. In diesem Browser ist nichts von Ihnen mehr, und anderswo gab es nie eine Kopie.',
  downloaded: '{name} heruntergeladen.',
  validateFirst: '{name} heruntergeladen. Prüfen Sie die erste Datei mit dem Validator Ihres Empfängers, wie jeder Absender.',
  pdfFailed: 'Das PDF konnte nicht erstellt werden: {why}', einvFailed: 'Die E-Rechnung konnte nicht erstellt werden: {why}',
  fileFailed: 'Die Datei konnte nicht erstellt werden: {why}', unknownWhy: 'unbekannter Grund',
  wouldBeRejected: 'Diese Datei würde vom Empfänger abgelehnt. Bitte zuerst beheben:',
  mayAsk: '{name} heruntergeladen. Ein Empfänger könnte noch nachfragen wegen:',
  converted: 'Jetzt {kind}{ref}, mit eigener Nummer.', referringTo: ', bezogen auf {ref}',
  kitSaved: '{name} gespeichert. Laden Sie die Datei auf jedem Gerät, und Ihre Daten und Nummerierung laufen weiter.',
  kitLoaded: 'Geladen. Ihre Daten sind zurück, und die nächste Nummer folgt auf die zuletzt vergebene.',
  notKit: 'Das ist keine Datendatei aus diesem Werkzeug.',
  _lang: 'de',
  emailIt: 'An mich senden', closeDialog: 'Schließen', cancel: 'Abbrechen', send: 'Senden', sending: 'Wird gesendet…',
  selfIntro: 'Wir schicken die Datei an Sie und an niemanden sonst. Die E-Mail leiten Sie dann einfach aus Ihrem eigenen Postfach an Ihren Kunden weiter. So sieht er Ihre Adresse als Absender.',
  yourEmail: 'Ihre E-Mail-Adresse', yourEmailHint: 'Beim ersten Mal schicken wir Ihnen einen Code. Damit prüfen wir, ob die Adresse wirklich Ihnen gehört. Danach merkt sich dieser Browser die Adresse einen Monat lang.',
  sendCode: 'Code an mich senden', codeLabel: 'Der Code aus Ihrer E-Mail', codeHint: 'Sechs Ziffern, zehn Minuten gültig.',
  codeSent: 'Ein Code ist unterwegs an {email}. Bitte unten eingeben.', verifiedAs: 'Dieser Browser kennt {email} schon. Kein Code nötig.',
  attach: 'Datei', needCode: 'Geben Sie den Code aus der E-Mail ein oder fordern Sie einen an.', emailInvalid: 'Geben Sie zuerst Ihre E-Mail-Adresse ein.',
  exampleData: 'Das ist noch das Beispiel mit erfundenen Adressen. Tragen Sie zuerst Ihre eigenen Daten ein, dann können Sie sich die Datei schicken.',
  botCheckWait: 'Die Bot-Prüfung ist noch nicht fertig. Einen Moment bitte.', botCheckFailed: 'Die Bot-Prüfung konnte nicht geladen werden. Bitte Seite neu laden.',
  sentToYou: 'Gesendet an {email}. Von dort leiten Sie die E-Mail an Ihren Kunden weiter. Gespeichert haben wir nichts.', couldNot: 'Nicht gesendet: {why}',
  sendingOff: 'Von dieser Seite können wir gerade nichts verschicken. Laden Sie stattdessen das PDF herunter.',
};

const TABLE = { en: EN, de: DE };

/** The languages the form itself speaks. Fewer than the document; more as they are written. */
export const UI_LANGUAGES = Object.keys(TABLE);

/** Each language's name in its own words, for the switch. Never "German" to a German reader. */
export const UI_LANGUAGE_NAMES = { en: 'English', de: 'Deutsch' };

/**
 * Where a visitor's choice of language is kept.
 *
 * The same key the site's calculators and PDF tools use, so choosing German once carries across
 * every tool on anupress.com instead of being asked again on each page.
 */
const LANG_KEY = 'apws-lang';

const known = (v) => (TABLE[String(v || '').slice(0, 2).toLowerCase()] ? String(v).slice(0, 2).toLowerCase() : '');

/**
 * Which language the form speaks.
 *
 * In order: `?lang=` in the address (a link can pin it), then the visitor's own earlier choice,
 * then the page's `data-ui` (a German page defaults to German), then the browser. The visitor's
 * choice outranks the page because it is the one decision a person actually made; the document's
 * language chooser is a separate thing and never flips the form.
 */
export function uiLanguage(host) {
  try {
    const q = new URLSearchParams(window.location.search).get('lang');
    if (known(q)) return known(q);
  } catch { /* no URL to read */ }
  try {
    const saved = window.localStorage.getItem(LANG_KEY);
    if (known(saved)) return known(saved);
  } catch { /* storage blocked, as in a private window */ }
  const pinned = known(host && host.dataset && host.dataset.ui);
  if (pinned) return pinned;
  return known(typeof navigator !== 'undefined' ? navigator.language : '') || 'en';
}

/** Remember a chosen language for the next tool and the next visit. Never fatal. */
export function rememberLang(lang) {
  if (!TABLE[lang]) return;
  try { window.localStorage.setItem(LANG_KEY, lang); } catch { /* nothing to do about it */ }
}

/** A translator for one language: t('key') and t('key', { name }) for the placeholders. */
export function translator(lang) {
  const table = TABLE[lang] || EN;
  return (key, values) => {
    let s = table[key] != null ? table[key] : (EN[key] != null ? EN[key] : key);
    if (values) for (const [k, v] of Object.entries(values)) s = s.split(`{${k}}`).join(String(v));
    return s;
  };
}
