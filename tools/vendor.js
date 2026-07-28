'use strict';
/* ---------------------------------------------------------------------------
   Refresh vendor/ from node_modules.

   three.js and PeerJS are committed to vendor/ so the game starts without a
   network and the Android build fetches no code at runtime. Committed binaries
   rot quietly, so this makes them reproducible: the versions come from
   package.json, and `npm run vendor` regenerates them.
--------------------------------------------------------------------------- */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'vendor');

const LIBS = [
  { from: 'three/build/three.min.js', to: 'three.min.js' },
  { from: 'peerjs/dist/peerjs.min.js', to: 'peerjs.min.js' }
];

fs.mkdirSync(OUT, { recursive: true });

for (const lib of LIBS) {
  const from = path.join(ROOT, 'node_modules', lib.from);
  if (!fs.existsSync(from)) {
    console.error('missing ' + lib.from + ' - run npm install first');
    process.exit(1);
  }
  fs.copyFileSync(from, path.join(OUT, lib.to));
  console.log(lib.to + '  ' + Math.round(fs.statSync(from).size / 1024) + ' KB');
}
