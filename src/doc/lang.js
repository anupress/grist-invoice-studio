// The words on the document, in the client's language.
//
// A German client receiving "Invoice" instead of "Rechnung" reads it as a foreign document, and a
// French accounts department files a "Facture" and queries anything else. The words a document
// carries are few — the kind, the dates, the column headings, the totals — and they are the same
// few on every layout, so they live here once and every renderer reads them from ./fields.js.
//
// What is NOT translated: the person's own text (notes, terms, payment details), the covering
// email (its wording is edited per business in Settings → Messages), and the application around
// the document. Only the document speaks to the client.
//
// Which language: the document's own, then the client record's, then the business's default. A
// business in Berlin invoicing Paris sets its default to German and marks the French client as
// French; nothing has to be chosen per invoice.

export const LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'de', label: 'Deutsch' },
  { id: 'fr', label: 'Français' },
  { id: 'es', label: 'Español' },
  { id: 'it', label: 'Italiano' },
  { id: 'nl', label: 'Nederlands' },
  { id: 'pl', label: 'Polski' },
  { id: 'pt', label: 'Português' },
];

const IDS = new Set(LANGUAGES.map((l) => l.id));

// Names people type into a Language column, mapped to a code. Case-insensitive, and a locale
// such as "de-AT" or "pt_BR" reduces to its language.
const NAMES = {
  english: 'en', englisch: 'en', anglais: 'en',
  german: 'de', deutsch: 'de', allemand: 'de', alemán: 'de',
  french: 'fr', français: 'fr', francais: 'fr', französisch: 'fr',
  spanish: 'es', español: 'es', espanol: 'es', castellano: 'es',
  italian: 'it', italiano: 'it',
  dutch: 'nl', nederlands: 'nl', flemish: 'nl', vlaams: 'nl',
  polish: 'pl', polski: 'pl',
  portuguese: 'pt', português: 'pt', portugues: 'pt',
};

/** A code from whatever was typed: "de", "DE", "de-AT", "German", "Deutsch". Empty when unknown. */
export function normaliseLanguage(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  if (!s) return '';
  const code = s.split(/[-_]/)[0];
  if (IDS.has(code)) return code;
  return NAMES[s] || '';
}

/** The language a document is in: its own, then its client's, then the business default. */
export function languageOf(draft, settings = {}) {
  return normaliseLanguage(draft?.language)
    || normaliseLanguage(draft?.client?.language)
    || normaliseLanguage(settings.language)
    || 'en';
}

// ---------------------------------------------------------------------------------------------
// The dictionary. English is complete; every other language falls back to it per key, so a
// missing word is an English word rather than "undefined" on the face of an invoice.
// ---------------------------------------------------------------------------------------------

const EN = {
  kinds: {
    quote: 'Quote', proforma: 'Proforma invoice', invoice: 'Invoice', receipt: 'Receipt',
    credit_note: 'Credit note', statement: 'Statement of account', delivery_note: 'Delivery note', packing_slip: 'Packing slip',
  },
  issued: {
    quote: 'Issued', proforma: 'Issued', invoice: 'Issued', receipt: 'Issued', credit_note: 'Issued',
    statement: 'As at', delivery_note: 'Dispatched', packing_slip: 'Packed',
  },
  second: { quote: 'Valid until', proforma: 'Payable by', invoice: 'Due', receipt: 'Paid' },
  totalLabel: {
    quote: 'Total', proforma: 'Amount payable', invoice: 'Amount due', receipt: 'Amount paid',
    credit_note: 'Credit', statement: 'Balance outstanding',
  },
  legend: {
    quote: 'This is a quotation, not a request for payment. Prices are valid until the date shown.',
    proforma: 'This is a proforma invoice and not a tax invoice. A tax invoice will follow on payment.',
    credit_note: 'This credit note reverses the charges shown. It is not a request for payment.',
  },
  creditAgainst: 'This credit note reverses charges on {ref}. It is not a request for payment.',
  from: 'From', billTo: 'Bill to', deliverTo: 'Deliver to', shipTo: 'Ship to',
  taxId: 'Tax ID', yourReference: 'Your reference', refersTo: 'Refers to', serviceDate: 'Service date',
  columns: {
    description: 'Description', hsn: 'HSN/SAC', date: 'Date', reference: 'Reference', charge: 'Charge',
    paid: 'Paid', balance: 'Balance', quantity: 'Qty', unit: 'Unit', unitPrice: 'Unit price',
    discount: 'Discount', amount: 'Amount', image: 'Image',
  },
  subtotal: 'Subtotal', discount: 'Discount', shipping: 'Shipping', total: 'Total', totalCredit: 'Total credit',
  paid: 'Paid', tax: 'Tax',
  note: 'Note', paymentTerms: 'Payment terms', howToPay: 'How to pay', receivedBy: 'Received by',
  pageOf: 'Page {n} of {m}', continued: '{word} {number} — continued',
  reverseCharge: 'Reverse charge — VAT to be accounted for by the recipient (Art. 196, Directive 2006/112/EC)',
  notSubjectToTax: 'Not subject to tax', taxOff: 'Tax is switched off for this document',
  scanToPay: 'Scan to pay', paymentReference: 'Payment reference', payOnline: 'Pay online',
  status: {
    draft: 'Draft', sent: 'Sent', 'part paid': 'Part paid', paid: 'Paid', overdue: 'Overdue', cancelled: 'Cancelled',
  },
};

