/* Play the deployed game the way a person does: a real window, real clicks,
   the default room, no test hooks. Also records every request to the signalling
   host, because "server-error" is PeerJS's way of saying that failed. */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const SITE = 'https://ltnsali.github.io/overrun-fps/';
const OUT = path.join(process.env.TEMP, 'overrun-probe');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const state = (p) =>
  p.evaluate(() => ({
    gState: window.G && window.G.state,
    kind: window.NET && window.NET.kind,
    host: window.NET && window.NET.isHost,
    slot: window.NET && window.NET.slot,
    peers: window.NET ? Object.keys(window.NET.peers).length : null,
    err: window.NET && window.NET.err,
    lobbyErr: (document.getElementById('mpErr') || {}).textContent,
    roster: (document.getElementById('mpRoster') || {}).textContent,
    trace: window.NET && window.NET.trace
  }));

function watch(page, tag) {
  page.on('requestfailed', (r) => {
    if (/peerjs/i.test(r.url())) {
      console.log('  ' + tag + ' REQFAIL ' + r.url().slice(0, 90) + '  ' +
        (r.failure() && r.failure().errorText));
    }
  });
  page.on('response', (r) => {
    if (/peerjs\.com/i.test(r.url())) {
      console.log('  ' + tag + ' HTTP ' + r.status() + ' ' + r.url().slice(0, 90));
    }
  });
  page.on('console', (m) => {
    if (/error|fail|peer/i.test(m.text())) {
      console.log('  ' + tag + ' console[' + m.type() + '] ' + m.text().slice(0, 200));
    }
  });
  page.on('pageerror', (e) => console.log('  ' + tag + ' PAGEERROR ' + e.message));
}

async function player(browser, tag, name) {
  const p = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  watch(p, tag);
  await p.goto(SITE, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.G && window.G.state === 'menu', { timeout: 60000 });
  await p.locator('#btnMulti').click();
  await p.locator('#mpName').fill(name);
  await p.locator('#btnMpStart').click();
  console.log(tag + ' pressed ENTER ARENA');
  return p;
}

(async () => {
  const browser = await chromium.launch({ headless: false });
  const a = await player(browser, 'A', 'ALPHA');

  for (let i = 1; i <= 8; i++) {
    await wait(4000);
    const s = await state(a);
    console.log('  A t+' + i * 4 + 's ' + JSON.stringify({
      gState: s.gState, kind: s.kind, host: s.host, slot: s.slot, peers: s.peers,
      err: s.err, roster: s.roster
    }));
    if (s.gState === 'playing' || s.err) break;
  }
  console.log('A trace: ' + JSON.stringify((await state(a)).trace));
  await a.screenshot({ path: path.join(OUT, 'A.png') });

  const b = await player(browser, 'B', 'BRAVO');
  for (let i = 1; i <= 10; i++) {
    await wait(4000);
    const sb = await state(b);
    const sa = await state(a);
    console.log('  B t+' + i * 4 + 's ' + JSON.stringify({
      gState: sb.gState, kind: sb.kind, host: sb.host, slot: sb.slot,
      peers: sb.peers, err: sb.err
    }) + '   A: state=' + sa.gState + ' peers=' + sa.peers);
    if (sb.peers > 0 && sa.peers > 0) break;
    if (sb.err) break;
  }
  console.log('B trace: ' + JSON.stringify((await state(b)).trace));
  await a.screenshot({ path: path.join(OUT, 'A-final.png') });
  await b.screenshot({ path: path.join(OUT, 'B-final.png') });
  console.log('shots in ' + OUT);
  await browser.close();
})();
