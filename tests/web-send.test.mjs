// "Email it to me": the rules the dialog keeps since plugin 0.5.0.
//
// The site now emails the file to the visitor's own proved address and to nobody else, and it never
// emails the fictional example. The server enforces both (anupress-invoice, class-rest.php); these
// tests hold the browser side to the same rules, so the honest path stays the easy one. There is no
// document in Node, so the dialog itself is checked in a browser; what is checked here is the
// example detector, the words both languages need, and what the source posts.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => import(pathToFileURL(_resolve(ROOT, p)).href);
const read = (p) => readFileSync(_resolve(ROOT, p), 'utf8');

const { holdsExample } = await load('src/web/send.js');
const { sampleBusinessFor } = await load('src/templates/starter.js');
const { SAMPLES } = await load('src/templates/samples.js');
const { translator } = await load('src/web/strings.js');

let pass = 0, fail = 0;
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

// ---------------------------------------------------------------------------------------------
// The example never leaves the page
// ---------------------------------------------------------------------------------------------
for (const id of Object.keys(SAMPLES)) {
  ok(`${id}: the example business is caught`, holdsExample({}, { sender: sampleBusinessFor(id) }));
}
ok('the example client alone is caught', holdsExample({ client: { email: 'accounts@harbourlane.example' } }, { sender: {} }));
ok('the example payment page is caught', holdsExample({}, { sender: { paymentLink: 'https://pay.anupress.example/invoice' } }));

const own = {
  name: 'Mustermann Malerei', email: 'max@mustermann.de', website: 'mustermann.de',
  paymentLink: 'https://zahlung.mustermann.de/rechnung',
};
ok("a visitor's own details pass", !holdsExample({ client: { email: 'erika@musterfrau.de' } }, { sender: own }));
ok('a word that merely contains "example" passes', !holdsExample({}, { sender: { name: 'Counterexample Ltd', website: 'counterexample.de' } }));
ok('example.com is a different thing and passes', !holdsExample({}, { sender: { website: 'www.example.com' } }));
ok('nothing at all passes', !holdsExample({}, {}));

// ---------------------------------------------------------------------------------------------
// Both languages carry the dialog's words
// ---------------------------------------------------------------------------------------------
const EN = translator('en');
const DE = translator('de');
for (const key of ['emailIt', 'selfIntro', 'yourEmail', 'yourEmailHint', 'emailInvalid', 'exampleData', 'sentToYou', 'sendingOff', 'attach']) {
  ok(`${key} is written in English`, EN(key) !== key && EN(key).length > 1);
  ok(`${key} is written in German too`, DE(key) !== key && DE(key) !== EN(key));
}
ok('the button says who it goes to', /\bme\b/i.test(EN('emailIt')) && /\bmich\b/.test(DE('emailIt')));
ok('the dialog says it goes to nobody else', /nobody else/.test(EN('selfIntro')) && /niemanden sonst/.test(DE('selfIntro')));
ok('the success line names the address', EN('sentToYou', { email: 'a@b.de' }).includes('a@b.de') && DE('sentToYou', { email: 'a@b.de' }).includes('a@b.de'));
for (const gone of ['replyTo', 'copyMe', 'inBody', 'needTo', 'noLinks', 'sentCleared']) {
  ok(`the relay's word "${gone}" is gone`, EN(gone) === gone);
}

// ---------------------------------------------------------------------------------------------
// What the dialog posts: the file and the address, nothing a reader would see
// ---------------------------------------------------------------------------------------------
const src = read('src/web/send.js');
const payload = /const payload = \(turnstile\) => \(\{([\s\S]*?)\n {6}\}\);/.exec(src)?.[1] || '';
ok('the payload is found', payload.length > 0);
for (const key of ['to', 'cc', 'bcc', 'copy', 'subject', 'text', 'html', 'senderName']) {
  ok(`the payload carries no "${key}"`, !new RegExp(`^\\s*${key}\\s*[:,]`, 'm').test(payload));
}
ok('it carries the address and the file', /^\s*email:/m.test(payload) && /^\s*attachment:/m.test(payload));
ok('the send refuses the example before posting', /holdsExample\(draft, settings\)\) \{ say\(t\('exampleData'\)/.test(src));

const app = read('src/web/app.js');
ok('after an email the document stays open, like a download', /function afterSend\(email\) \{\s*markIssued\(\);\s*say\(t\('sentToYou'/.test(app));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
