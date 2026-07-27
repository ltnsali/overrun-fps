'use strict';
const { test, expect } = require('@playwright/test');
const {
  measure,
  expectFillsViewport,
  probeCoverage,
  resizeTo,
  exitFullscreen,
  nextFrame,
  collectErrors,
  startPlaying
} = require('./helpers');

/* Plays the deployed site over the real internet: the published files, three.js
   from its CDN and the public signalling server. Not part of `npm test` - run it
   with `npm run test:live`, and point it elsewhere with LIVE_URL=...
 *
 * The rest of the suite cannot see this class of bug. It serves the game from a
 * local server, stubs three.js out of node_modules and drives the transport
 * through BroadcastChannel or a fake Peer, so anything that only exists in a
 * real deployment - a file that was never published, a CDN that moved, ICE that
 * takes seconds, two players racing for the same peer id - is invisible to it.
 * Every deathmatch bug reported from the deployed site so far passed the whole
 * local suite at the time it was reported. */

const BOOT_MS = 90_000;
const MEET_MS = 90_000;

/* Every test gets a room nobody has used. Two reasons: the default ARENA on the
   live site may contain real players, and - the one that actually caught a bug -
   a busy room hides slot races, because whoever is already hosting absorbs
   everyone and they meet no matter what the code does. */
let seq = 0;
function freshRoom() {
  return ('L' + Date.now().toString(36) + ++seq).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-8);
}

/** Load the deployed game and wait for the menu. No local stubs of any kind. */
async function bootLive(page, query) {
  await page.goto('?' + (query || '') + '&cb=' + Date.now());
  await page.waitForFunction(() => window.G && window.G.state === 'menu', undefined, {
    timeout: BOOT_MS
  });
  await nextFrame(page, 2);
  return page;
}

/* Contexts created from the `browser` fixture are not cleaned up between tests,
   and every one of them leaves a full three.js game loop running on a software
   renderer. Left open they starve the machine: entering an arena measured 21.8s
   at the end of a run and 3.3s on its own, with the network trace showing only
   210ms of that was networking. So every context is tracked and closed. */
const opened = [];
async function newPageIn(browser) {
  const ctx = await browser.newContext();
  opened.push(ctx);
  return ctx.newPage();
}
test.afterEach(async () => {
  await Promise.all(opened.splice(0).map((c) => c.close().catch(() => {})));
});

async function openClient(browser, room, query) {
  const page = await newPageIn(browser);
  await bootLive(page, 'touch=0&room=' + room + (query ? '&' + query : ''));
  return page;
}

function enterArena(page, name) {
  return page.evaluate((n) => {
    document.getElementById('mpName').value = n;
    document.getElementById('btnMulti').click();
    document.getElementById('btnMpStart').click();
  }, name);
}

const snapshot = (page) =>
  page.evaluate(() => ({
    state: window.G.state,
    kind: window.NET.kind,
    slot: window.NET.slot,
    host: window.NET.isHost,
    sees: Object.keys(window.NET.peers)
      .map((id) => window.NET.peers[id].name)
      .sort(),
    bots: (window.ENEMIES || []).filter((e) => e.isBot).length,
    lobbyOpen: document.getElementById('mp').classList.contains('on'),
    err: document.getElementById('mpErr').textContent,
    trace: window.NET.trace
  }));

/** Everyone presses Enter Arena at the same instant - the only way to race. */
async function raceIntoRoom(browser, names) {
  const room = freshRoom();
  const pages = [];
  for (const name of names) pages.push(await openClient(browser, room));
  await Promise.all(pages.map((page, i) => enterArena(page, names[i])));

  /* Kept up to date by the wait so a failure can say what everyone was actually
     doing. Without it a live failure only tells you "they never met", which is
     the one thing you already knew. */
  let last = [];
  const report = () =>
    names.map((n, i) => '  ' + n + ' ' + JSON.stringify(last[i] || null)).join('\n');

  /* Hand-rolled rather than expect.poll, whose message is built before the wait
     starts and so cannot describe the failure. */
  const deadline = Date.now() + MEET_MS;
  let met = false;
  while (Date.now() < deadline) {
    last = await Promise.all(pages.map(snapshot));
    met = last.every((s) => s.state === 'playing' && s.sees.length === names.length - 1);
    if (met) break;
    await pages[0].waitForTimeout(500);
  }
  if (!met) throw new Error(names.length + ' players never met in room ' + room + ':\n' + report());
  return { room, pages, states: last, report };
}

