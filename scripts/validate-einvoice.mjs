// Run the widget's e-invoice output through the official rules and validators.
//
// Two levels, both reproducible from a scratch folder, neither touching the system:
//
//   Schematron in Node (no Java). The EN 16931 validation artefacts and the KoSIT XRechnung
//   schematron ship as XSLT compiled from Schematron; xslt3 compiles them to SEF and Saxon-JS
//   runs them. Every svrl:failed-assert in the SVRL is a rule the file breaks.
//
//   The official tools (a portable Java runtime, downloaded into the scratch folder). The KoSIT
//   validator with the XRechnung configuration is what German public bodies run; Mustang
//   validates a Factur-X PDF end to end, PDF/A-3 conformance (veraPDF inside) plus the XMP and
//   the embedded XML; and Saxon HE with the ISO Schematron skeleton compiles Peppol's own rules,
//   which are published only as Schematron source.
//
// Setup, once, in a scratch folder rather than the repository (a few hundred megabytes between
// the runtime, the validators and the compiled rules, none of which belongs in git):
//
//   mkdir einv-check && cd einv-check && npm init -y && npm i saxon-js xslt3
//   node ../scripts/validate-einvoice.mjs setup          # the Schematron level
//   node ../scripts/validate-einvoice.mjs setup-java     # the official tools (Windows x64 runtime)
//   node ../scripts/validate-einvoice.mjs                # Schematron level: every case, exit 1 on failure
//   node ../scripts/validate-einvoice.mjs official       # KoSIT, Peppol, Mustang
//   node ../scripts/validate-einvoice.mjs xrechnung      # Schematron level, only cases containing the word
//
// Versions pinned below are the ones checked on 2026-09-05. Bump them together; a newer
// XRechnung schematron may want a newer EN 16931 release.
//
// Known engine artefact at the Schematron level: BR-DE-19 (a warning, "should be a correct
// IBAN") fires for some valid IBANs because the rule converts the whole IBAN to an integer and
// takes mod 97, which overflows JavaScript's number precision in Saxon-JS. Saxon HE and the
// KoSIT validator on Java do not have this; the official level is the answer when in doubt.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';

const CWD = process.cwd();
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const ART = path.join(CWD, 'artefacts');
const SEF = path.join(CWD, 'sef');
const OUT = path.join(CWD, 'out');
const TOOLS = path.join(CWD, 'tools');
const EMPTY = path.join(CWD, 'empty.txt');   // stdin for the Java tools: NUL makes them throw

const SOURCES = {
  'en16931-ubl': { zip: 'https://github.com/ConnectingEurope/eInvoicing-EN16931/releases/download/validation-1.3.16/en16931-ubl-1.3.16.zip', xslt: 'xslt/EN16931-UBL-validation.xslt' },
  'en16931-cii': { zip: 'https://github.com/ConnectingEurope/eInvoicing-EN16931/releases/download/validation-1.3.16/en16931-cii-1.3.16.zip', xslt: 'xslt/EN16931-CII-validation.xslt' },
  'xrechnung-ubl': { zip: 'https://github.com/itplr-kosit/xrechnung-schematron/releases/download/v2.6.0/xrechnung-3.0.2-schematron-2.6.0.zip', xslt: 'schematron/ubl/XRechnung-UBL-validation.xsl' },
  'xrechnung-cii': { zip: 'https://github.com/itplr-kosit/xrechnung-schematron/releases/download/v2.6.0/xrechnung-3.0.2-schematron-2.6.0.zip', xslt: 'schematron/cii/XRechnung-CII-validation.xsl' },
};
const JAVA_TOOLS = {
  jre: 'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jre/hotspot/normal/eclipse?project=jdk',
  kosit: 'https://github.com/itplr-kosit/validator/releases/download/v1.6.3/validator-1.6.3-standalone.jar',
  kositConfig: 'https://github.com/itplr-kosit/validator-configuration-xrechnung/releases/download/v2026-08-31/xrechnung-3.0.2-validator-configuration-2026-08-31.zip',
  mustang: 'https://repo1.maven.org/maven2/org/mustangproject/Mustang-CLI/2.26.0/Mustang-CLI-2.26.0.jar',
  saxon: 'https://repo1.maven.org/maven2/net/sf/saxon/Saxon-HE/10.9/Saxon-HE-10.9.jar',
  // The archive URL, not the API's zipball: the API is rate-limited for anonymous callers and
  // answers with a JSON error that is not a zip.
  peppol: 'https://github.com/OpenPeppol/peppol-bis-invoice-3/archive/refs/tags/v3.0.20.zip',
  skeleton: ['iso_dsdl_include.xsl', 'iso_abstract_expand.xsl', 'iso_svrl_for_xslt2.xsl', 'iso_schematron_skeleton_for_saxon.xsl']
    .map((f) => `https://raw.githubusercontent.com/Schematron/schematron/master/trunk/schematron/code/${f}`),
};