const DE = {
  kinds: {
    quote: 'Angebot', proforma: 'Proformarechnung', invoice: 'Rechnung', receipt: 'Quittung',
    credit_note: 'Gutschrift', statement: 'Kontoauszug', delivery_note: 'Lieferschein', packing_slip: 'Packzettel',
  },
  issued: {
    quote: 'Ausgestellt', proforma: 'Ausgestellt', invoice: 'Rechnungsdatum', receipt: 'Ausgestellt', credit_note: 'Ausgestellt',
    statement: 'Stand', delivery_note: 'Versandt am', packing_slip: 'Verpackt am',
  },
  second: { quote: 'Gültig bis', proforma: 'Zahlbar bis', invoice: 'Fällig am', receipt: 'Bezahlt am' },
  totalLabel: {
    quote: 'Gesamt', proforma: 'Zahlbetrag', invoice: 'Fälliger Betrag', receipt: 'Gezahlter Betrag',
    credit_note: 'Gutschrift', statement: 'Offener Saldo',
  },
  legend: {
    quote: 'Dies ist ein Angebot und keine Zahlungsaufforderung. Die Preise gelten bis zum angegebenen Datum.',
    proforma: 'Dies ist eine Proformarechnung und keine Rechnung im umsatzsteuerlichen Sinne. Die Rechnung folgt nach Zahlungseingang.',
    credit_note: 'Diese Gutschrift storniert die aufgeführten Beträge. Sie ist keine Zahlungsaufforderung.',
  },
  creditAgainst: 'Diese Gutschrift storniert Beträge aus {ref}. Sie ist keine Zahlungsaufforderung.',
  from: 'Von', billTo: 'Rechnungsempfänger', deliverTo: 'Lieferung an', shipTo: 'Lieferadresse',
  taxId: 'USt-IdNr.', yourReference: 'Ihre Referenz', refersTo: 'Bezug', serviceDate: 'Leistungsdatum',
  columns: {
    description: 'Beschreibung', hsn: 'HSN/SAC', date: 'Datum', reference: 'Referenz', charge: 'Belastung',
    paid: 'Gezahlt', balance: 'Saldo', quantity: 'Menge', unit: 'Einheit', unitPrice: 'Einzelpreis',
    discount: 'Rabatt', amount: 'Betrag', image: 'Bild',
  },
  subtotal: 'Zwischensumme', discount: 'Rabatt', shipping: 'Versand', total: 'Gesamtbetrag', totalCredit: 'Gutschrift gesamt',
  paid: 'Bezahlt', tax: 'Steuer',
  note: 'Hinweis', paymentTerms: 'Zahlungsbedingungen', howToPay: 'Zahlungsinformationen', receivedBy: 'Empfangen von',
  pageOf: 'Seite {n} von {m}', continued: '{word} {number} — Fortsetzung',
  reverseCharge: 'Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge, Art. 196 MwStSystRL)',
  notSubjectToTax: 'Nicht steuerbar', taxOff: 'Für dieses Dokument wird keine Steuer berechnet',
  scanToPay: 'Zum Bezahlen scannen', paymentReference: 'Verwendungszweck', payOnline: 'Online bezahlen',
  status: { draft: 'Entwurf', sent: 'Gesendet', 'part paid': 'Teilweise bezahlt', paid: 'Bezahlt', overdue: 'Überfällig', cancelled: 'Storniert' },
};

