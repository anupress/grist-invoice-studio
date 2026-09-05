// Run the widget's e-invoice output through the official Schematron rules, without Java.
//
// The EN 16931 validation artefacts (ConnectingEurope/eInvoicing-EN16931) and the KoSIT
// XRechnung schematron ship as XSLT compiled from Schematron. Saxon-JS runs them in Node once
// xslt3 has compiled them to SEF, and every svrl:failed-assert in the SVRL they produce is a rule
// the file breaks. This is the check the README's e-invoicing section rests on.
//
// One-off setup, in a scratch folder rather than the repository (the artefacts are ~10 MB and
// the SEF files ~15 MB, and neither belongs in git):
//
//   mkdir einv-check && cd einv-check && npm init -y && npm i saxon-js xslt3
//   node ../scripts/validate-einvoice.mjs setup     # downloads the artefacts and compiles them
//   node ../scripts/validate-einvoice.mjs           # validates every sample; exit 1 on a failure
//   node ../scripts/validate-einvoice.mjs xrechnung # only the cases whose id contains the word
//
// Versions pinned below are the ones checked on 2026-09-05. Bump them together; a newer
// XRechnung schematron may want a newer EN 16931 release.
//
// Known engine artefact: BR-DE-19 (a warning, "should be a correct IBAN") fires for some IBANs
// that are valid. The rule's checksum converts the whole IBAN to an integer and takes mod 97,
// which overflows JavaScript's number precision in Saxon-JS; Saxon HE on Java does not. A valid
// IBAN that this reports is not a defect in the file.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';

const CWD = process.cwd();
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const ART = path.join(CWD, 'artefacts');
const SEF = path.join(CWD, 'sef');
const OUT = path.join(CWD, 'out');

const SOURCES = {
  'en16931-ubl': { zip: 'https://github.com/ConnectingEurope/eInvoicing-EN16931/releases/download/validation-1.3.16/en16931-ubl-1.3.16.zip', xslt: 'xslt/EN16931-UBL-validation.xslt' },
  'en16931-cii': { zip: 'https://github.com/ConnectingEurope/eInvoicing-EN16931/releases/download/validation-1.3.16/en16931-cii-1.3.16.zip', xslt: 'xslt/EN16931-CII-validation.xslt' },
  'xrechnung-ubl': { zip: 'https://github.com/itplr-kosit/xrechnung-schematron/releases/download/v2.6.0/xrechnung-3.0.2-schematron-2.6.0.zip', xslt: 'schematron/ubl/XRechnung-UBL-validation.xsl' },
  'xrechnung-cii': { zip: 'https://github.com/itplr-kosit/xrechnung-schematron/releases/download/v2.6.0/xrechnung-3.0.2-schematron-2.6.0.zip', xslt: 'schematron/cii/XRechnung-CII-validation.xsl' },
};

async function setup() {
  fs.mkdirSync(ART, { recursive: true });
  fs.mkdirSync(SEF, { recursive: true });
  // No zip library: the platform's tar reads zip files on Windows 10+, macOS and Linux.
  for (const [id, s] of Object.entries(SOURCES)) {
    const dir = path.join(ART, id);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      const zip = path.join(ART, id + '.zip');
      console.log('downloading', s.zip);
      execSync(`curl -sL -o "${zip}" "${s.zip}"`, { stdio: 'inherit' });
      execSync(`tar -xf "${zip}" -C "${dir}"`, { stdio: 'inherit' });
    }
    const sef = path.join(SEF, id + '.sef.json');
    if (!fs.existsSync(sef)) {
      console.log('compiling', id);
      execSync(`npx xslt3 -xsl:"${path.join(dir, s.xslt)}" -export:"${sef}" -nogo -relocate:on`, { stdio: 'inherit' });
    }
  }
  void AdmZip;
  console.log('ready');
}