const sh = (cmd) => execSync(cmd, { stdio: 'inherit' });
const fetchTo = (url, file) => { if (!fs.existsSync(file)) { console.log('downloading', url); sh(`curl -sL -o "${file}" "${url}"`); } };
// Python's zipfile rather than tar: Git Bash's GNU tar does not read zip files, Windows' bsdtar does,
// and Python is on every machine this runs on.
// Extracted into a temporary folder that is renamed only on success, so a download that was not
// a zip (a rate-limit page, a half-fetched file) leaves nothing behind that a later run would
// mistake for a finished extraction.
const unzip = (zip, dir) => {
  if (fs.existsSync(dir)) return;
  const tmp = dir + '.part';
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  try {
    sh(`python -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "${zip}" "${tmp}"`);
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(zip, { force: true });
    throw new Error(`${path.basename(zip)} is not a zip file — download it again (${e.message})`);
  }
  fs.renameSync(tmp, dir);
};
const javaExe = () => {
  const roots = fs.existsSync(path.join(TOOLS, 'jre')) ? fs.readdirSync(path.join(TOOLS, 'jre')) : [];
  const hit = roots.map((r) => path.join(TOOLS, 'jre', r, 'bin', 'java.exe')).find((p) => fs.existsSync(p));
  if (!hit) throw new Error('no runtime: run "setup-java" first');
  return hit;
};

async function setup() {
  fs.mkdirSync(ART, { recursive: true });
  fs.mkdirSync(SEF, { recursive: true });
  for (const [id, s] of Object.entries(SOURCES)) {
    const zip = path.join(ART, path.basename(s.zip));
    const dir = path.join(ART, id);
    fetchTo(s.zip, zip);
    unzip(zip, dir);
    const sef = path.join(SEF, id + '.sef.json');
    if (!fs.existsSync(sef)) { console.log('compiling', id); sh(`npx xslt3 -xsl:"${path.join(dir, s.xslt)}" -export:"${sef}" -nogo -relocate:on`); }
  }
  console.log('ready');
}

async function setupJava() {
  fs.mkdirSync(TOOLS, { recursive: true });
  fs.writeFileSync(EMPTY, '');
  fetchTo(JAVA_TOOLS.jre, path.join(TOOLS, 'jre.zip'));
  unzip(path.join(TOOLS, 'jre.zip'), path.join(TOOLS, 'jre'));
  const java = javaExe();
  fetchTo(JAVA_TOOLS.kosit, path.join(TOOLS, 'kosit-validator.jar'));
  fetchTo(JAVA_TOOLS.kositConfig, path.join(TOOLS, 'xr-config.zip'));
  unzip(path.join(TOOLS, 'xr-config.zip'), path.join(TOOLS, 'xr-config'));
  fetchTo(JAVA_TOOLS.mustang, path.join(TOOLS, 'mustang-cli.jar'));
  fetchTo(JAVA_TOOLS.saxon, path.join(TOOLS, 'saxon-he.jar'));
  fs.mkdirSync(path.join(TOOLS, 'skeleton'), { recursive: true });
  for (const u of JAVA_TOOLS.skeleton) fetchTo(u, path.join(TOOLS, 'skeleton', path.basename(u)));
  fetchTo(JAVA_TOOLS.peppol, path.join(TOOLS, 'peppol.zip'));
  unzip(path.join(TOOLS, 'peppol.zip'), path.join(TOOLS, 'peppol'));
  // Peppol's rules are Schematron source; the ISO skeleton turns them into XSLT in three passes.
  const sch = findFile(path.join(TOOLS, 'peppol'), 'PEPPOL-EN16931-UBL.sch');
  const out = path.join(TOOLS, 'peppol-ubl.xsl');
  if (!fs.existsSync(out)) {
    const S = (f) => path.join(TOOLS, 'skeleton', f);
    const step = (i) => path.join(TOOLS, `peppol-step${i}.sch`);
    sh(`"${java}" -jar "${path.join(TOOLS, 'saxon-he.jar')}" -s:"${sch}" -xsl:"${S('iso_dsdl_include.xsl')}" -o:"${step(1)}"`);
    sh(`"${java}" -jar "${path.join(TOOLS, 'saxon-he.jar')}" -s:"${step(1)}" -xsl:"${S('iso_abstract_expand.xsl')}" -o:"${step(2)}"`);
    sh(`"${java}" -jar "${path.join(TOOLS, 'saxon-he.jar')}" -s:"${step(2)}" -xsl:"${S('iso_svrl_for_xslt2.xsl')}" -o:"${out}"`);
  }
  console.log('ready:', java);
}