const FR = {
  kinds: {
    quote: 'Devis', proforma: 'Facture pro forma', invoice: 'Facture', receipt: 'Reçu',
    credit_note: 'Avoir', statement: 'Relevé de compte', delivery_note: 'Bon de livraison', packing_slip: 'Bordereau de colisage',
  },
  issued: {
    quote: 'Émis le', proforma: 'Émis le', invoice: 'Date de facture', receipt: 'Émis le', credit_note: 'Émis le',
    statement: 'Arrêté au', delivery_note: 'Expédié le', packing_slip: 'Emballé le',
  },
  second: { quote: 'Valable jusqu’au', proforma: 'Payable avant le', invoice: 'Échéance', receipt: 'Payé le' },
  totalLabel: {
    quote: 'Total', proforma: 'Montant à payer', invoice: 'Montant dû', receipt: 'Montant payé',
    credit_note: 'Avoir', statement: 'Solde dû',
  },
  legend: {
    quote: 'Ceci est un devis et non une demande de paiement. Les prix sont valables jusqu’à la date indiquée.',
    proforma: 'Ceci est une facture pro forma et non une facture définitive. La facture sera émise à réception du paiement.',
    credit_note: 'Cet avoir annule les montants indiqués. Il ne constitue pas une demande de paiement.',
  },
  creditAgainst: 'Cet avoir annule des montants de {ref}. Il ne constitue pas une demande de paiement.',
  from: 'De', billTo: 'Facturer à', deliverTo: 'Livrer à', shipTo: 'Adresse de livraison',
  taxId: 'N° TVA', yourReference: 'Votre référence', refersTo: 'Référence', serviceDate: 'Date de prestation',
  columns: {
    description: 'Désignation', hsn: 'HSN/SAC', date: 'Date', reference: 'Référence', charge: 'Débit',
    paid: 'Payé', balance: 'Solde', quantity: 'Qté', unit: 'Unité', unitPrice: 'Prix unitaire',
    discount: 'Remise', amount: 'Montant', image: 'Image',
  },
  subtotal: 'Sous-total', discount: 'Remise', shipping: 'Livraison', total: 'Total', totalCredit: 'Total de l’avoir',
  paid: 'Payé', tax: 'Taxe',
  note: 'Note', paymentTerms: 'Conditions de paiement', howToPay: 'Modalités de paiement', receivedBy: 'Reçu par',
  pageOf: 'Page {n} sur {m}', continued: '{word} {number} — suite',
  reverseCharge: 'Autoliquidation — TVA due par le preneur (art. 196, directive 2006/112/CE)',
  notSubjectToTax: 'Non soumis à la TVA', taxOff: 'Aucune taxe n’est appliquée à ce document',
  scanToPay: 'Scanner pour payer', paymentReference: 'Référence de paiement', payOnline: 'Payer en ligne',
  status: { draft: 'Brouillon', sent: 'Envoyée', 'part paid': 'Partiellement payée', paid: 'Payée', overdue: 'En retard', cancelled: 'Annulée' },
};