async function meetInOneArena(browser, names) {
  const { states, report } = await raceIntoRoom(browser, names);
  // One room is one arena: the same slot for everyone, with a single host.
  expect(new Set(states.map((s) => s.slot)).size, 'the room split into two arenas:\n' + report()).toBe(1);
  expect(states.filter((s) => s.host).length, 'a room needs exactly one host:\n' + report()).toBe(1);
  states.forEach((s) => expect(s.kind).toBe('p2p'));
  return states;
}

/* ------------------------------------------------------------------ delivery
   Whether the deployment is actually complete and reachable. None of this can
   fail locally, where the files come off the disk that just built them. */
test.describe('what the deployment serves', () => {
  test('serves every file the page asks for', async ({ page }) => {
    const bad = [];
    const seen = new Map();
    page.on('response', (r) => seen.set(r.url(), r.status()));
    page.on('requestfailed', (r) =>
      bad.push(r.url() + ' -> ' + ((r.failure() && r.failure().errorText) || 'failed'))
    );
    await bootLive(page, 'touch=0');

    // Ask the document itself what it depends on, so a newly added script that
    // was never published is caught rather than assumed.
    const refs = await page.evaluate(() =>
      [].concat(
        [...document.querySelectorAll('script[src]')].map((s) => s.src),
        [...document.querySelectorAll('link[rel=stylesheet]')].map((l) => l.href)
      )
    );
    expect(refs.length, 'the page should pull in its scripts and stylesheets').toBeGreaterThan(20);

    for (const url of refs) {
      const status = seen.get(url);
      if (status === undefined || status >= 400) bad.push(url + ' -> ' + (status || 'no response'));
    }
    expect(bad, 'every file index.html references must be published').toEqual([]);
  });

  test('gets three.js from its CDN', async ({ page }) => {
    const three = [];
    page.on('response', (r) => {
      if (/three(\.min)?\.js/i.test(r.url())) three.push({ url: r.url(), status: r.status() });
    });
    await bootLive(page, 'touch=0');

    expect(await page.evaluate(() => !!window.THREE), 'the engine must be loaded').toBe(true);
    expect(
      three.some((r) => r.status === 200),
      'three.js came from ' + JSON.stringify(three)
    ).toBe(true);
    // A missing engine is the one failure the loading screen has to explain.
    await expect(page.locator('#loadErr')).toBeHidden();
  });

  test('loads nothing over plain http', async ({ page, baseURL }) => {
    test.skip(!/^https:/i.test(baseURL || ''), 'only meaningful on an https deployment');
    const insecure = [];
    page.on('request', (r) => {
      if (/^http:/i.test(r.url())) insecure.push(r.url());
    });
    await bootLive(page, 'touch=0');
    // One http subresource is enough for a browser to block the whole page.
    expect(insecure, 'mixed content breaks the game on https').toEqual([]);
  });

  test('boots without console errors', async ({ page }) => {
    const errors = collectErrors(page);
    await bootLive(page, 'touch=0');
    await nextFrame(page, 30);
    expect(errors).toEqual([]);
  });
});

/* ------------------------------------------------------------------ renderer
   Real WebGL against the real bundle, at the real screen sizes. */
