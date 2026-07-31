/* Does a real browser on this network reach third-party hosts at all, or is it
   the signalling domain specifically? */
'use strict';
const { chromium } = require('playwright-core');

const URLS = [
  'https://0.peerjs.com/peerjs/id?ts=1&version=1.5.4',
  'https://1.peerjs.com/peerjs/id?ts=1&version=1.5.4',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://unpkg.com/peerjs@1.5.4/package.json',
  'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/package.json',
  'https://ltnsali.github.io/overrun-fps/vendor/peerjs.min.js',
  'https://www.google.com/generate_204'
];

(async () => {
  for (const headless of [true, false]) {
    const browser = await chromium.launch({ headless });
    const page = await browser.newPage();
    await page.goto('https://ltnsali.github.io/overrun-fps/', { waitUntil: 'domcontentloaded' });
    const rows = await page.evaluate(async (urls) => {
      const out = [];
      for (const u of urls) {
        const host = u.split('/')[2];
        try {
          const r = await fetch(u, { cache: 'no-store', mode: 'no-cors' });
          out.push(host.padEnd(30) + ' ok (type=' + r.type + ')');
        } catch (e) {
          out.push(host.padEnd(30) + ' FAILED ' + e.message);
        }
      }
      return out;
    }, URLS);
    console.log((headless ? '--- headless ---' : '--- headed ---'));
    rows.forEach((r) => console.log('  ' + r));
    await browser.close();
  }
})();
