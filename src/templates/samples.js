// A complete sample business for every trade.
//
// When a document is set up, what appears is not a form with blanks but a business already at
// work: a name, an address, clients who owe it money, a catalogue of what it sells, and five
// documents in five states — one overdue, one paid, one part paid, one sent, one still a draft.
// A person can see every feature working before they type a word, and then clear the sample rows
// and start on their own. The same data is what a blog post shows for each trade.
//
// The businesses are ANUPRESS-branded on purpose — ANUPRESS Café, ANUPRESS Works — so a screenshot
// says who made the widget and nobody mistakes a sample for a real firm. Everything else is
// invented: the clients, the addresses, the phone numbers (the 0117 496 and 020 7946 ranges are
// reserved for fiction), the tax numbers. No real person or business appears here, and none
// should — this data lands in other people's documents and on our website.
//
// Four trades have one client abroad with a Language set, so the language feature is visible in
// the starter document without being explained: the invoice to that client is written in their
// language the moment it is opened.

const PIC = (body) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 72 72'>" + body + "</svg>");

/** Flat pictograms for the shop trades, so line thumbnails are visible from the first second. */
export const PICS = {
  mug: PIC("<rect width='72' height='72' rx='10' fill='#eaf1fa'/><rect x='16' y='22' width='28' height='30' rx='5' fill='#14509b'/><path d='M44 28h7a7 7 0 0 1 0 14h-7' fill='none' stroke='#14509b' stroke-width='5'/>"),
  tote: PIC("<rect width='72' height='72' rx='10' fill='#f4efe4'/><path d='M20 28h32l-4 26H24z' fill='#8a5a08'/><path d='M28 28v-4a8 8 0 0 1 16 0v4' fill='none' stroke='#8a5a08' stroke-width='4'/>"),
  notebook: PIC("<rect width='72' height='72' rx='10' fill='#e9f3ec'/><rect x='20' y='16' width='34' height='40' rx='4' fill='#16704a'/><rect x='20' y='16' width='7' height='40' fill='#0e4a30'/><path d='M33 28h15M33 36h15M33 44h15' stroke='#e9f3ec' stroke-width='3'/>"),
  candle: PIC("<rect width='72' height='72' rx='10' fill='#fdf3e7'/><rect x='24' y='30' width='24' height='28' rx='3' fill='#e0a458'/><path d='M36 30v-8' stroke='#5b3a24' stroke-width='3'/><ellipse cx='36' cy='18' rx='4' ry='6' fill='#f0b400'/>"),
  cushion: PIC("<rect width='72' height='72' rx='10' fill='#f6ecec'/><rect x='16' y='16' width='40' height='40' rx='12' fill='#a33830'/><circle cx='36' cy='36' r='4' fill='#f6ecec'/>"),
  planter: PIC("<rect width='72' height='72' rx='10' fill='#eef1f5'/><path d='M22 34h28l-4 22H26z' fill='#5f7285'/><path d='M36 34c0-10 6-16 14-18-1 10-6 16-14 18zm0 0c0-10-6-16-14-18 1 10 6 16 14 18z' fill='#16704a'/>"),
  throw: PIC("<rect width='72' height='72' rx='10' fill='#eef3ee'/><path d='M14 26h44v28H14z' fill='#8aa88f'/><path d='M14 34h44M14 42h44M14 50h44' stroke='#eef3ee' stroke-width='2'/>"),
  lunch: PIC("<rect width='72' height='72' rx='10' fill='#f7f0e6'/><ellipse cx='36' cy='44' rx='24' ry='9' fill='#c77d2a'/><path d='M16 44a20 14 0 0 1 40 0z' fill='#e8e2d6'/><circle cx='36' cy='30' r='3' fill='#c77d2a'/>"),
  coffee: PIC("<rect width='72' height='72' rx='10' fill='#efe9e4'/><path d='M22 30h24v14a12 12 0 0 1-24 0z' fill='#5b3a24'/><path d='M46 32h5a6 6 0 0 1 0 12h-5' fill='none' stroke='#5b3a24' stroke-width='4'/><path d='M29 18c0 3-3 3-3 6m10-6c0 3-3 3-3 6' fill='none' stroke='#a98868' stroke-width='3' stroke-linecap='round'/>"),
  cake: PIC("<rect width='72' height='72' rx='10' fill='#fbeef2'/><path d='M18 40h36v14a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4z' fill='#c96b8a'/><path d='M18 40c6-8 30-8 36 0' fill='#f6d5df'/><path d='M36 22v10' stroke='#c96b8a' stroke-width='3'/>"),
  soup: PIC("<rect width='72' height='72' rx='10' fill='#eaf1ea'/><path d='M16 36h40a20 20 0 0 1-40 0z' fill='#d9822b'/><path d='M12 36h48' stroke='#4a5a4a' stroke-width='3'/><path d='M30 26c0 3-3 3-3 6m12-6c0 3-3 3-3 6' fill='none' stroke='#9aa89a' stroke-width='3' stroke-linecap='round'/>"),
  gift: PIC("<rect width='72' height='72' rx='10' fill='#fdf1e0'/><rect x='16' y='30' width='40' height='26' rx='3' fill='#c77d2a'/><rect x='33' y='30' width='6' height='26' fill='#fdf1e0'/><path d='M36 30c-8 0-12-4-12-8 6-2 10 2 12 8zm0 0c8 0 12-4 12-8-6-2-10 2-12 8z' fill='none' stroke='#c77d2a' stroke-width='4'/>"),
};