const ES = {
  kinds: {
    quote: 'Presupuesto', proforma: 'Factura proforma', invoice: 'Factura', receipt: 'Recibo',
    credit_note: 'Nota de crédito', statement: 'Estado de cuenta', delivery_note: 'Albarán de entrega', packing_slip: 'Lista de embalaje',
  },
  issued: {
    quote: 'Emitido', proforma: 'Emitido', invoice: 'Fecha de factura', receipt: 'Emitido', credit_note: 'Emitido',
    statement: 'A fecha', delivery_note: 'Enviado', packing_slip: 'Embalado',
  },
  second: { quote: 'Válido hasta', proforma: 'Pagadero antes del', invoice: 'Vencimiento', receipt: 'Pagado' },
  totalLabel: {
    quote: 'Total', proforma: 'Importe a pagar', invoice: 'Importe pendiente', receipt: 'Importe pagado',
    credit_note: 'Crédito', statement: 'Saldo pendiente',
  },
  legend: {
    quote: 'Este documento es un presupuesto, no una solicitud de pago. Los precios son válidos hasta la fecha indicada.',
    proforma: 'Esta es una factura proforma y no una factura fiscal. La factura definitiva se emitirá tras el pago.',
    credit_note: 'Esta nota de crédito anula los importes indicados. No es una solicitud de pago.',
  },
  creditAgainst: 'Esta nota de crédito anula importes de {ref}. No es una solicitud de pago.',
  from: 'De', billTo: 'Facturar a', deliverTo: 'Entregar a', shipTo: 'Dirección de envío',
  taxId: 'NIF', yourReference: 'Su referencia', refersTo: 'Referencia', serviceDate: 'Fecha de prestación',
  columns: {
    description: 'Descripción', hsn: 'HSN/SAC', date: 'Fecha', reference: 'Referencia', charge: 'Cargo',
    paid: 'Pagado', balance: 'Saldo', quantity: 'Cant.', unit: 'Unidad', unitPrice: 'Precio unitario',
    discount: 'Descuento', amount: 'Importe', image: 'Imagen',
  },
  subtotal: 'Subtotal', discount: 'Descuento', shipping: 'Envío', total: 'Total', totalCredit: 'Total del abono',
  paid: 'Pagado', tax: 'Impuesto',
  note: 'Nota', paymentTerms: 'Condiciones de pago', howToPay: 'Forma de pago', receivedBy: 'Recibido por',
  pageOf: 'Página {n} de {m}', continued: '{word} {number} — continuación',
  reverseCharge: 'Inversión del sujeto pasivo — IVA a cargo del destinatario (art. 196, Directiva 2006/112/CE)',
  notSubjectToTax: 'No sujeto a impuestos', taxOff: 'No se aplican impuestos a este documento',
  scanToPay: 'Escanee para pagar', paymentReference: 'Concepto', payOnline: 'Pagar en línea',
  status: { draft: 'Borrador', sent: 'Enviada', 'part paid': 'Pagada en parte', paid: 'Pagada', overdue: 'Vencida', cancelled: 'Anulada' },
};

const IT = {
  kinds: {
    quote: 'Preventivo', proforma: 'Fattura proforma', invoice: 'Fattura', receipt: 'Ricevuta',
    credit_note: 'Nota di credito', statement: 'Estratto conto', delivery_note: 'Documento di trasporto', packing_slip: 'Distinta di imballaggio',
  },
  issued: {
    quote: 'Emesso il', proforma: 'Emesso il', invoice: 'Data fattura', receipt: 'Emesso il', credit_note: 'Emesso il',
    statement: 'Al', delivery_note: 'Spedito il', packing_slip: 'Imballato il',
  },
  second: { quote: 'Valido fino al', proforma: 'Pagabile entro il', invoice: 'Scadenza', receipt: 'Pagato il' },
  totalLabel: {
    quote: 'Totale', proforma: 'Importo da pagare', invoice: 'Importo dovuto', receipt: 'Importo pagato',
    credit_note: 'Credito', statement: 'Saldo dovuto',
  },
  legend: {
    quote: 'Questo è un preventivo, non una richiesta di pagamento. I prezzi sono validi fino alla data indicata.',
    proforma: 'Questa è una fattura proforma e non una fattura fiscale. La fattura sarà emessa al pagamento.',
    credit_note: 'Questa nota di credito storna gli importi indicati. Non è una richiesta di pagamento.',
  },
  creditAgainst: 'Questa nota di credito storna importi di {ref}. Non è una richiesta di pagamento.',
  from: 'Da', billTo: 'Fatturare a', deliverTo: 'Consegnare a', shipTo: 'Indirizzo di spedizione',
  taxId: 'P.IVA', yourReference: 'Vostro riferimento', refersTo: 'Riferimento', serviceDate: 'Data della prestazione',
  columns: {
    description: 'Descrizione', hsn: 'HSN/SAC', date: 'Data', reference: 'Riferimento', charge: 'Addebito',
    paid: 'Pagato', balance: 'Saldo', quantity: 'Q.tà', unit: 'Unità', unitPrice: 'Prezzo unitario',
    discount: 'Sconto', amount: 'Importo', image: 'Immagine',
  },
  subtotal: 'Subtotale', discount: 'Sconto', shipping: 'Spedizione', total: 'Totale', totalCredit: 'Totale nota di credito',
  paid: 'Pagato', tax: 'Imposta',
  note: 'Note', paymentTerms: 'Condizioni di pagamento', howToPay: 'Modalità di pagamento', receivedBy: 'Ricevuto da',
  pageOf: 'Pagina {n} di {m}', continued: '{word} {number} — continua',
  reverseCharge: 'Inversione contabile — IVA a carico del destinatario (art. 196, Direttiva 2006/112/CE)',
  notSubjectToTax: 'Non soggetto a imposta', taxOff: 'Nessuna imposta applicata a questo documento',
  scanToPay: 'Scansiona per pagare', paymentReference: 'Causale', payOnline: 'Paga online',
  status: { draft: 'Bozza', sent: 'Inviata', 'part paid': 'Pagata in parte', paid: 'Pagata', overdue: 'Scaduta', cancelled: 'Annullata' },
};

