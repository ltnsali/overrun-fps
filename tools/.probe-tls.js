/* Is the signalling host reachable? Headless vs headed, fetch vs WebSocket. */
'use strict';
const { chromium } = require('playwright-core');

const HOSTS = [
  'https://0.peerjs.com/peerjs/id?ts=1&version=1.5.4',
  'https://1.peerjs.com/peerjs/id?ts=1&version=1.5.4',
  'https://peerjs-server.herokuapp.com/peerjs/id?ts=1&version=1.5.4'
];

async function probe(headless) {
  const browser = await chromium.launch({ headless });
  const page = await browser.newPage();
  await page.goto('https://ltnsali.github.io/overrun-fps/', { waitUntil: 'domcontentloaded' });
  const results = await page.evaluate(async (hosts) => {
    const out = [];
    for (const u of hosts) {
      try {
        const r = await fetch(u, { cache: 'no-store' });
        out.push(u.split('/')[2] + '  HTTP ' + r.status + ' ' + (await r.text()).slice(0, 20));
      } catch (e) {
        out.push(u.split('/')[2] + '  FETCH FAILED: ' + e.message);
      }
    }
    return out;
  }, HOSTS);
  console.log((headless ? 'headless' : 'headed  ') + ':');
  results.forEach((r) => console.log('   ' + r));
  await browser.close();
}

(async () => {
  await probe(true);
  await probe(false);
})();