function findFile(dir, name) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { const hit = findFile(p, name); if (hit) return hit; } else if (e.name === name) return p;
  }
  return null;
}

// ---- the samples: every business, person and address here is invented ---------------------------
async function samples() {
  const mod = (p) => import(pathToFileURL(path.join(REPO, p)).href);
  const ei = await mod('src/einvoice/index.js');
  const { normaliseDraft, recalc } = await mod('src/model/draft.js');
  const { simpleRate } = await mod('src/money/tax/rates.js');
  const { embeddedFontsFromBytes } = await mod('src/export/pdf/font-loader.js');
  const fonts = embeddedFontsFromBytes(
    new Uint8Array(fs.readFileSync(path.join(REPO, 'fonts/DejaVuSans-Regular.ttf'))),
    new Uint8Array(fs.readFileSync(path.join(REPO, 'fonts/DejaVuSans-Bold.ttf'))),
  );
  const settings = (over = {}) => ({
    money: { currency: 'EUR', taxEnabled: true, taxMode: 'simple', taxRates: simpleRate({ rate: 19, name: 'MwSt' }), homeCountry: 'DE' },
    einvoice: { profile: 'en16931' },
    ...over,
  });
  const SELLER = { name: 'Zimmerei Hartmann GmbH', street1: 'Bahnhofstraße 12', city: 'Freiburg', postcode: '79098', country: 'DE', email: 'rechnung@hartmann.example', phone: '+49 761 1234', taxNumber: 'DE 123 456 789', iban: 'DE02 1203 0000 0000 2020 51', bic: 'BYLADEM1001', legalText: 'HRB 1234 Freiburg' };
  const BUYER_CH = { name: 'Bäckerei Sonnenschein', street1: 'Marktplatz 3', city: 'Basel', postcode: '4001', country: 'CH', email: 'info@sonnenschein.example' };
  const BUYER_DE = { name: 'Stadtwerke Musterstadt', street1: 'Rathausplatz 1', city: 'Musterstadt', postcode: '12345', country: 'DE', email: 'einkauf@musterstadt.example', taxNumber: 'DE 987 654 321' };
  const BUYER_FR = { name: 'Boulangerie du Port', street1: '1 quai des Antilles', city: 'Nantes', postcode: '44000', country: 'FR', taxNumber: 'FR12345678901', email: 'compta@duport.example' };
  const draft = (over = {}, s = settings()) => recalc(normaliseDraft({
    kind: 'invoice', number: 'RE-2026-0042', issued: '2026-09-01', due: '2026-09-15', serviceDate: '2026-08-28', status: 'Sent', reference: 'PO-778',
    terms: '14 Tage netto', note: 'Vielen Dank.', sender: SELLER, client: BUYER_CH,
    lines: [
      { description: 'Dachstuhl aufrichten', quantity: 12, unitPrice: 85, unit: 'Std.' },
      { description: 'Kantholz 10×10', quantity: 40, unitPrice: 6.5, unit: 'm' },
    ],
    ...over,
  }), s);
  const XR = settings({ einvoice: { profile: 'xrechnung' } });
  const PEPPOL = settings({ einvoice: { profile: 'peppol' } });
  return {
    ei, fonts,
    xml: [
      { id: 'ubl-en16931', syntax: 'ubl', rules: ['en16931-ubl'], d: [draft(), settings()] },
      { id: 'ubl-en16931-credit-note', syntax: 'ubl', rules: ['en16931-ubl'], d: [draft({ kind: 'credit_note', number: 'GS-2026-0003', relatedTo: 'Rechnung RE-2026-0042' }), settings()] },
      { id: 'ubl-en16931-reverse-charge', syntax: 'ubl', rules: ['en16931-ubl'], d: [draft({ client: BUYER_FR }), settings()] },
      { id: 'ubl-en16931-discount-shipping-partpaid', syntax: 'ubl', rules: ['en16931-ubl'], d: [draft({ discountAmount: 80, shippingAmount: 25, amountPaid: 500 }), settings()] },
      { id: 'ubl-xrechnung', syntax: 'ubl', rules: ['en16931-ubl', 'xrechnung-ubl'], kosit: true, d: [draft({ client: BUYER_DE }), XR] },
      { id: 'ubl-xrechnung-credit-note', syntax: 'ubl', rules: ['en16931-ubl', 'xrechnung-ubl'], kosit: true, d: [draft({ kind: 'credit_note', number: 'GS-2026-0003', relatedTo: 'Rechnung RE-2026-0042', client: BUYER_DE }), XR] },
      { id: 'ubl-peppol', syntax: 'ubl', rules: ['en16931-ubl'], peppol: true, d: [draft({ client: BUYER_DE }), PEPPOL] },
      { id: 'ubl-peppol-reverse-charge', syntax: 'ubl', rules: ['en16931-ubl'], peppol: true, d: [draft({ client: BUYER_FR }), PEPPOL] },
      { id: 'cii-en16931', syntax: 'cii', rules: ['en16931-cii'], d: [draft(), settings()] },
      { id: 'cii-en16931-credit-note', syntax: 'cii', rules: ['en16931-cii'], d: [draft({ kind: 'credit_note', number: 'GS-2026-0003', relatedTo: 'Rechnung RE-2026-0042' }), settings()] },
      { id: 'cii-en16931-reverse-charge', syntax: 'cii', rules: ['en16931-cii'], d: [draft({ client: BUYER_FR }), settings()] },
      { id: 'cii-xrechnung', syntax: 'cii', rules: ['en16931-cii', 'xrechnung-cii'], kosit: true, d: [draft({ client: BUYER_DE }), XR] },
    ],
    pdf: [
      { id: 'facturx-en16931', d: [draft(), settings()] },
      { id: 'facturx-xrechnung', d: [draft({ client: BUYER_DE }), XR] },
      { id: 'facturx-credit-note', d: [draft({ kind: 'credit_note', number: 'GS-2026-0003', relatedTo: 'Rechnung RE-2026-0042' }), settings()] },
      { id: 'facturx-discount-shipping', d: [draft({ discountAmount: 80, shippingAmount: 25, amountPaid: 500 }), settings()] },
    ],
  };
}