const NL = {
  kinds: {
    quote: 'Offerte', proforma: 'Pro-formafactuur', invoice: 'Factuur', receipt: 'Kwitantie',
    credit_note: 'Creditnota', statement: 'Rekeningoverzicht', delivery_note: 'Pakbon', packing_slip: 'Paklijst',
  },
  issued: {
    quote: 'Datum', proforma: 'Datum', invoice: 'Factuurdatum', receipt: 'Datum', credit_note: 'Datum',
    statement: 'Per', delivery_note: 'Verzonden op', packing_slip: 'Verpakt op',
  },
  second: { quote: 'Geldig tot', proforma: 'Te betalen vóór', invoice: 'Vervaldatum', receipt: 'Betaald op' },
  totalLabel: {
    quote: 'Totaal', proforma: 'Te betalen', invoice: 'Verschuldigd bedrag', receipt: 'Betaald bedrag',
    credit_note: 'Credit', statement: 'Openstaand saldo',
  },
  legend: {
    quote: 'Dit is een offerte, geen betalingsverzoek. De prijzen gelden tot de vermelde datum.',
    proforma: 'Dit is een pro-formafactuur, geen btw-factuur. De factuur volgt na betaling.',
    credit_note: 'Deze creditnota maakt de vermelde bedragen ongedaan. Het is geen betalingsverzoek.',
  },
  creditAgainst: 'Deze creditnota maakt bedragen van {ref} ongedaan. Het is geen betalingsverzoek.',
  from: 'Van', billTo: 'Factuuradres', deliverTo: 'Afleveren aan', shipTo: 'Afleveradres',
  taxId: 'Btw-nummer', yourReference: 'Uw referentie', refersTo: 'Betreft', serviceDate: 'Leveringsdatum',
  columns: {
    description: 'Omschrijving', hsn: 'HSN/SAC', date: 'Datum', reference: 'Referentie', charge: 'Debet',
    paid: 'Betaald', balance: 'Saldo', quantity: 'Aantal', unit: 'Eenheid', unitPrice: 'Stukprijs',
    discount: 'Korting', amount: 'Bedrag', image: 'Afbeelding',
  },
  subtotal: 'Subtotaal', discount: 'Korting', shipping: 'Verzending', total: 'Totaal', totalCredit: 'Totaal credit',
  paid: 'Betaald', tax: 'Belasting',
  note: 'Opmerking', paymentTerms: 'Betalingsvoorwaarden', howToPay: 'Betaalwijze', receivedBy: 'Ontvangen door',
  pageOf: 'Pagina {n} van {m}', continued: '{word} {number} — vervolg',
  reverseCharge: 'Btw verlegd — btw verschuldigd door de afnemer (art. 196, Richtlijn 2006/112/EG)',
  notSubjectToTax: 'Niet belastbaar', taxOff: 'Op dit document wordt geen belasting berekend',
  scanToPay: 'Scan om te betalen', paymentReference: 'Betalingskenmerk', payOnline: 'Online betalen',
  status: { draft: 'Concept', sent: 'Verzonden', 'part paid': 'Deels betaald', paid: 'Betaald', overdue: 'Te laat', cancelled: 'Geannuleerd' },
};

