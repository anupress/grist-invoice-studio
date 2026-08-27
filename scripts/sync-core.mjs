// Keep src/core/ byte-identical to the same files in Advanced Charts.
//
// Invoice Studio is a separate repository by deliberate choice, which means the theme, the Grist
// bridge, the data provider, the sanitizer and the icon set exist twice. Left alone, that is a bug
// factory: the same fault gets fixed in one copy, the other copy quietly keeps it, and a year later
// nobody can say which behaviour is the intended one.
//
// So the shared files are not maintained here. They are COPIED here, verbatim, from the list in
// core.manifest.json, and this script is the only thing allowed to write them.
//
//   node scripts/sync-core.mjs           copy from the source repo, refresh the lockfile
//   node scripts/sync-core.mjs --check   verify nothing has drifted; exit 1 if it has
//   node scripts/sync-core.mjs --list    print what is shared and where it came from
//
// --check answers two different questions, because they fail in different places:
//
//   1. TAMPER — has anyone edited a file inside src/core/ in THIS repository? Answered by hashing
//      against core.lock.json, needs nothing but this checkout, and therefore runs in CI. This is
//      the one that actually enforces "read-only", because it catches the edit at the commit that
//      made it rather than at the next sync.
//
//   2. DRIFT — has the file changed UPSTREAM since we last copied it? Answered by comparing against
//      the sibling checkout, which CI does not have. Skipped, loudly, when the source is absent.
//
// The lockfile is committed. That is the point: it is the record of exactly which revision of the
// shared code this repository was built against.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'core.manifest.json');
const LOCKFILE = path.join(ROOT, 'core.lock.json');

const args = new Set(process.argv.slice(2));
const MODE = args.has('--check') ? 'check' : args.has('--list') ? 'list' : 'sync';

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

function die(msg) { console.error('\n' + msg + '\n'); process.exit(1); }

// ---- manifest ------------------------------------------------------------------------------
let manifest;
try { manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); }
catch (e) { die(`Could not read ${rel(MANIFEST)} — ${e.message}`); }

const sourceRoot = path.resolve(ROOT, manifest.source);
const targetDir = path.join(ROOT, manifest.targetDir);
const stripPrefix = manifest.stripPrefix || '';

/** Where one manifest entry lands under src/core/. */
function targetFor(entry) {
  const trimmed = entry.startsWith(stripPrefix) ? entry.slice(stripPrefix.length) : entry;
  return path.join(targetDir, trimmed);
}

// ---- list ----------------------------------------------------------------------------------
if (MODE === 'list') {
  console.log(`\n${manifest.files.length} files shared with ${manifest.sourceName}`);
  console.log(`source: ${manifest.source}  (resolves to ${sourceRoot})\n`);
  for (const f of manifest.files) console.log(`  ${f.padEnd(34)} ->  ${rel(targetFor(f))}`);
  console.log('');
  process.exit(0);
}

// ---- sync ----------------------------------------------------------------------------------
if (MODE === 'sync') {
  if (!fs.existsSync(sourceRoot)) {
    die(`The source repository is not where the manifest says it is.\n` +
        `  expected: ${sourceRoot}\n` +
        `  Clone ${manifest.sourceName} beside this repo, or edit "source" in core.manifest.json.`);
  }

  const lock = { source: manifest.sourceName, syncedAt: new Date().toISOString(), files: {} };
  let copied = 0, unchanged = 0;

  for (const entry of manifest.files) {
    const from = path.join(sourceRoot, entry);
    if (!fs.existsSync(from)) die(`Listed in the manifest but missing upstream: ${entry}`);

    const buf = fs.readFileSync(from);
    const to = targetFor(entry);
    const before = fs.existsSync(to) ? fs.readFileSync(to) : null;

    if (before && before.equals(buf)) { unchanged++; }
    else {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.writeFileSync(to, buf);
      copied++;
      console.log(`  ${before ? 'updated' : 'added  '}  ${rel(to)}`);
    }
    lock.files[entry] = { target: rel(to), sha256: sha(buf), bytes: buf.length };
  }

  // A file left behind in src/core/ after being dropped from the manifest is worse than a missing
  // one: it still imports, still runs, and is no longer synced by anything.
  const known = new Set(manifest.files.map((f) => rel(targetFor(f))));
  for (const found of walk(targetDir)) {
    if (!known.has(rel(found))) {
      console.log(`  ORPHAN   ${rel(found)}  — no longer in the manifest; delete it or add it back`);
    }
  }

  fs.writeFileSync(LOCKFILE, JSON.stringify(lock, null, 2) + '\n');
  console.log(`\n${copied} copied, ${unchanged} already current. Lockfile written.\n`);
  process.exit(0);
}

// ---- check ---------------------------------------------------------------------------------
let lock;
try { lock = JSON.parse(fs.readFileSync(LOCKFILE, 'utf8')); }
catch {
  die(`No core.lock.json. Run:  node scripts/sync-core.mjs\n` +
      `The lockfile records which revision of the shared code this repo was built against, and is committed.`);
}

const tampered = [];
const missing = [];

for (const entry of manifest.files) {
  const to = targetFor(entry);
  const expected = lock.files[entry];
  if (!expected) { missing.push(`${entry} — in the manifest but not the lockfile; re-run the sync`); continue; }
  if (!fs.existsSync(to)) { missing.push(`${rel(to)} — listed but not present`); continue; }
  const actual = sha(fs.readFileSync(to));
  if (actual !== expected.sha256) tampered.push(rel(to));
}

if (missing.length || tampered.length) {
  console.error('\nsync-core --check FAILED\n');
  for (const m of missing) console.error(`  missing   ${m}`);
  for (const t of tampered) console.error(`  edited    ${t}`);
  console.error(
    `\nFiles under ${manifest.targetDir}/ are copies and must not be edited here.` +
    `\nFix them in ${manifest.sourceName}, then run:  node scripts/sync-core.mjs\n` +
    `If the change genuinely belongs only to Invoice Studio, it does not belong in core —` +
    `\nmove it into a module of our own and drop it from core.manifest.json.\n`);
  process.exit(1);
}

// Upstream drift is only answerable with the other repo in hand. CI never has it, so this is a
// note rather than a failure — the tamper check above is what CI is really there to enforce.
if (!fs.existsSync(sourceRoot)) {
  console.log(`\nsync-core --check OK — ${manifest.files.length} core files match the lockfile.`);
  console.log(`(Upstream drift not checked: ${manifest.sourceName} is not at ${manifest.source}.)\n`);
  process.exit(0);
}

const drifted = [];
for (const entry of manifest.files) {
  const from = path.join(sourceRoot, entry);
  if (!fs.existsSync(from)) { drifted.push(`${entry} — gone upstream`); continue; }
  if (sha(fs.readFileSync(from)) !== lock.files[entry].sha256) drifted.push(entry);
}

console.log(`\nsync-core --check OK — ${manifest.files.length} core files match the lockfile.`);
if (drifted.length) {
  console.log(`\n${drifted.length} have moved on upstream — run the sync when you want them:`);
  for (const d of drifted) console.log(`  ${d}`);
}
console.log('');

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p); else yield p;
  }
}