const svrlFailures = (svrl) => {
  const out = [];
  const re = /<svrl:failed-assert\b([^>]*)>([\s\S]*?)<\/svrl:failed-assert>/g;
  let m;
  while ((m = re.exec(svrl))) {
    out.push({
      id: (m[1].match(/\bid="([^"]*)"/) || [])[1] || '',
      flag: (m[1].match(/\bflag="([^"]*)"/) || [])[1] || '',
      text: (m[2].match(/<svrl:text[^>]*>([\s\S]*?)<\/svrl:text>/) || [, ''])[1].replace(/\s+/g, ' ').trim().slice(0, 220),
    });
  }
  return out;
};

async function validate(only) {
  const { default: SaxonJS } = await import(pathToFileURL(path.join(CWD, 'node_modules', 'saxon-js', 'SaxonJS2N.js')).href);
  const S = await samples();
  fs.mkdirSync(OUT, { recursive: true });
  let fatal = 0;
  for (const c of S.xml) {
    if (only && !c.id.includes(only)) continue;
    const [d, s] = c.d;
    const xml = S.ei.einvoiceXml(d, s, c.syntax);
    fs.writeFileSync(path.join(OUT, c.id + '.xml'), xml);
    const own = S.ei.checkEInvoice(S.ei.einvoiceModel(d, s));
    console.log(`\n=== ${c.id}  (widget's own check: ${own.ok ? 'ok' : 'errors ' + JSON.stringify(own.errors)})`);
    for (const r of c.rules) {
      const svrl = SaxonJS.transform({ stylesheetFileName: path.join(SEF, r + '.sef.json'), sourceText: xml, destination: 'serialized' }, 'sync').principalResult;
      fs.writeFileSync(path.join(OUT, `${c.id}.${r}.svrl.xml`), svrl);
      const f = svrlFailures(svrl);
      const bad = f.filter((x) => x.flag !== 'warning');
      fatal += bad.length;
      console.log(`  [${r}] ${bad.length} fatal, ${f.length - bad.length} warning`);
      for (const x of bad) console.log(`    ✗ ${x.id}: ${x.text}`);
      for (const x of f.filter((x) => x.flag === 'warning')) console.log(`    ! ${x.id}: ${x.text.slice(0, 140)}`);
    }
  }
  console.log(`\n${fatal} fatal failure(s) in total`);
  process.exit(fatal ? 1 : 0);
}