async function validate(only) {
  const { default: SaxonJS } = await import(pathToFileURL(path.join(CWD, 'node_modules', 'saxon-js', 'SaxonJS2N.js')).href);
  const mod = (p) => import(pathToFileURL(path.join(REPO, p)).href);
  const ei = await mod('src/einvoice/index.js');
  const { normaliseDraft, recalc } = await mod('src/model/draft.js');
  const { simpleRate } = await mod('src/money/tax/rates.js');

  const settings = (over = {}) => ({
    money: { currency: 'EUR', taxEnabled: true, taxMode: 'simple', taxRates: simpleRate({ rate: 19, name: 'MwSt' }), homeCountry: 'DE' },
    einvoice: { profile: 'en16931' },
    ...over,
  });
  // Every business, person and address here is invented.
  const SELLER = { name: 'Zimmerei Hartmann GmbH', street1: 'Bahnhofstraße 12', city: 'Freiburg', postcode: '79098', country: 'DE', email: 'rechnung@hartmann.example', phone: '+49 761 1234', taxNumber: 'DE 123 456 789', iban: 'DE02 1203 0000 0000 2020 51', bic: 'BYLADEM1001', legalText: 'HRB 1234 Freiburg' };
  const BUYER_CH = { name: 'Bäckerei Sonnenschein', street1: 'Marktplatz 3', city: 'Basel', postcode: '4001', country: 'CH', email: 'info@sonnenschein.example' };
  const BUYER_DE = { name: 'Stadtwerke Musterstadt', street1: 'Rathausplatz 1', city: 'Musterstadt', postcode: '12345', country: 'DE', email: 'einkauf@musterstadt.example', taxNumber: 'DE 987 654 321' };
  const BUYER_FR = { name: 'Boulangerie du Port', street1: '1 quai des Antilles', city: 'Nantes', postcode: '44000', country: 'FR', taxNumber: 'FR12345678901', email: 'compta@duport.example' };
  const draft = (over = {}, s = settings()) => recalc(normaliseDraft({
    kind: 'invoice', number: 'RE-2026-0042', issued: '2026-09-01', due: '2026-09-15', status: 'Sent', reference: 'PO-778',
    terms: '14 Tage netto', note: 'Vielen Dank.', sender: SELLER, client: BUYER_CH,
    lines: [
      { description: 'Dachstuhl aufrichten', quantity: 12, unitPrice: 85, unit: 'Std.' },
      { description: 'Kantholz 10×10', quantity: 40, unitPrice: 6.5, unit: 'm' },
    ],
    ...over,
  }), s);

  const CASES = [
    { id: 'ubl-en16931', syntax: 'ubl', rules: ['en16931-ubl'], d: () => [draft(), settings()] },
    { id: 'ubl-en16931-credit-note', syntax: 'ubl', rules: ['en16931-ubl'], d: () => [draft({ kind: 'credit_note', number: 'GS-2026-0003', relatedTo: 'Rechnung RE-2026-0042' }), settings()] },
    { id: 'ubl-en16931-reverse-charge', syntax: 'ubl', rules: ['en16931-ubl'], d: () => [draft({ client: BUYER_FR }), settings()] },
    { id: 'ubl-en16931-discount-shipping-partpaid', syntax: 'ubl', rules: ['en16931-ubl'], d: () => [draft({ discountAmount: 80, shippingAmount: 25, amountPaid: 500 }), settings()] },
    { id: 'ubl-en16931-service-date', syntax: 'ubl', rules: ['en16931-ubl'], d: () => [draft({ serviceDate: '2026-08-28' }), settings()] },
    { id: 'ubl-xrechnung', syntax: 'ubl', rules: ['en16931-ubl', 'xrechnung-ubl'], d: () => [draft({ client: BUYER_DE }), settings({ einvoice: { profile: 'xrechnung' } })] },
    { id: 'ubl-xrechnung-credit-note', syntax: 'ubl', rules: ['en16931-ubl', 'xrechnung-ubl'], d: () => [draft({ kind: 'credit_note', number: 'GS-2026-0003', relatedTo: 'Rechnung RE-2026-0042', client: BUYER_DE }), settings({ einvoice: { profile: 'xrechnung' } })] },
    { id: 'ubl-peppol', syntax: 'ubl', rules: ['en16931-ubl'], d: () => [draft({ client: BUYER_DE }), settings({ einvoice: { profile: 'peppol' } })] },
    { id: 'cii-en16931', syntax: 'cii', rules: ['en16931-cii'], d: () => [draft(), settings()] },
    { id: 'cii-en16931-credit-note', syntax: 'cii', rules: ['en16931-cii'], d: () => [draft({ kind: 'credit_note', number: 'GS-2026-0003', relatedTo: 'Rechnung RE-2026-0042' }), settings()] },
    { id: 'cii-en16931-reverse-charge', syntax: 'cii', rules: ['en16931-cii'], d: () => [draft({ client: BUYER_FR }), settings()] },
    { id: 'cii-xrechnung', syntax: 'cii', rules: ['en16931-cii', 'xrechnung-cii'], d: () => [draft({ client: BUYER_DE }), settings({ einvoice: { profile: 'xrechnung' } })] },
  ];

  const failures = (svrl) => {
    const out = [];
    const re = /<svrl:failed-assert\b([^>]*)>([\s\S]*?)<\/svrl:failed-assert>/g;
    let m;
    while ((m = re.exec(svrl))) {
      const id = (m[1].match(/\bid="([^"]*)"/) || [])[1] || '';
      const flag = (m[1].match(/\bflag="([^"]*)"/) || [])[1] || '';
      const text = (m[2].match(/<svrl:text[^>]*>([\s\S]*?)<\/svrl:text>/) || [, ''])[1].replace(/\s+/g, ' ').trim();
      out.push({ id, flag, text: text.slice(0, 220) });
    }
    return out;
  };

  fs.mkdirSync(OUT, { recursive: true });
  let fatal = 0;
  for (const c of CASES) {
    if (only && !c.id.includes(only)) continue;
    const [d, s] = c.d();
    const xml = ei.einvoiceXml(d, s, c.syntax);
    fs.writeFileSync(path.join(OUT, c.id + '.xml'), xml);
    const own = ei.checkEInvoice(ei.einvoiceModel(d, s));
    console.log(`\n=== ${c.id}  (widget's own check: ${own.ok ? 'ok' : 'errors ' + JSON.stringify(own.errors)})`);
    for (const r of c.rules) {
      const svrl = SaxonJS.transform({ stylesheetFileName: path.join(SEF, r + '.sef.json'), sourceText: xml, destination: 'serialized' }, 'sync').principalResult;
      fs.writeFileSync(path.join(OUT, `${c.id}.${r}.svrl.xml`), svrl);
      const f = failures(svrl);
      const bad = f.filter((x) => x.flag !== 'warning');
      const warn = f.filter((x) => x.flag === 'warning');
      fatal += bad.length;
      console.log(`  [${r}] ${bad.length} fatal, ${warn.length} warning`);
      for (const x of bad) console.log(`    ✗ ${x.id}: ${x.text}`);
      for (const x of warn) console.log(`    ! ${x.id}: ${x.text.slice(0, 140)}`);
    }
  }
  console.log(`\n${fatal} fatal failure(s) in total`);
  process.exit(fatal ? 1 : 0);
}

if (process.argv[2] === 'setup') await setup();
else await validate(process.argv[2]);