/** The one address and phone book every sample business draws on. All invented. */
const HQ = (over) => ({
  street1: '4 Quarry Street', street2: '', city: 'Bristol', state: 'Somerset', postcode: 'BS1 5TF', country: 'GB',
  email: 'accounts@anupress.example', phone: '+44 117 496 0139', website: 'anupress.com', taxNumber: 'GB 481 2739 55',
  ...over,
});

// Clients, per trade. `lang` marks the client abroad whose documents are written in their language.
const C = (Name, Email, Street1, City, Zip, extra = {}) => ({ Name, Email, Phone: '', Street1, Street2: '', City, State: '', Zip, Country: 'GB', TaxNumber: '', Language: '', ...extra });

/**
 * An invoice in the sample: which client, its state, how old, and its lines as [product, qty].
 *
 *   age        days since it was issued
 *   terms      days until due
 *   status     Overdue | Paid | Part paid | Sent | Draft
 */
const I = (client, status, age, terms, lines, extra = {}) => ({ client, status, age, terms, lines, ...extra });

export const SAMPLES = {
  freelancer: {
    business: { name: 'ANUPRESS Consulting', ...HQ({ phone: '+44 117 496 0102' }) },
    paymentDetails: 'Bank transfer to ANUPRESS Consulting\nSort code 04-00-04 · Account 12345678\nPlease quote the invoice number.',
    clients: [
      C('Harbour Lane Bakery', 'accounts@harbourlane.example', '12 Harbour Lane', 'Bristol', 'BS1 4QA', { Phone: '+44 117 496 0114' }),
      C('Kingfisher Print Works', 'pay@kingfisherprint.example', '88 Mill Road', 'Bristol', 'BS5 9RG'),
      C('Nordlicht Verlag GmbH', 'buchhaltung@nordlicht.example', 'Kaiserstraße 40', 'Hamburg', '20457', { Country: 'DE', TaxNumber: 'DE 812 345 678', Language: 'de' }),
    ],
    products: [
      { SKU: 'DAY', Name: 'Consultancy, day rate', Price: 550, Unit: 'day' },
      { SKU: 'HALF', Name: 'Consultancy, half day', Price: 300, Unit: 'day' },
      { SKU: 'WKSHP', Name: 'Workshop facilitation', Price: 850, Unit: 'day' },
      { SKU: 'REPORT', Name: 'Written report and recommendations', Price: 1200, Unit: '' },
      { SKU: 'TRAVEL', Name: 'Travel and expenses', Price: 0.45, Unit: 'mile' },
    ],
    invoices: [
      I(1, 'Overdue', 52, 14, [[0, 3], [4, 84]], { reference: 'PO-4471', note: 'Second reminder sent. Payment is with their finance team.' }),
      I(2, 'Paid', 34, 14, [[2, 1], [0, 1]], { reference: 'KPW-118' }),
      I(3, 'Part paid', 20, 14, [[0, 4], [3, 1]], { reference: 'NL-2026-07' }),
      I(1, 'Sent', 6, 14, [[1, 2]], { reference: 'PO-4520' }),
      I(2, 'Draft', 0, 14, [[0, 2], [4, 30]]),
    ],
  },

  agency: {
    business: { name: 'ANUPRESS Studio', ...HQ({ street1: '18 Old Market Street', postcode: 'BS2 0EJ', phone: '+44 117 496 0210', email: 'studio@anupress.example' }) },
    paymentDetails: 'Bank transfer to ANUPRESS Studio\nSort code 04-00-04 · Account 23456789\nPlease quote your PO number and ours.',
    clients: [
      C('Alder Court Dental', 'billing@aldercourt.example', '3 Alder Court', 'Bath', 'BA1 2LP', { Street2: 'Suite 2', Phone: '+44 1225 496 220' }),
      C('Rowan Hill Veterinary', 'office@rowanhill.example', '5 Rowan Hill', 'Wells', 'BA5 2PU'),
      C('Maison Delacroix Traiteur', 'compta@delacroix.example', '27 rue des Halles', 'Lyon', '69002', { Country: 'FR', TaxNumber: 'FR 40 123 456 789', Language: 'fr' }),
      C('Greywater Brewing Co.', 'hello@greywater.example', 'Unit 9, Feeder Road', 'Bristol', 'BS2 0TJ'),
    ],
    products: [
      { SKU: 'CD', Name: 'Creative direction', Price: 750, Unit: 'day' },
      { SKU: 'ART', Name: 'Artwork and production', Price: 320, Unit: 'hour' },
      { SKU: 'BRAND', Name: 'Brand identity package', Price: 4800, Unit: '' },
      { SKU: 'WEB', Name: 'Website design, per page', Price: 380, Unit: 'page' },
      { SKU: 'SOCIAL', Name: 'Social media content, per month', Price: 1100, Unit: 'month' },
      { SKU: 'PRINT', Name: 'Print management', Price: 95, Unit: 'hour' },
    ],
    invoices: [
      I(1, 'Overdue', 48, 30, [[2, 1], [5, 4]], { reference: 'PO-2026-031', note: 'Reminder sent 3 days after due date.' }),
      I(4, 'Paid', 40, 30, [[0, 2], [1, 12]], { reference: 'GW-88' }),
      I(3, 'Part paid', 25, 30, [[3, 6], [1, 20]], { reference: 'MD-0419', note: 'Deposit received; balance on launch.' }),
      I(2, 'Sent', 9, 30, [[4, 1]], { reference: 'RHV-July' }),
      I(1, 'Draft', 0, 30, [[0, 1], [1, 6]]),
    ],
  },

  saas: {
    business: { name: 'ANUPRESS Cloud', ...HQ({ street1: 'Floor 3, 1 Temple Way', postcode: 'BS1 6EA', email: 'billing@anupress.example', phone: '+44 117 496 0300' }) },
    paymentDetails: 'Pay by card from your account, or by bank transfer to ANUPRESS Cloud\nSort code 04-00-04 · Account 34567890',
    clients: [
      C('Kingfisher Print Works', 'pay@kingfisherprint.example', '88 Mill Road', 'Bristol', 'BS5 9RG'),
      C('Alder Court Dental', 'billing@aldercourt.example', '3 Alder Court', 'Bath', 'BA1 2LP', { Street2: 'Suite 2' }),
      C('Van der Berg Logistiek BV', 'facturen@vdberg.example', 'Havenstraat 112', 'Rotterdam', '3011 AB', { Country: 'NL', TaxNumber: 'NL 812345678B01', Language: 'nl' }),
    ],
    products: [
      { SKU: 'TEAM-M', Name: 'Team plan — monthly, per seat', Price: 15, Unit: 'seat' },
      { SKU: 'BUS-M', Name: 'Business plan — monthly, per seat', Price: 29, Unit: 'seat' },
      { SKU: 'STOR', Name: 'Additional storage, 100 GB', Price: 8, Unit: 'month' },
      { SKU: 'ONBOARD', Name: 'Onboarding session', Price: 250, Unit: '' },
      { SKU: 'SUPPORT', Name: 'Priority support', Price: 90, Unit: 'month' },
    ],
    invoices: [
      I(1, 'Overdue', 45, 14, [[0, 12], [2, 2]], { note: 'Card on file declined. Reminder sent.' }),
      I(2, 'Paid', 31, 14, [[1, 8], [4, 1]]),
      I(3, 'Part paid', 16, 14, [[1, 25], [3, 1], [2, 5]], { reference: 'VDB-IT-2026' }),
      I(1, 'Sent', 3, 14, [[0, 12], [2, 2]]),
      I(2, 'Draft', 0, 14, [[1, 8], [4, 1]]),
    ],
  },

  retail: {
    business: { name: 'ANUPRESS Store', ...HQ({ street1: '22 Christmas Steps', postcode: 'BS1 5BS', email: 'shop@anupress.example', phone: '+44 117 496 0400' }) },
    paymentDetails: '',
    clients: [
      C('Walk-in customer', '', '', 'Bristol', ''),
      C('Harbour Lane Bakery', 'accounts@harbourlane.example', '12 Harbour Lane', 'Bristol', 'BS1 4QA'),
      C('Rowan Hill Veterinary', 'office@rowanhill.example', '5 Rowan Hill', 'Wells', 'BA5 2PU'),
    ],
    products: [
      { SKU: 'MUG-EN', Name: 'Enamel mug', Price: 11.5, Unit: '', Image: PICS.mug },
      { SKU: 'TOTE', Name: 'Cotton tote bag', Price: 14, Unit: '', Image: PICS.tote },
      { SKU: 'NB-A5', Name: 'Notebook, A5, ruled', Price: 8.75, Unit: '', Image: PICS.notebook },
      { SKU: 'CANDLE', Name: 'Soy candle, fig and cedar', Price: 16, Unit: '', Image: PICS.candle },
      { SKU: 'WRAP', Name: 'Gift wrapping', Price: 2.5, Unit: '', Image: PICS.gift },
    ],
    invoices: [
      I(2, 'Overdue', 40, 14, [[0, 12], [1, 12]], { reference: 'Trade order', note: 'Trade account, 12 of each for the bakery counter.' }),
      I(1, 'Paid', 2, 0, [[0, 2], [2, 3], [4, 1]]),
      I(3, 'Part paid', 10, 14, [[3, 6], [1, 6]], { reference: 'Reception gifts' }),
      I(1, 'Sent', 1, 0, [[3, 1], [4, 1]]),
      I(1, 'Draft', 0, 0, [[1, 1], [2, 1]]),
    ],
  },

  restaurant: {
    business: { name: 'ANUPRESS Café', ...HQ({ street1: '9 King Street', postcode: 'BS1 4EQ', email: 'cafe@anupress.example', phone: '+44 117 496 0500' }) },
    paymentDetails: '',
    clients: [
      C('Table 6', '', '', 'Bristol', ''),
      C('Kingfisher Print Works', 'pay@kingfisherprint.example', '88 Mill Road', 'Bristol', 'BS5 9RG'),
      C('Greywater Brewing Co.', 'hello@greywater.example', 'Unit 9, Feeder Road', 'Bristol', 'BS2 0TJ'),
    ],
    products: [
      { SKU: 'LUNCH', Name: 'Set lunch', Price: 18.5, Unit: '', Image: PICS.lunch },
      { SKU: 'SOUP', Name: 'Soup of the day', Price: 7.5, Unit: '', Image: PICS.soup },
      { SKU: 'COFFEE', Name: 'Coffee', Price: 3.2, Unit: '', Image: PICS.coffee },
      { SKU: 'CAKE', Name: 'Cake of the day', Price: 4.8, Unit: '', Image: PICS.cake },
      { SKU: 'CATER', Name: 'Catering, per head', Price: 22, Unit: 'head' },
    ],
    invoices: [
      I(2, 'Overdue', 36, 14, [[4, 30], [2, 30]], { reference: 'Staff lunch, 14 Aug', note: 'Catering account. Reminder sent.' }),
      I(1, 'Paid', 1, 0, [[0, 2], [2, 2]]),
      I(3, 'Part paid', 12, 14, [[4, 45], [3, 45]], { reference: 'Launch evening', note: 'Half paid on booking.' }),
      I(1, 'Sent', 0, 0, [[1, 1], [3, 1], [2, 1]]),
      I(2, 'Draft', 0, 14, [[4, 20]]),
    ],
  },

  ecommerce: {
    business: { name: 'ANUPRESS Shop', ...HQ({ street1: 'Unit 4, Albion Dockside', postcode: 'BS1 6UT', email: 'orders@anupress.example', phone: '+44 117 496 0600' }) },
    paymentDetails: 'Paid online at checkout.',
    clients: [
      C('Margaret Ellery', 'm.ellery@example.com', '14 Cotham Hill', 'Bristol', 'BS6 6LF'),
      C('Tom Okafor', 't.okafor@example.com', '3 Sydney Buildings', 'Bath', 'BA2 6BZ'),
      C('Priya Nandakumar', 'priya.n@example.com', '71 Gloucester Road', 'Bristol', 'BS7 8AS'),
      C('Studio Lindqvist AB', 'order@lindqvist.example', 'Sveavägen 33', 'Stockholm', '111 34', { Country: 'SE', TaxNumber: 'SE 556123456701' }),
    ],
    products: [
      { SKU: 'CUSH-45', Name: 'Linen cushion cover, 45cm', Price: 32, Unit: '', Image: PICS.cushion },
      { SKU: 'PLANT-S', Name: 'Ceramic planter, small', Price: 18.5, Unit: '', Image: PICS.planter },
      { SKU: 'THROW', Name: 'Wool throw, sage', Price: 68, Unit: '', Image: PICS.throw },
      { SKU: 'CANDLE', Name: 'Soy candle, fig and cedar', Price: 16, Unit: '', Image: PICS.candle },
      { SKU: 'GIFT', Name: 'Gift wrapping', Price: 3.5, Unit: '', Image: PICS.gift },
      { SKU: 'SHIP', Name: 'Tracked delivery', Price: 4.95, Unit: '' },
    ],
    invoices: [
      I(1, 'Overdue', 30, 7, [[2, 1], [5, 1]], { reference: 'ORD-10412', note: 'Payment failed at checkout; link resent.' }),
      I(2, 'Paid', 12, 0, [[0, 2], [1, 1], [5, 1]], { reference: 'ORD-10455' }),
      I(4, 'Part paid', 8, 7, [[2, 3], [3, 4], [5, 1]], { reference: 'ORD-10470', note: 'Deposit taken; balance on dispatch.' }),
      I(3, 'Sent', 2, 7, [[1, 2], [4, 1], [5, 1]], { reference: 'ORD-10488' }),
      I(1, 'Draft', 0, 7, [[3, 2], [5, 1]]),
    ],
  },

  construction: {
    business: { name: 'ANUPRESS Works', ...HQ({}) },
    paymentDetails: 'Bank transfer to ANUPRESS Works\nSort code 01-02-03 · Account 12345678\nPlease quote the invoice number.',
    clients: [
      C('Harbour Lane Bakery', 'accounts@harbourlane.example', '12 Harbour Lane', 'Bristol', 'BS1 4QA', { Phone: '+44 117 496 0114' }),
      C('Alder Court Dental', 'billing@aldercourt.example', '3 Alder Court', 'Bath', 'BA1 2LP', { Street2: 'Suite 2', Phone: '+44 1225 496 220' }),
      C('Kingfisher Print Works', 'pay@kingfisherprint.example', '88 Mill Road', 'Bristol', 'BS5 9RG', { Phone: '+44 117 496 0388' }),
      C('Rowan Hill Veterinary', 'office@rowanhill.example', '5 Rowan Hill', 'Wells', 'BA5 2PU', { Street2: 'Unit C' }),
    ],
    products: [
      { SKU: 'SURVEY', Name: 'Site survey and measurement', Price: 320, Unit: '' },
      { SKU: 'LABOUR', Name: 'Labour', Price: 280, Unit: 'day' },
      { SKU: 'DUCT', Name: 'Extraction ductwork, supply and fit', Price: 145, Unit: 'm' },
      { SKU: 'ELEC', Name: 'Electrical certification', Price: 210, Unit: '' },
      { SKU: 'MAT', Name: 'Materials, as scheduled', Price: 1450, Unit: '' },
      { SKU: 'SKIP', Name: 'Skip hire and waste removal', Price: 240, Unit: '' },
    ],
    invoices: [
      I(1, 'Overdue', 52, 30, [[0, 1], [2, 6], [3, 1]], { reference: 'JOB-2026-014', note: 'Second reminder sent. Client says payment is with their finance team.' }),
      I(2, 'Paid', 34, 30, [[1, 3], [4, 1]], { reference: 'JOB-2026-019' }),
      I(3, 'Part paid', 22, 30, [[1, 5], [4, 1], [5, 1]], { reference: 'JOB-2026-022', note: 'Stage payment received; balance on completion.' }),
      I(4, 'Sent', 11, 30, [[0, 1], [1, 2]], { reference: 'JOB-2026-027' }),
      I(1, 'Draft', 0, 30, [[1, 4], [3, 1]], { reference: 'JOB-2026-031' }),
    ],
  },

  auto: {
    business: { name: 'ANUPRESS Motors', ...HQ({ street1: 'Unit 2, Days Road', postcode: 'BS2 0QS', email: 'garage@anupress.example', phone: '+44 117 496 0700' }) },
    paymentDetails: 'Card or bank transfer on collection.\nANUPRESS Motors · Sort code 04-00-04 · Account 45678901',
    clients: [
      C('Margaret Ellery', 'm.ellery@example.com', '14 Cotham Hill', 'Bristol', 'BS6 6LF'),
      C('Kingfisher Print Works', 'pay@kingfisherprint.example', '88 Mill Road', 'Bristol', 'BS5 9RG', { Phone: '+44 117 496 0388' }),
      C('Tom Okafor', 't.okafor@example.com', '3 Sydney Buildings', 'Bath', 'BA2 6BZ'),
    ],
    products: [
      { SKU: 'LAB', Name: 'Labour', Price: 65, Unit: 'hour' },
      { SKU: 'MOT', Name: 'MOT test', Price: 54.85, Unit: '' },
      { SKU: 'OIL', Name: 'Oil and filter service', Price: 89, Unit: '' },
      { SKU: 'BRAKE', Name: 'Front brake pads and discs', Price: 184.4, Unit: 'set' },
      { SKU: 'TYRE', Name: 'Tyre, 205/55 R16', Price: 78, Unit: '' },
      { SKU: 'DIAG', Name: 'Diagnostic scan', Price: 45, Unit: '' },
    ],
    invoices: [
      I(2, 'Overdue', 38, 7, [[0, 4], [3, 1], [1, 1]], { reference: 'WK66 KPW', note: 'Fleet van. Reminder sent.' }),
      I(1, 'Paid', 15, 0, [[1, 1], [2, 1]], { reference: 'BD19 XYZ' }),
      I(3, 'Part paid', 9, 7, [[0, 2.5], [4, 4]], { reference: 'YE71 ABC', note: 'Paid half on collection by card.' }),
      I(2, 'Sent', 4, 7, [[5, 1], [0, 1]], { reference: 'WK66 KPW' }),
      I(1, 'Draft', 0, 7, [[1, 1], [0, 1]], { reference: 'BD19 XYZ' }),
    ],
  },

  medical: {
    business: { name: 'ANUPRESS Clinic', ...HQ({ street1: '31 Whiteladies Road', postcode: 'BS8 2LG', email: 'reception@anupress.example', phone: '+44 117 496 0800' }) },
    paymentDetails: 'Bank transfer to ANUPRESS Clinic\nSort code 04-00-04 · Account 56789012\nOr pay at reception.',
    clients: [
      C('Margaret Ellery', 'm.ellery@example.com', '14 Cotham Hill', 'Bristol', 'BS6 6LF'),
      C('Tom Okafor', 't.okafor@example.com', '3 Sydney Buildings', 'Bath', 'BA2 6BZ'),
      C('Priya Nandakumar', 'priya.n@example.com', '71 Gloucester Road', 'Bristol', 'BS7 8AS'),
      C('Rowan Hill Veterinary', 'office@rowanhill.example', '5 Rowan Hill', 'Wells', 'BA5 2PU'),
    ],
    products: [
      { SKU: 'CONS', Name: 'Consultation', Price: 120, Unit: '' },
      { SKU: 'FOLLOW', Name: 'Follow-up consultation', Price: 75, Unit: '' },
      { SKU: 'PHYSIO', Name: 'Physiotherapy session', Price: 62, Unit: 'session' },
      { SKU: 'BLOOD', Name: 'Blood test panel', Price: 95, Unit: '' },
      { SKU: 'VACC', Name: 'Travel vaccination', Price: 48, Unit: '' },
      { SKU: 'OCC', Name: 'Occupational health assessment', Price: 210, Unit: '' },
    ],
    invoices: [
      I(1, 'Overdue', 42, 0, [[0, 1], [3, 1]], { reference: 'POL-77812-A', note: 'Submitted to insurer; awaiting settlement.' }),
      I(2, 'Paid', 20, 0, [[2, 4]], { reference: 'CLM-20461' }),
      I(4, 'Part paid', 14, 14, [[5, 6]], { reference: 'RHV staff', note: 'Six assessments; three paid so far.' }),
      I(3, 'Sent', 3, 0, [[0, 1], [4, 2]]),
      I(1, 'Draft', 0, 0, [[1, 1]], { reference: 'POL-77812-A' }),
    ],
  },

  legal: {
    business: { name: 'ANUPRESS Legal', ...HQ({ street1: '12 Queen Square', postcode: 'BS1 4NT', email: 'accounts@anupress.example', phone: '+44 117 496 0900' }) },
    paymentDetails: 'Client account: ANUPRESS Legal\nSort code 04-00-04 · Account 67890123\nPlease quote the matter reference.',
    clients: [
      C('Greywater Brewing Co.', 'hello@greywater.example', 'Unit 9, Feeder Road', 'Bristol', 'BS2 0TJ'),
      C('Margaret Ellery', 'm.ellery@example.com', '14 Cotham Hill', 'Bristol', 'BS6 6LF'),
      C('Kingfisher Print Works', 'pay@kingfisherprint.example', '88 Mill Road', 'Bristol', 'BS5 9RG'),
    ],
    products: [
      { SKU: 'PARTNER', Name: 'Professional charges — partner', Price: 240, Unit: 'hour' },
      { SKU: 'ASSOC', Name: 'Professional charges — associate', Price: 160, Unit: 'hour' },
      { SKU: 'DISB', Name: 'Disbursements', Price: 95, Unit: '' },
      { SKU: 'LAND', Name: 'Land Registry fees', Price: 45, Unit: '' },
      { SKU: 'COURIER', Name: 'Courier and postage', Price: 18, Unit: '' },
    ],
    invoices: [
      I(1, 'Overdue', 50, 30, [[0, 6.5], [2, 1]], { reference: 'GBC/0142/LEASE', note: 'Interest accruing from due date per terms.' }),
      I(2, 'Paid', 38, 30, [[1, 4], [3, 1], [4, 1]], { reference: 'ELL/0098/CONV' }),
      I(3, 'Part paid', 21, 30, [[0, 10], [1, 12]], { reference: 'KPW/0151/EMP', note: 'Payment on account received.' }),
      I(1, 'Sent', 8, 30, [[0, 2], [4, 1]], { reference: 'GBC/0142/LEASE' }),
      I(2, 'Draft', 0, 30, [[1, 3]], { reference: 'ELL/0103/WILL' }),
    ],
  },

  tuition: {
    business: { name: 'ANUPRESS Academy', ...HQ({ street1: '6 Berkeley Square', postcode: 'BS8 1HL', email: 'fees@anupress.example', phone: '+44 117 496 1000' }) },
    paymentDetails: 'Bank transfer to ANUPRESS Academy\nSort code 04-00-04 · Account 78901234\nPlease quote the student reference.',
    clients: [
      C('Margaret Ellery', 'm.ellery@example.com', '14 Cotham Hill', 'Bristol', 'BS6 6LF'),
      C('Tom Okafor', 't.okafor@example.com', '3 Sydney Buildings', 'Bath', 'BA2 6BZ'),
      C('Priya Nandakumar', 'priya.n@example.com', '71 Gloucester Road', 'Bristol', 'BS7 8AS'),
    ],
    products: [
      { SKU: 'TERM', Name: 'Tuition — autumn term', Price: 1250, Unit: 'term' },
      { SKU: 'HOUR', Name: 'Private tuition', Price: 45, Unit: 'hour' },
      { SKU: 'EXAM', Name: 'Examination entry fee', Price: 68, Unit: '' },
      { SKU: 'BOOKS', Name: 'Course materials', Price: 32, Unit: 'set' },
      { SKU: 'TRIP', Name: 'Field trip', Price: 85, Unit: '' },
    ],
    invoices: [
      I(1, 'Overdue', 46, 14, [[0, 1], [3, 1]], { reference: 'STU-2041', note: 'Fees due before term; reminder sent.' }),
      I(2, 'Paid', 30, 14, [[1, 10]], { reference: 'STU-2058' }),
      I(3, 'Part paid', 18, 14, [[0, 1], [2, 2], [4, 1]], { reference: 'STU-2063', note: 'Paying in two instalments by agreement.' }),
      I(2, 'Sent', 5, 14, [[1, 6], [3, 1]], { reference: 'STU-2058' }),
      I(1, 'Draft', 0, 14, [[4, 1]], { reference: 'STU-2041' }),
    ],
  },

  nonprofit: {
    business: { name: 'ANUPRESS Foundation', ...HQ({ street1: '2 Portland Square', postcode: 'BS2 8RR', email: 'giving@anupress.example', phone: '+44 117 496 1100', taxNumber: 'Registered charity 1234567' }) },
    paymentDetails: '',
    clients: [
      C('Margaret Ellery', 'm.ellery@example.com', '14 Cotham Hill', 'Bristol', 'BS6 6LF'),
      C('Greywater Brewing Co.', 'hello@greywater.example', 'Unit 9, Feeder Road', 'Bristol', 'BS2 0TJ'),
      C('Tom Okafor', 't.okafor@example.com', '3 Sydney Buildings', 'Bath', 'BA2 6BZ'),
      C('Kingfisher Print Works', 'pay@kingfisherprint.example', '88 Mill Road', 'Bristol', 'BS5 9RG'),
    ],
    products: [
      { SKU: 'DON', Name: 'Donation', Price: 100, Unit: '' },
      { SKU: 'MONTHLY', Name: 'Monthly gift', Price: 25, Unit: 'month' },
      { SKU: 'SPONSOR', Name: 'Event sponsorship', Price: 1500, Unit: '' },
      { SKU: 'TICKET', Name: 'Fundraising dinner ticket', Price: 65, Unit: '' },
      { SKU: 'MEMORY', Name: 'Gift in memory', Price: 250, Unit: '' },
    ],
    invoices: [
      I(2, 'Overdue', 33, 30, [[2, 1]], { reference: 'Summer fair 2026', note: 'Sponsorship pledged at the fair; invoice sent for their records.' }),
      I(1, 'Paid', 10, 0, [[0, 2]], { note: 'No goods or services were provided in exchange for this donation.' }),
      I(4, 'Part paid', 20, 30, [[3, 8]], { reference: 'Dinner table', note: 'Four of eight tickets paid.' }),
      I(3, 'Sent', 2, 0, [[4, 1]]),
      I(1, 'Draft', 0, 0, [[1, 12]]),
    ],
  },

  rental: {
    business: { name: 'ANUPRESS Rentals', ...HQ({ street1: '40 Baldwin Street', postcode: 'BS1 1NR', email: 'lettings@anupress.example', phone: '+44 117 496 1200' }) },
    paymentDetails: 'Standing order to ANUPRESS Rentals\nSort code 04-00-04 · Account 89012345\nReference: your agreement number.',
    clients: [
      C('Priya Nandakumar', 'priya.n@example.com', 'Flat 2, 71 Gloucester Road', 'Bristol', 'BS7 8AS'),
      C('Tom Okafor', 't.okafor@example.com', '3 Sydney Buildings', 'Bath', 'BA2 6BZ'),
      C('Greywater Brewing Co.', 'hello@greywater.example', 'Unit 9, Feeder Road', 'Bristol', 'BS2 0TJ'),
    ],
    products: [
      { SKU: 'RENT', Name: 'Monthly rent', Price: 950, Unit: 'month' },
      { SKU: 'UNIT', Name: 'Storage unit, 50 sq ft', Price: 120, Unit: 'month' },
      { SKU: 'PARK', Name: 'Parking space', Price: 85, Unit: 'month' },
      { SKU: 'SCAFF', Name: 'Scaffold tower hire', Price: 38, Unit: 'day' },
      { SKU: 'CLEAN', Name: 'End-of-tenancy clean', Price: 180, Unit: '' },
    ],
    invoices: [
      I(1, 'Overdue', 35, 0, [[0, 1]], { reference: 'AGR-2024-118', note: 'Standing order failed; tenant notified.' }),
      I(2, 'Paid', 31, 0, [[0, 1], [2, 1]], { reference: 'AGR-2025-031' }),
      I(3, 'Part paid', 12, 14, [[3, 10], [1, 1]], { reference: 'AGR-2026-004', note: 'Deposit held against hire.' }),
      I(1, 'Sent', 4, 0, [[0, 1]], { reference: 'AGR-2024-118' }),
      I(2, 'Draft', 0, 0, [[0, 1], [2, 1], [4, 1]], { reference: 'AGR-2025-031' }),
    ],
  },

  logistics: {
    business: { name: 'ANUPRESS Logistics', ...HQ({ street1: 'Depot 7, Avonmouth Way', city: 'Bristol', postcode: 'BS11 8AA', email: 'transport@anupress.example', phone: '+44 117 496 1300' }) },
    paymentDetails: 'Bank transfer to ANUPRESS Logistics\nSort code 04-00-04 · Account 90123456\nPlease quote the consignment number.',
    clients: [
      C('Kingfisher Print Works', 'pay@kingfisherprint.example', '88 Mill Road', 'Bristol', 'BS5 9RG', { Phone: '+44 117 496 0388' }),
      C('Greywater Brewing Co.', 'hello@greywater.example', 'Unit 9, Feeder Road', 'Bristol', 'BS2 0TJ'),
      C('Nowak Spedycja Sp. z o.o.', 'faktury@nowak-spedycja.example', 'ul. Portowa 8', 'Gdańsk', '80-001', { Country: 'PL', TaxNumber: 'PL 5841234567', Language: 'pl' }),
      C('Harbour Lane Bakery', 'accounts@harbourlane.example', '12 Harbour Lane', 'Bristol', 'BS1 4QA'),
    ],
    products: [
      { SKU: 'COLLECT', Name: 'Collection and delivery', Price: 420, Unit: '' },
      { SKU: 'WAIT', Name: 'Waiting time', Price: 45, Unit: 'hour' },
      { SKU: 'PALLET', Name: 'Pallet delivery, next day', Price: 68, Unit: 'pallet' },
      { SKU: 'FUEL', Name: 'Fuel surcharge', Price: 12, Unit: '%' },
      { SKU: 'STORE', Name: 'Warehouse storage', Price: 4.5, Unit: 'pallet/week' },
      { SKU: 'EU', Name: 'European groupage, per pallet', Price: 210, Unit: 'pallet' },
    ],
    invoices: [
      I(1, 'Overdue', 44, 30, [[0, 1], [1, 1.5]], { reference: 'CON-88120', note: 'Demurrage applied after 2 hours free time.' }),
      I(2, 'Paid', 33, 30, [[2, 6]], { reference: 'CON-88174' }),
      I(3, 'Part paid', 19, 30, [[5, 4], [4, 12]], { reference: 'CON-88201', note: 'Part payment received; balance on delivery.' }),
      I(4, 'Sent', 7, 30, [[2, 2], [0, 1]], { reference: 'CON-88240' }),
      I(2, 'Draft', 0, 30, [[2, 3]], { reference: 'CON-88255' }),
    ],
  },
};

/** The sample business for a trade, or the construction one for a trade this file does not know. */
export function sampleFor(templateId) {
  return SAMPLES[templateId] || SAMPLES.construction;
}

/**
 * The lines of a trade's first document, for the preview drawn before the document exists.
 *
 * The same lines the starter writes, so the setup screen IS a preview of what setting up builds.
 */
export function sampleLinesFor(templateId) {
  const s = sampleFor(templateId);
  const first = s.invoices[0];
  return first.lines.map(([p, qty]) => {
    const prod = s.products[p];
    return { description: prod.Name, quantity: qty, unitPrice: prod.Price, unit: prod.Unit || '', image: prod.Image || '' };
  });
}