test.describe('the deployed engine', () => {
  test('reaches the menu with a live WebGL context', async ({ page }) => {
    await bootLive(page, 'touch=0');
    expect(
      await page.evaluate(() => {
        const gl = window.G.renderer && window.G.renderer.getContext();
        return !!gl && !gl.isContextLost();
      })
    ).toBe(true);
  });

  test('keeps rendering frames', async ({ page }) => {
    await bootLive(page, 'touch=0');
    const first = await page.evaluate(() => window.G.frame);
    await page.waitForFunction((f) => window.G.frame > f + 5, first, { timeout: 30_000 });
  });

  test('fills the viewport with no blank strip', async ({ page }) => {
    await bootLive(page, 'touch=0');
    expectFillsViewport(await measure(page));
    expect(await probeCoverage(page), 'blank areas on screen').toEqual([]);
  });

  test('survives a rotation', async ({ page }) => {
    await bootLive(page, 'touch=0');
    await resizeTo(page, 640, 1024);
    await resizeTo(page, 1024, 640);
    // The half-blank-after-rotation bug only ever showed up on a real canvas.
    expectFillsViewport(await measure(page));
    expect(await probeCoverage(page)).toEqual([]);
  });

  test('boots within a reasonable time', async ({ page }) => {
    const started = Date.now();
    await bootLive(page, 'touch=0');
    // Includes the CDN fetch of three.js on a cold cache.
    expect(Date.now() - started, 'time to the main menu').toBeLessThan(45_000);
  });
});

/* ---------------------------------------------------------------- gameplay
   The published build, played through its own UI. Every round uses a private
   room so it cannot be disturbed by - or disturb - anyone else on the site. */