async function official() {
  const java = javaExe();
  const S = await samples();
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(path.join(OUT, 'kosit'), { recursive: true });
  let bad = 0;

  // The XML, written fresh so the official tools see what the widget makes today.
  for (const c of S.xml) fs.writeFileSync(path.join(OUT, c.id + '.xml'), S.ei.einvoiceXml(c.d[0], c.d[1], c.syntax));

  console.log('\n##### KoSIT validator, XRechnung 3.0.2 configuration');
  const kositFiles = S.xml.filter((c) => c.kosit).map((c) => `"${path.join(OUT, c.id + '.xml')}"`).join(' ');
  const kosit = execSync(`"${java}" -jar "${path.join(TOOLS, 'kosit-validator.jar')}" -s "${path.join(TOOLS, 'xr-config', 'scenarios.xml')}" -r "${path.join(TOOLS, 'xr-config')}" -o "${path.join(OUT, 'kosit')}" ${kositFiles} < "${EMPTY}"`, { encoding: 'utf8' });
  const summary = kosit.match(/Acceptable:\s*\d+\s+Rejected:\s*\d+/)?.[0] || 'no summary line';
  console.log(' ', summary);
  if (!/Rejected:\s*0/.test(summary)) bad++;

  console.log('\n##### Peppol BIS Billing 3.0 rules, Saxon HE');
  for (const c of S.xml.filter((c) => c.peppol)) {
    const src = path.join(OUT, c.id + '.xml');
    const svrl = path.join(OUT, `${c.id}.peppol.svrl.xml`);
    execSync(`"${java}" -jar "${path.join(TOOLS, 'saxon-he.jar')}" -s:"${src}" -xsl:"${path.join(TOOLS, 'peppol-ubl.xsl')}" -o:"${svrl}"`, { stdio: 'inherit' });
    const f = svrlFailures(fs.readFileSync(svrl, 'utf8'));
    const fatal = f.filter((x) => x.flag !== 'warning');
    bad += fatal.length;
    console.log(`  ${c.id}: ${fatal.length} fatal, ${f.length - fatal.length} warning`);
    for (const x of f) console.log(`    ${x.flag === 'warning' ? '!' : '✗'} ${x.id}: ${x.text}`);
  }

  console.log('\n##### Mustang: Factur-X, PDF/A-3 (veraPDF), XMP and the embedded XML');
  for (const c of S.pdf) {
    const file = path.join(OUT, c.id + '.pdf');
    fs.writeFileSync(file, Buffer.from(S.ei.facturXPdf(c.d[0], c.d[1], { fonts: S.fonts })));
    let report = '';
    try { report = execSync(`"${java}" -jar "${path.join(TOOLS, 'mustang-cli.jar')}" --action validate --source "${file}" < "${EMPTY}"`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }); } catch (e) { report = String(e.stdout || ''); }
    const pdfOk = /isCompliant=true/.test(report);
    const errors = [...report.matchAll(/<error[^>]*>([^<]*)<\/error>/g)].map((m) => m[1]);
    const status = (report.match(/<summary status="([a-z]+)"\/>\s*<\/validation>/) || [])[1] || (report.match(/<summary status="([a-z]+)"/g) || []).pop()?.match(/"([a-z]+)"/)?.[1] || 'unknown';
    if (!pdfOk || errors.length || status !== 'valid') bad++;
    console.log(`  ${c.id}: PDF/A-3 ${pdfOk ? 'compliant' : 'NOT compliant'}, ${errors.length} error(s), overall ${status}`);
    for (const e of errors) console.log(`    ✗ ${e}`);
  }

  console.log(`\n${bad ? bad + ' problem(s)' : 'everything accepted by the official tools'}`);
  process.exit(bad ? 1 : 0);
}

const mode = process.argv[2];
if (mode === 'setup') await setup();
else if (mode === 'setup-java') await setupJava();
else if (mode === 'official') await official();
else await validate(mode);
