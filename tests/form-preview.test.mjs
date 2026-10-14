// The client form's address preview prints the address the way the documents do (1.26.6). It built
// its own "city state postcode" line, so a German client previewed as "München 80331" while the
// invoice printed "80331 München".
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as _resolve } from 'node:path';

const ROOT = _resolve(dirname(fileURLToPath(import.meta.url)), '..');
const a = await import(pathToFileURL(_resolve(ROOT, 'src/doc/address.js')).href);

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

// The form's values, as the client form holds them
const de = { name: 'Studio Hagebutte GmbH', street1: 'Beispielweg 12', street2: '', city: 'München', state: '', postcode: '80331', country: 'DE', language: 'en' };
const gb = { name: 'Kingfisher Print Works', street1: '4 Quarry Street', street2: '', city: 'Bristol', state: '', postcode: 'BS1 5TF', country: 'GB', language: 'en' };
const us = { name: 'Harbor Lane', street1: '200 Pier Rd', street2: 'Suite 4', city: 'Portland', state: 'OR', postcode: '97201', country: 'US', language: 'en' };

eq('a German client: postcode first, even with an English document', a.addressLines(de, de.language), ['Beispielweg 12', '80331 München', 'DE']);
eq('a British client: the postcode after the town', a.addressLines(gb, gb.language), ['4 Quarry Street', 'Bristol BS1 5TF', 'GB']);
eq('a US client: town, state, ZIP', a.addressLines(us, us.language), ['200 Pier Rd', 'Suite 4', 'Portland OR 97201', 'US']);

// The form uses the documents' address lines, not a line of its own
const src = readFileSync(_resolve(ROOT, 'src/compose/record-form.js'), 'utf8');
ok('record-form imports addressLines', /import \{ addressLines \} from '\.\.\/doc\/address\.js'/.test(src));
ok('record-form builds no city-state-postcode line of its own', !/\[values\.city, values\.state, values\.postcode\]/.test(src));

console.log(`form-preview: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