test.describe('the deployed game plays', () => {
  test('Enter Arena starts a deathmatch and shows the HUD', async ({ page }) => {
    await bootLive(page, 'touch=0&room=' + freshRoom());
    await startPlaying(page);

    await expect(page.locator('#hud')).toHaveClass(/on/);
    await expect(page.locator('#menu')).not.toHaveClass(/on/);
    await expect(page.locator('#waveTitle')).toHaveText('DEATHMATCH');
    await expect(page.locator('#wAmmo')).not.toBeEmpty();
    expectFillsViewport(await measure(page));
  });

  test('the player moves and switches weapons', async ({ page }) => {
    await bootLive(page, 'touch=0&room=' + freshRoom());
    await startPlaying(page);

    const at = () => page.evaluate(() => ({ x: window.PL.pos.x, z: window.PL.pos.z }));
    const before = await at();
    await page.keyboard.down('w');
    await nextFrame(page, 30);
    await page.keyboard.up('w');
    const after = await at();
    expect(
      Math.hypot(after.x - before.x, after.z - before.z),
      'W should move the player'
    ).toBeGreaterThan(0.2);

    // Number keys are 1-based over the loadout, so pick a slot that is not the
    // one already held - pressing the current weapon's key is a no-op.
    const { first, want } = await page.evaluate(() => ({
      first: window.PL.wi,
      want: (window.PL.wi + 1) % window.PL.weapons.length
    }));
    expect(want, 'the loadout should hold more than one weapon').not.toBe(first);
    await page.keyboard.press(String(want + 1));
    await nextFrame(page, 10);
    expect(await page.evaluate(() => window.PL.wi), 'number keys pick a weapon').toBe(want);
    await expect(page.locator('#wName')).not.toBeEmpty();
  });

  test('Escape pauses and resumes', async ({ page }) => {
    await bootLive(page, 'touch=0&room=' + freshRoom());
    await startPlaying(page);

    await page.keyboard.press('Escape');
    await expect(page.locator('#pause')).toHaveClass(/on/);
    expect(await page.evaluate(() => window.G.state)).toBe('paused');

    await page.locator('#btnResume').click();
    await expect(page.locator('#pause')).not.toHaveClass(/on/);
    await page.waitForFunction(() => window.G.state === 'playing');
  });

  test('aborting the mission returns to the menu', async ({ page }) => {
    await bootLive(page, 'touch=0&room=' + freshRoom());
    await startPlaying(page);

    await page.keyboard.press('Escape');
    await page.locator('#btnQuit').click();
    await page.waitForFunction(() => window.G.state === 'menu', undefined, { timeout: 20_000 });
    await expect(page.locator('#menu')).toHaveClass(/on/);
    // Leaving must also close the network down, or the arena keeps a ghost.
    expect(await page.evaluate(() => window.MATCH.on)).toBe(false);
  });

  test('the scoreboard opens on TAB', async ({ page }) => {
    await bootLive(page, 'touch=0&room=' + freshRoom());
    await startPlaying(page);

    await page.keyboard.down('Tab');
    await expect(page.locator('#board')).toHaveClass(/on/);
    await page.keyboard.up('Tab');
    await expect(page.locator('#board')).not.toHaveClass(/on/);
  });

  test('settings survive a reload on the real origin', async ({ page }) => {
    await bootLive(page, 'touch=0');
    await page.evaluate(() => {
      const set = (id, v) => {
        const el = document.getElementById(id);
        el.value = String(v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      set('optFov', 96);
      set('optSens', 1.75);
      const sh = document.getElementById('optShadow');
      if (sh.checked) sh.click();
    });
    expect(await page.evaluate(() => window.SET.fov)).toBe(96);

    // Same-origin storage on the deployed host, which is where a Pages sub-path
    // or a changed origin would quietly lose everyone's settings.
    await page.reload();
    await page.waitForFunction(() => window.G && window.G.state === 'menu', undefined, {
      timeout: BOOT_MS
    });
    const after = await page.evaluate(() => ({ ...window.SET }));
    expect(after.fov).toBe(96);
    expect(after.sens).toBeCloseTo(1.75, 2);
    expect(after.shadows).toBe(false);
  });
});

/* ------------------------------------------------------------------- mobile
   The deployed site on phone-shaped screens, including the portrait gate. */
test.describe('the deployed site on a phone', () => {
  test('portrait shows the rotate gate and landscape clears it', async ({ page }) => {
    await bootLive(page, 'touch=1');
    await resizeTo(page, 390, 780);
    await expect(page.locator('#rotate')).toBeVisible();

    await resizeTo(page, 780, 390);
    await expect(page.locator('#rotate')).toBeHidden();
    expectFillsViewport(await measure(page));
  });

  test('touch controls appear and the canvas stays full-bleed', async ({ page }) => {
    await bootLive(page, 'touch=1');
    await resizeTo(page, 780, 390);
    await startPlaying(page);
    await exitFullscreen(page);

    await expect(page.locator('#touchUI')).toHaveClass(/on/);
    for (const id of ['tFire', 'tAds', 'tJump', 'tReload']) {
      await expect(page.locator('#' + id)).toBeVisible();
    }
    expectFillsViewport(await measure(page));
    expect(await probeCoverage(page)).toEqual([]);
  });
});

/* ------------------------------------------------------------- online arenas
   Real WebRTC through the public signalling server - the part that has produced
   every deathmatch bug so far, and the part the local suite cannot reproduce. */
test.describe('online arenas on the deployed site', () => {
  test('two players entering an empty room at once land in one arena', async ({ browser }) => {
    const [a, b] = await meetInOneArena(browser, ['ALI', 'ALI2']);
    expect(a.sees).toEqual(['ALI2']);
    expect(b.sees).toEqual(['ALI']);
  });

  test('three players entering an empty room at once land in one arena', async ({ browser }) => {
    const states = await meetInOneArena(browser, ['ONE', 'TWO', 'TRE']);
    states.forEach((s) => expect(s.sees.length).toBe(2));
  });

  test('a player joining a room that already has a host meets them', async ({ browser }) => {
    const room = freshRoom();
    const host = await openClient(browser, room);
    await enterArena(host, 'HOST');
    await host.waitForFunction(() => window.G.state === 'playing', undefined, { timeout: MEET_MS });

    const guest = await openClient(browser, room);
    await enterArena(guest, 'GUEST');
    await guest.waitForFunction(() => window.G.state === 'playing', undefined, { timeout: MEET_MS });

    await expect
      .poll(async () => (await snapshot(guest)).sees, { timeout: MEET_MS })
      .toEqual(['HOST']);
    await expect
      .poll(async () => (await snapshot(host)).sees, { timeout: MEET_MS })
      .toEqual(['GUEST']);

    const [h, g] = [await snapshot(host), await snapshot(guest)];
    expect(h.host, 'the first player in owns the arena').toBe(true);
    expect(g.host, 'the second player joins rather than hosting').toBe(false);
    expect(g.slot).toBe(h.slot);
  });

  test('both players build the same arena from the room code', async ({ browser }) => {
    const { pages } = await raceIntoRoom(browser, ['MAPA', 'MAPB']);
    const fingerprint = (page) =>
      page.evaluate(() => {
        // Collider layout is what players collide with and shoot at, so a
        // mismatch means they are standing in different geometry.
        let h = 0;
        for (const c of window.WORLD.colliders) {
          h = (h * 31 + Math.round((c.minx + c.miny + c.minz + c.maxx + c.maxy + c.maxz) * 100)) | 0;
        }
        return { count: window.WORLD.colliders.length, hash: h };
      });
    const [a, b] = await Promise.all(pages.map(fingerprint));
    expect(a.count).toBeGreaterThan(0);
    expect(b).toEqual(a);
  });

  test('a player who leaves disappears from the arena', async ({ browser }) => {
    const { pages } = await raceIntoRoom(browser, ['STAY', 'GONE']);
    await pages[1].close();
    // MP_DROP seconds of silence, plus room for a slow live connection.
    await expect.poll(async () => (await snapshot(pages[0])).sees, { timeout: 45_000 }).toEqual([]);
  });

  test('separate rooms are separate arenas', async ({ browser }) => {
    const one = await openClient(browser, freshRoom());
    const two = await openClient(browser, freshRoom());
    await Promise.all([enterArena(one, 'ROOMA'), enterArena(two, 'ROOMB')]);
    for (const p of [one, two]) {
      await p.waitForFunction(() => window.G.state === 'playing', undefined, { timeout: MEET_MS });
    }
    // A shared ?room= link is the only privacy the game offers, so leaking
    // across room codes would be worse than not having it.
    await one.waitForTimeout(6000);
    expect((await snapshot(one)).sees).toEqual([]);
    expect((await snapshot(two)).sees).toEqual([]);
  });

  test('entering the arena takes seconds, not minutes', async ({ browser }) => {
    // A join deadline long enough to survive slow ICE must not make the common
    // case - an empty room, which the server rejects immediately - slow as well.
    const page = await openClient(browser, freshRoom());
    const started = Date.now();
    await enterArena(page, 'TIMER');
    await page.waitForFunction(() => window.G.state === 'playing', undefined, { timeout: 60_000 });
    const took = Date.now() - started;
    // Without the trace a slow entry is just a number, and the reason it was slow
    // - which slot was probed, what the claim said - is exactly what is needed.
    const trace = (await snapshot(page)).trace.join('\n  ');
    expect(took, 'entering an empty room took ' + took + 'ms:\n  ' + trace).toBeLessThan(20_000);
  });

  test('a player who cannot reach signalling is told, and gets no bots match', async ({
    browser
  }) => {
    const page = await newPageIn(browser);
    // Stand in for a blocked signalling host, a proxy or a content blocker - all
    // of which a player hits as "the library never loaded".
    await page.route(/peerjs/i, (route) => route.abort());
    await bootLive(page, 'touch=0');
    await enterArena(page, 'BLOCKED');

    await expect(page.locator('#mpErr')).not.toBeEmpty({ timeout: 60_000 });
    const s = await snapshot(page);
    // Dropping the player into a bots-only arena here would be pretending to be
    // online, so the lobby has to stay put and say what went wrong.
    expect(s.state, 'a failed connection must not start a match').not.toBe('playing');
    expect(s.lobbyOpen, 'the player stays in the lobby').toBe(true);
    expect(s.bots).toBe(0);
    expect(s.err).toMatch(/Enter Arena/i);
  });
});
