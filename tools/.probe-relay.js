/* Two real browser windows, this network, no peerjs.com involved: does the
   relay transport let them actually play together? */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const SITE = 'http://127.0.0.1:4173/?touch=0&room=PROOF';
const OUT = path.join(process.env.TEMP, 'overrun-probe');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const state = (p) =>
  p.evaluate(() => ({
    gState: window.G && window.G.state,
    kind: window.NET && window.NET.kind,
    peers: window.NET ? Object.keys(window.NET.peers).map((k) => window.NET.peers[k].name) : null,
    err: window.NET && window.NET.err,
    netStat: (document.getElementById('netStat') || {}).textContent
  }));

async function player(browser, name) {
  const p = await browser.newPage({ viewport: { width: 1100, height: 640 } });
  p.on('requestfailed', (r) => {
    if (/peerjs\.com/.test(r.url())) console.log('  !! ' + name + ' still tried peerjs.com');
  });
  await p.goto(SITE, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.G && window.G.state === 'menu', { timeout: 60000 });
  await p.locator('#btnMulti').click();
  await p.locator('#mpName').fill(name);
  await p.locator('#btnMpStart').click();
  return p;
}

(async () => {
  const browser = await chromium.launch({ headless: false });
  const a = await player(browser, 'ALPHA');
  await wait(2500);
  const b = await player(browser, 'BRAVO');

  for (let i = 1; i <= 10; i++) {
    await wait(3000);
    /* Two windows on one screen means only one can have focus, and the game
       pauses when it loses it - which also stops it broadcasting. Keep both in
       the match so this measures the network and not the window manager. */
    await a.evaluate(() => window.G.state === 'paused' && window.resumeGame());
    await b.evaluate(() => window.G.state === 'paused' && window.resumeGame());
    const sa = await state(a);
    const sb = await state(b);
    console.log(
      't+' + i * 3 + 's  A=' + JSON.stringify(sa) + '\n        B=' + JSON.stringify(sb)
    );
    if (sa.peers && sa.peers.length && sb.peers && sb.peers.length) {
      console.log('\nMET: A sees ' + sa.peers + ', B sees ' + sb.peers);
      break;
    }
  }
  await a.screenshot({ path: path.join(OUT, 'relay-A.png') });
  await b.screenshot({ path: path.join(OUT, 'relay-B.png') });
  console.log('shots in ' + OUT);
  await browser.close();
})();
