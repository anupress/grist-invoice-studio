// Production build: bundle + minify (esbuild) then obfuscate (javascript-obfuscator).
// Runs in CI — local development needs NO build step, because src/ runs directly in the browser as
// native ES modules.
//
// Output: dist/ contains index.html, the vendored Grist API, the stylesheets, and one minified,
// comment-free JS bundle. The Grist custom-widget URL points at dist/.

import { build } from 'esbuild';
import JsObfuscator from 'javascript-obfuscator';
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'dist';
const root = process.cwd();

function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }
function cp(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}
function copyIfExists(src, dest) { if (fs.existsSync(src)) cp(src, dest); }

rmrf(OUT);
fs.mkdirSync(OUT, { recursive: true });

// 1. One IIFE. It obfuscates far more reliably than split ESM, which has import/export bindings
//    that have to survive.
const result = await build({
  entryPoints: { app: 'src/main.js' },
  bundle: true,
  format: 'iife',
  splitting: false,
  minify: true,
  legalComments: 'none',
  target: ['es2019'],
  outdir: path.join(OUT, 'assets'),
  write: false,
});

// 2. Obfuscate every emitted JS chunk; write everything else verbatim.
//
// These options are inherited from Advanced Charts along with the reasons they are set this way,
// and both reasons still apply here because this widget shares that codebase's core:
//   - transformObjectKeys is OFF: el() inspects object-literal keys at runtime, and mangling them
//     produces silent DOMExceptions inside an embedded Grist widget.
//   - identifiersPrefix is not cosmetic. The mangled generator hands out single letters, and a
//     generated name that collides with a vendored library's global takes the page down.
const obfOpts = {
  compact: true,
  identifierNamesGenerator: 'mangled-shuffled',
  identifiersPrefix: 'ap',
  numbersToExpressions: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 10,
  stringArray: true,
  stringArrayThreshold: 0.75,
  stringArrayEncoding: ['base64'],
  unicodeEscapeSequence: false,
};
for (const file of result.outputFiles) {
  const rel = path.relative(root, file.path);
  fs.mkdirSync(path.dirname(file.path), { recursive: true });
  if (file.path.endsWith('.js')) {
    const obf = JsObfuscator.obfuscate(file.text, obfOpts).getObfuscatedCode();
    // esbuild's IIFE keeps our code off the global object, but the obfuscator runs afterwards and
    // hoists its own string-array and decoder to the top level — outside that IIFE, where in a
    // classic <script> a top-level function IS a property of window. Wrapping the finished file
    // puts those helpers back in a function scope.
    fs.writeFileSync(file.path, ';(function(){\n' + obf + '\n})();\n');
    console.log('obfuscated', rel);
  } else {
    fs.writeFileSync(file.path, file.contents);
    console.log('emitted   ', rel);
  }
}

// 3. Static assets. .nojekyll matters because GitHub Pages runs Jekyll by default and silently
//    drops anything whose name starts with an underscore.
copyIfExists('.nojekyll', path.join(OUT, '.nojekyll'));
copyIfExists('vendor', path.join(OUT, 'vendor'));
copyIfExists('src/styles', path.join(OUT, 'assets/styles'));

// 4. Production index.html — the obfuscated entry chunk, and nothing else.
//
// Every asset URL carries the package version. Without it, a Grist iframe that loaded the widget
// once keeps serving the cached app.js for as long as its cache pleases — deploys land on Pages
// and never reach the documents already using the widget, which surfaces as "the fix did not do
// anything". The HTML itself is what Grist re-requests; versioned URLs make it pull fresh assets
// the moment it does.
const V = '?v=' + JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
const indexHtml = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Invoice Studio — by ANUPRESS</title>
<link rel="stylesheet" href="assets/styles/tokens.css${V}"/>
<link rel="stylesheet" href="assets/styles/studio.css${V}"/>
<link rel="stylesheet" href="assets/styles/composer.css${V}"/>
<link rel="stylesheet" href="assets/styles/send.css${V}"/>
<link rel="stylesheet" href="assets/styles/settings.css${V}"/>
<link rel="stylesheet" href="assets/styles/document.css${V}"/>
<script src="vendor/grist-plugin-api.js${V}"></script>
</head><body><div id="studio-root" aria-live="polite"></div>
<script src="assets/app.js${V}"></script></body></html>`;
fs.writeFileSync(path.join(OUT, 'index.html'), indexHtml);

console.log('\nBuild complete -> dist/');