const PL = {
  kinds: {
    quote: 'Oferta', proforma: 'Faktura pro forma', invoice: 'Faktura', receipt: 'Pokwitowanie',
    credit_note: 'Faktura korygująca', statement: 'Wyciąg z konta', delivery_note: 'Dowód dostawy', packing_slip: 'Lista pakowa',
  },
  issued: {
    quote: 'Data wystawienia', proforma: 'Data wystawienia', invoice: 'Data wystawienia', receipt: 'Data wystawienia', credit_note: 'Data wystawienia',
    statement: 'Stan na', delivery_note: 'Wysłano', packing_slip: 'Zapakowano',
  },
  second: { quote: 'Ważna do', proforma: 'Płatne do', invoice: 'Termin płatności', receipt: 'Zapłacono' },
  totalLabel: {
    quote: 'Razem', proforma: 'Do zapłaty', invoice: 'Do zapłaty', receipt: 'Zapłacono',
    credit_note: 'Kwota korekty', statement: 'Saldo do zapłaty',
  },
  legend: {
    quote: 'To jest oferta, a nie wezwanie do zapłaty. Ceny obowiązują do podanej daty.',
    proforma: 'To jest faktura pro forma, a nie faktura VAT. Faktura zostanie wystawiona po zapłacie.',
    credit_note: 'Ta korekta anuluje wskazane kwoty. Nie jest wezwaniem do zapłaty.',
  },
  creditAgainst: 'Ta korekta anuluje kwoty z dokumentu {ref}. Nie jest wezwaniem do zapłaty.',
  from: 'Sprzedawca', billTo: 'Nabywca', deliverTo: 'Odbiorca', shipTo: 'Adres dostawy',
  taxId: 'NIP', yourReference: 'Państwa numer', refersTo: 'Dotyczy', serviceDate: 'Data wykonania',
  columns: {
    description: 'Opis', hsn: 'HSN/SAC', date: 'Data', reference: 'Numer', charge: 'Obciążenie',
    paid: 'Zapłacono', balance: 'Saldo', quantity: 'Ilość', unit: 'J.m.', unitPrice: 'Cena jedn.',
    discount: 'Rabat', amount: 'Wartość', image: 'Zdjęcie',
  },
  subtotal: 'Suma netto', discount: 'Rabat', shipping: 'Dostawa', total: 'Razem', totalCredit: 'Razem korekta',
  paid: 'Zapłacono', tax: 'Podatek',
  note: 'Uwagi', paymentTerms: 'Warunki płatności', howToPay: 'Sposób płatności', receivedBy: 'Odebrał(a)',
  pageOf: 'Strona {n} z {m}', continued: '{word} {number} — ciąg dalszy',
  reverseCharge: 'Odwrotne obciążenie — VAT rozlicza nabywca (art. 196 dyrektywy 2006/112/WE)',
  notSubjectToTax: 'Nie podlega opodatkowaniu', taxOff: 'Do tego dokumentu nie naliczono podatku',
  scanToPay: 'Zeskanuj, aby zapłacić', paymentReference: 'Tytuł przelewu', payOnline: 'Zapłać online',
  status: { draft: 'Szkic', sent: 'Wysłana', 'part paid': 'Częściowo zapłacona', paid: 'Zapłacona', overdue: 'Przeterminowana', cancelled: 'Anulowana' },
};

const PT = {
  kinds: {
    quote: 'Orçamento', proforma: 'Fatura pró-forma', invoice: 'Fatura', receipt: 'Recibo',
    credit_note: 'Nota de crédito', statement: 'Extrato de conta', delivery_note: 'Guia de entrega', packing_slip: 'Lista de embalagem',
  },
  issued: {
    quote: 'Emitido em', proforma: 'Emitido em', invoice: 'Data da fatura', receipt: 'Emitido em', credit_note: 'Emitido em',
    statement: 'Em', delivery_note: 'Expedido em', packing_slip: 'Embalado em',
  },
  second: { quote: 'Válido até', proforma: 'Pagar até', invoice: 'Vencimento', receipt: 'Pago em' },
  totalLabel: {
    quote: 'Total', proforma: 'Valor a pagar', invoice: 'Valor em dívida', receipt: 'Valor pago',
    credit_note: 'Crédito', statement: 'Saldo em dívida',
  },
  legend: {
    quote: 'Este documento é um orçamento, não um pedido de pagamento. Os preços são válidos até à data indicada.',
    proforma: 'Esta é uma fatura pró-forma e não uma fatura fiscal. A fatura será emitida após o pagamento.',
    credit_note: 'Esta nota de crédito anula os valores indicados. Não é um pedido de pagamento.',
  },
  creditAgainst: 'Esta nota de crédito anula valores de {ref}. Não é um pedido de pagamento.',
  from: 'De', billTo: 'Faturar a', deliverTo: 'Entregar a', shipTo: 'Morada de entrega',
  taxId: 'NIF', yourReference: 'A sua referência', refersTo: 'Referência', serviceDate: 'Data da prestação',
  columns: {
    description: 'Descrição', hsn: 'HSN/SAC', date: 'Data', reference: 'Referência', charge: 'Débito',
    paid: 'Pago', balance: 'Saldo', quantity: 'Qtd.', unit: 'Unidade', unitPrice: 'Preço unitário',
    discount: 'Desconto', amount: 'Valor', image: 'Imagem',
  },
  subtotal: 'Subtotal', discount: 'Desconto', shipping: 'Envio', total: 'Total', totalCredit: 'Total do crédito',
  paid: 'Pago', tax: 'Imposto',
  note: 'Nota', paymentTerms: 'Condições de pagamento', howToPay: 'Como pagar', receivedBy: 'Recebido por',
  pageOf: 'Página {n} de {m}', continued: '{word} {number} — continuação',
  reverseCharge: 'Autoliquidação — IVA devido pelo adquirente (art. 196.º, Diretiva 2006/112/CE)',
  notSubjectToTax: 'Não sujeito a imposto', taxOff: 'Não é aplicado imposto a este documento',
  scanToPay: 'Digitalize para pagar', paymentReference: 'Referência de pagamento', payOnline: 'Pagar online',
  status: { draft: 'Rascunho', sent: 'Enviada', 'part paid': 'Parcialmente paga', paid: 'Paga', overdue: 'Vencida', cancelled: 'Anulada' },
};

