'use strict';
/* ---------------------------------------------------------------------------
   Assemble www/ for the Android build.

   Capacitor wants a single web root to copy into the app. This is a copy, not a
   build: the same classic scripts the browser loads, in the same order, with the
   same relative paths. There is still no bundler and no transpiler anywhere in
   this project, and index.html remains the one source of truth for load order.
--------------------------------------------------------------------------- */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'www');

/* Everything the page actually asks for, and nothing else - no tests, no
   node_modules, no bug reports riding along into the app bundle. */
const ITEMS = ['index.html', 'src', 'vendor'];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

for (const item of ITEMS) {
  const from = path.join(ROOT, item);
  if (!fs.existsSync(from)) {
    console.error('missing ' + item + ' - run npm install first?');
    process.exit(1);
  }
  fs.cpSync(from, path.join(OUT, item), { recursive: true });
}

/* The vendored libraries are what make the app self-contained. Shipping without
   them would leave the game reaching for a CDN on a phone that may have no
   network, so fail the build rather than the player. */
for (const lib of ['vendor/three.min.js', 'vendor/peerjs.min.js']) {
  if (!fs.existsSync(path.join(OUT, lib))) {
    console.error('missing ' + lib + ' - the app must not depend on a CDN');
    process.exit(1);
  }
}

const count = fs.readdirSync(path.join(OUT, 'src', 'js')).length;
console.log('www/ ready: ' + count + ' scripts, engine and networking bundled in');