const DICT = { en: EN, de: DE, fr: FR, es: ES, it: IT, nl: NL, pl: PL, pt: PT };

/** English filled in under a language, key by key, so nothing can be missing. */
function withFallback(lang) {
  const base = DICT[lang] || EN;
  if (base === EN) return EN;
  const out = { ...EN, ...base };
  for (const key of ['kinds', 'issued', 'second', 'totalLabel', 'legend', 'columns', 'status']) {
    out[key] = { ...EN[key], ...(base[key] || {}) };
  }
  return out;
}

const cache = new Map();

/** The whole dictionary for a language. */
export function labels(lang) {
  const id = normaliseLanguage(lang) || 'en';
  if (!cache.has(id)) cache.set(id, withFallback(id));
  return cache.get(id);
}

/**
 * A document kind, with its words in the given language.
 *
 * Behaviour is untouched — what shows money, what demands payment — only the vocabulary changes,
 * which is the whole point of keeping behaviour and wording apart in ./kinds.js.
 */
export function localiseKind(kind, lang) {
  const L = labels(lang);
  return {
    ...kind,
    word: L.kinds[kind.id] || kind.word,
    dateLabels: {
      issued: L.issued[kind.id] || kind.dateLabels.issued,
      second: kind.dateLabels.second ? (L.second[kind.id] || kind.dateLabels.second) : null,
    },
    totalLabel: kind.totalLabel != null ? (L.totalLabel[kind.id] || kind.totalLabel) : null,
    legend: kind.legend ? (L.legend[kind.id] || kind.legend) : null,
  };
}

/**
 * A stored label, unless it is still the English default — in which case the language's own word.
 *
 * The settings carry "Tax ID", "Your reference" and "How to pay" as editable defaults. A business
 * that changed one meant it; one that left it alone gets the document's language.
 */
export function labelOr(stored, englishDefault, translated) {
  const s = String(stored == null ? '' : stored).trim();
  return s && s !== englishDefault ? s : translated;
}

/** A status word for the document, when it is one of the standard six; otherwise as typed. */
export function localiseStatus(status, lang) {
  const s = String(status || '').trim();
  if (!s) return s;
  return labels(lang).status[s.toLowerCase()] || s;
}

/** Substitute {n}-style tokens. */
export const fillLabel = (template, values) =>
  String(template || '').replace(/\{(\w+)\}/g, (m, k) => (k in values ? String(values[k]) : m));

/**
 * A date the way the language writes it: "28 Aug 2026", "28. Aug. 2026", "28 août 2026".
 *
 * `date` is a Date already resolved to a UTC day. English keeps its fixed abbreviations so an
 * English document is byte-for-byte what it always was; the others use the platform's own month
 * names, which every browser and Node ship for these eight languages.
 */
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(date, lang) {
  const id = normaliseLanguage(lang) || 'en';
  if (id === 'en') return `${date.getUTCDate()} ${EN_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  try {
    return new Intl.DateTimeFormat(id, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
  } catch {
    return `${date.getUTCDate()} ${EN_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  }
}
