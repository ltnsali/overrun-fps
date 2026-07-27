'use strict';
/**
 * Networked deathmatch: two independent browser contexts join the same arena
 * through the real relay (server/relay.js) and fight each other.
 */

const { test, expect } = require('@playwright/test');
const { useLocalThree, nextFrame } = require('./helpers');

const RELAY_PORT = Number(process.env.RELAY_PORT || 8788);
const RELAY = `ws://127.0.0.1:${RELAY_PORT}`;

let roomSeq = 0;
function roomFor(testInfo) {
  // Unique per test so parallel workers never share an arena.
  return ('R' + (Date.now() % 100000) + (roomSeq++) + testInfo.workerIndex)
    .replace(/[^A-Z0-9]/gi, '')
    .toUpperCase()
    .slice(0, 8);
}

/** Boot a client straight into a live deathmatch in `room`. */
async function joinArena(page, room, name) {
  await useLocalThree(page);
  await page.goto(`/?touch=0&relay=${encodeURIComponent(RELAY)}`);
  await page.waitForFunction(() => window.G && window.G.state === 'menu', undefined, {
    timeout: 45_000
  });
  const ok = await page.evaluate(
    ({ room, name }) =>
      new Promise((resolve) => {
        window.mpConnect('ws', room, name, (good) => {
          if (good) window.startGame('dm');
          resolve(good);
        });
      }),
    { room, name }
  );
  expect(ok, `${name} should reach the relay`).toBe(true);
  await page.waitForFunction(() => window.G.state === 'playing' && window.MATCH.on);
  return page;
}

/** Freeze a player at a world position so network tests are deterministic. */
async function pinAt(page, x, y, z) {
  await page.evaluate(
    ({ x, y, z }) => {
      if (window.__pin) clearInterval(window.__pin);
      window.__pin = setInterval(() => {
        window.PL.pos.set(x, y, z);
        window.PL.vel.set(0, 0, 0);
      }, 16);
    },
    { x, y, z }
  );
}
async function unpin(page) {
  await page.evaluate(() => {
    if (window.__pin) clearInterval(window.__pin);
    window.__pin = null;
  });
}

const peerCount = (page) => page.evaluate(() => Object.keys(window.NET.peers).length);

/** Aim at the opponent's interpolated body centre and fire one exact shot. */
function shootPeer(page) {
  return page.evaluate(() => {
    window.currentSpread = function () {
      return 0;
    };
    const ids = Object.keys(window.NET.peers);
    if (!ids.length) return { fired: false, reason: 'no peers' };
    const rp = window.NET.peers[ids[0]];

    const cx = (rp.hitBody.minx + rp.hitBody.maxx) / 2;
    const cy = (rp.hitBody.miny + rp.hitBody.maxy) / 2;
    const cz = (rp.hitBody.minz + rp.hitBody.maxz) / 2;
    const ex = PL.pos.x;
    const ey = PL.pos.y + PL.eye;
    const ez = PL.pos.z;
    const dx = cx - ex;
    const dy = cy - ey;
    const dz = cz - ez;

    PL.yaw = Math.atan2(-dx, -dz);
    PL.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    PL.recoilP = 0;
    PL.recoilY = 0;
    PL.bobAmt = 0;
    PL.fireCd = 0;
    PL.heat = 0;
    G.shake = 0;
    G.shakeTime = 0;
    PL.shakeOff.set(0, 0, 0);

    updateCamera(0);
    G.camera.updateMatrixWorld(true);
    fireWeapon();
    return { fired: true, target: ids[0] };
  });
}

test.describe('deathmatch lobby', () => {
  test('the lobby asks for a callsign and nothing else', async ({ page }) => {
    await useLocalThree(page);
    await page.goto('/?touch=0');
    await page.waitForFunction(() => window.G && window.G.state === 'menu');

    await page.locator('#btnMulti').click();
    await expect(page.locator('#mp')).toHaveClass(/on/);
    await expect(page.locator('#mpName')).toBeVisible();

    // Every other knob is gone - defaults are applied silently.
    for (const gone of ['#mpRoom', '#mpFrags', '#mpTime', '#mpBots']) {
      expect(await page.locator(gone).count(), gone + ' should not exist').toBe(0);
    }
    expect(await page.evaluate(() => window.MPOPT)).toEqual({
      fragLimit: 20,
      timeLimit: 300,
      bots: 4
    });
    // One button to play, and the arena comes from the URL.
    await expect(page.locator('#btnMpStart')).toBeVisible();
    expect(await page.evaluate(() => window.mpRoomFromUrl())).toBe('ARENA');
  });

  test('a shared ?room= link pins a private arena', async ({ page }) => {
    await useLocalThree(page);
    await page.goto('/?touch=0&room=squad7');
    await page.waitForFunction(() => window.G && window.G.state === 'menu');
    expect(await page.evaluate(() => window.mpRoomFromUrl())).toBe('SQUAD7');
  });

  test('an unreachable arena server reports it instead of going offline', async ({ page }) => {
    await useLocalThree(page);
    // Port 1 is guaranteed to have nothing listening. ?net=relay pins the transport
    // so the test stays hermetic instead of cascading to peer-to-peer.
    await page.goto('/?touch=0&net=relay&relay=' + encodeURIComponent('ws://127.0.0.1:1'));
    await page.waitForFunction(() => window.G && window.G.state === 'menu');

    await page.locator('#btnMulti').click();
    await page.locator('#btnMpStart').click();

    await expect(page.locator('#mpErr')).toContainText(/arena server/i, { timeout: 20_000 });
    expect(await page.evaluate(() => window.G.state)).toBe('menu');
  });

  test('a player who cannot get online plays bots instead of hitting a dead end', async ({
    page
  }) => {
    await useLocalThree(page);
    // No peer-to-peer library means no way to reach the arena - the same dead end
    // a signalling outage produces, but hermetic.
    await page.route(/peerjs/i, (route) => route.abort());
    await page.goto('/?touch=0&net=p2p');
    await page.waitForFunction(() => window.G && window.G.state === 'menu');

    await page.locator('#btnMulti').click();
    await page.locator('#btnMpStart').click();

    // It must still start a playable match rather than parking on an error.
    await page.waitForFunction(() => window.G.state === 'playing' && window.MATCH.on, undefined, {
      timeout: 45_000
    });
    await nextFrame(page, 90);

    const state = await page.evaluate(() => ({
      kind: window.NET.kind,
      online: window.MATCH.online,
      bots: window.ENEMIES.filter((e) => e.isBot).length,
      status: document.getElementById('netStat').textContent,
      lobby: document.getElementById('mpErr').textContent
    }));
    expect(state.kind, 'the failed online attempt should land offline').toBe('off');
    expect(state.online).toBe(false);
    expect(state.bots, 'an offline arena needs bots to be worth playing').toBeGreaterThan(0);
    // Loud, not silent: the player must know they are not online.
    expect(state.status).toMatch(/offline/i);
    expect(state.lobby, 'the lobby keeps the reason so retrying is obvious').toMatch(
      /Enter Arena/i
    );
  });

  test('transport selection: derived relay, explicit override, forced local', async ({ page }) => {
    await useLocalThree(page);

    // Served over plain http, so a relay is plausible and gets derived.
    await page.goto('/?touch=0');
    await page.waitForFunction(() => window.G && window.G.state === 'menu');
    expect(await page.evaluate(() => window.mpRelayUrl())).toMatch(/^ws:\/\/.+:8787$/);

    // An explicit ?relay= always wins.
    await page.goto('/?touch=0&relay=' + encodeURIComponent('ws://example.test:9999'));
    await page.waitForFunction(() => window.G && window.G.state === 'menu');
    expect(await page.evaluate(() => window.mpRelayUrl())).toBe('ws://example.test:9999');

    // ?net=local pins the cross-tab arena even when a relay could be reached.
    await page.goto('/?touch=0&net=local');
    await page.waitForFunction(() => window.G && window.G.state === 'menu');
    await page.locator('#btnMulti').click();
    await page.locator('#btnMpStart').click();
    await page.waitForFunction(() => window.G.state === 'playing' && window.MATCH.on, undefined, {
      timeout: 20_000
    });
    expect(await page.evaluate(() => window.NET.kind)).toBe('local');
  });

  test('two tabs on one device share a local arena with no server at all', async ({ browser }) => {
    // BroadcastChannel is per browser context, so both tabs live in one context.
    const ctx = await browser.newContext();
    const a = await ctx.newPage();
    const b = await ctx.newPage();

    for (const p of [a, b]) {
      await useLocalThree(p);
      await p.goto('/?touch=0&net=local');
      await p.waitForFunction(() => window.G && window.G.state === 'menu', undefined, {
        timeout: 45_000
      });
    }
    await a.evaluate(() => {
      document.getElementById('mpName').value = 'TABA';
      document.getElementById('btnMulti').click();
      document.getElementById('btnMpStart').click();
    });
    await b.evaluate(() => {
      document.getElementById('mpName').value = 'TABB';
      document.getElementById('btnMulti').click();
      document.getElementById('btnMpStart').click();
    });
    for (const p of [a, b]) {
      await p.waitForFunction(() => window.G.state === 'playing' && window.MATCH.on, undefined, {
        timeout: 20_000
      });
    }

    // They must see each other through BroadcastChannel alone.
    await expect
      .poll(() => a.evaluate(() => Object.keys(window.NET.peers).length), { timeout: 15_000 })
      .toBe(1);
    expect(
      await a.evaluate(() => window.NET.peers[Object.keys(window.NET.peers)[0]].name)
    ).toBe('TABB');

    await ctx.close();
  });

  test('a lone player in an online arena still gets a sparring bot', async ({ page }) => {
    await useLocalThree(page);
    await page.goto('/?touch=0&net=local');
    await page.waitForFunction(() => window.G && window.G.state === 'menu');

    await page.locator('#btnMulti').click();
    await page.locator('#btnMpStart').click();
    await page.waitForFunction(() => window.G.state === 'playing' && window.MATCH.on, undefined, {
      timeout: 20_000
    });

    // Online, but nobody else is here - so there is somebody to fight.
    expect(await page.evaluate(() => window.NET.kind)).toBe('local');
    expect(await page.evaluate(() => Object.keys(window.NET.peers).length)).toBe(0);
    await expect
      .poll(() => page.evaluate(() => window.ENEMIES.filter((e) => e.isBot && !e.dead).length), {
        timeout: 20_000
      })
      .toBe(1);

    // Killing it scores a frag and it is replaced, so the arena is never empty.
    await page.evaluate(() => {
      const bot = window.ENEMIES.find((e) => e.isBot && !e.dead);
      window.damageEnemy(bot, 99999, false, bot.pos.clone(), 'smg');
    });
    await expect.poll(() => page.evaluate(() => window.MATCH.kills)).toBe(1);
    await expect
      .poll(() => page.evaluate(() => window.ENEMIES.filter((e) => e.isBot && !e.dead).length), {
        timeout: 20_000
      })
      .toBe(1);
  });

  test('bots stand down as soon as a real player joins', async ({ browser }) => {
    const ctx = await browser.newContext();
    const a = await ctx.newPage();
    const b = await ctx.newPage();

    for (const p of [a, b]) {
      await useLocalThree(p);
      await p.goto('/?touch=0&net=local');
      await p.waitForFunction(() => window.G && window.G.state === 'menu', undefined, {
        timeout: 45_000
      });
    }

    await a.evaluate(() => {
      document.getElementById('mpName').value = 'ALONE';
      document.getElementById('btnMulti').click();
      document.getElementById('btnMpStart').click();
    });
    await a.waitForFunction(() => window.G.state === 'playing' && window.MATCH.on);
    // Alone: a bot appears.
    await expect
      .poll(() => a.evaluate(() => window.ENEMIES.filter((e) => e.isBot && !e.dead).length), {
        timeout: 20_000
      })
      .toBe(1);

    await b.evaluate(() => {
      document.getElementById('mpName').value = 'ARRIVAL';
      document.getElementById('btnMulti').click();
      document.getElementById('btnMpStart').click();
    });
    await b.waitForFunction(() => window.G.state === 'playing' && window.MATCH.on);

    // A real opponent showed up, so the locally simulated bots must go.
    await expect.poll(() => a.evaluate(() => Object.keys(window.NET.peers).length), {
      timeout: 15_000
    }).toBe(1);
    await expect
      .poll(() => a.evaluate(() => window.ENEMIES.filter((e) => e.isBot).length), { timeout: 15_000 })
      .toBe(0);
    await expect
      .poll(() => b.evaluate(() => window.ENEMIES.filter((e) => e.isBot).length), { timeout: 15_000 })
      .toBe(0);

    await ctx.close();
  });

  test('solo practice runs a deathmatch with bots and no network', async ({ page }) => {
    await useLocalThree(page);
    await page.goto('/?touch=0');
    await page.waitForFunction(() => window.G && window.G.state === 'menu');

    await page.locator('#btnMulti').click();
    await page.evaluate(() => mpEnterArena(true));   // solo practice, no UI button any more

    await page.waitForFunction(() => window.G.state === 'playing' && window.MATCH.on);
    expect(await page.evaluate(() => window.NET.kind)).toBe('off');
    await expect(page.locator('#waveTitle')).toHaveText('DEATHMATCH');

    // Bots keep the arena populated.
    await expect
      .poll(() => page.evaluate(() => window.ENEMIES.filter((e) => e.isBot && !e.dead).length), {
        timeout: 20_000
      })
      .toBeGreaterThan(0);

    // Killing a bot is a frag.
    await page.evaluate(() => {
      const bot = window.ENEMIES.find((e) => e.isBot && !e.dead);
      window.damageEnemy(bot, 99999, false, bot.pos.clone(), 'smg');
    });
    await expect.poll(() => page.evaluate(() => window.MATCH.kills)).toBe(1);
  });

  test('a match ends when the clock runs out', async ({ page }) => {
    await useLocalThree(page);
    await page.goto('/?touch=0&net=local');
    await page.waitForFunction(() => window.G && window.G.state === 'menu');

    await page.locator('#btnMulti').click();
    await page.locator('#btnMpStart').click();
    await page.waitForFunction(() => window.G.state === 'playing' && window.MATCH.on, undefined, {
      timeout: 20_000
    });

    // Wind the clock to the final moment rather than waiting five minutes.
    await page.evaluate(() => {
      MATCH.kills = 2;
      MATCH.t = MATCH.timeLimit - 0.05;
    });

    await expect(page.locator('#mover')).toHaveClass(/on/, { timeout: 20_000 });
    expect(await page.evaluate(() => window.MATCH.on)).toBe(false);
    await expect(page.locator('#moverRows .brow.me')).toBeVisible();
    await expect(page.locator('#moverFoot')).toContainText(/PLAYED/i);
  });

  test('TAB opens the scoreboard during a match', async ({ page }) => {
    await useLocalThree(page);
    await page.goto('/?touch=0');
    await page.waitForFunction(() => window.G && window.G.state === 'menu');
    await page.locator('#btnMulti').click();
    await page.evaluate(() => mpEnterArena(true));
    await page.waitForFunction(() => window.MATCH.on);

    await page.keyboard.down('Tab');
    await expect(page.locator('#board')).toHaveClass(/on/);
    await expect(page.locator('#boardRows .brow.me')).toContainText('PLAYER');

    await page.keyboard.up('Tab');
    await expect(page.locator('#board')).not.toHaveClass(/on/);
  });
});

test.describe('networked deathmatch', () => {
  test('two clients in one arena see each other', async ({ browser }, testInfo) => {
    const room = roomFor(testInfo);
    const a = await (await browser.newContext()).newPage();
    const b = await (await browser.newContext()).newPage();

    await joinArena(a, room, 'ALPHA');
    await joinArena(b, room, 'BRAVO');

    await expect.poll(() => peerCount(a), { timeout: 15_000 }).toBe(1);
    await expect.poll(() => peerCount(b), { timeout: 15_000 }).toBe(1);

    const seen = await a.evaluate(() => {
      const rp = window.NET.peers[Object.keys(window.NET.peers)[0]];
      return { name: rp.name, hasMesh: !!rp.mesh.parent, alive: rp.alive };
    });
    expect(seen.name).toBe('BRAVO');
    expect(seen.hasMesh, 'the opponent avatar must be in the scene').toBe(true);
    expect(seen.alive).toBe(true);

    await a.context().close();
    await b.context().close();
  });

  test('both clients build the same arena from the room code', async ({ browser }, testInfo) => {
    const room = roomFor(testInfo);
    const a = await (await browser.newContext()).newPage();
    const b = await (await browser.newContext()).newPage();

    await joinArena(a, room, 'ALPHA');
    await joinArena(b, room, 'BRAVO');

    const fingerprint = (page) =>
      page.evaluate(() => {
        // Collider layout is what players actually collide with and shoot at.
        let h = 0;
        for (const c of window.WORLD.colliders) {
          h = (h * 31 + Math.round((c.minx + c.miny + c.minz + c.maxx + c.maxy + c.maxz) * 100)) | 0;
        }
        return { count: window.WORLD.colliders.length, hash: h };
      });

    const fa = await fingerprint(a);
    const fb = await fingerprint(b);
    expect(fa.count).toBeGreaterThan(10);
    expect(fb, 'clients must generate identical geometry').toEqual(fa);

    await a.context().close();
    await b.context().close();
  });

  test('shooting an opponent damages them across the network', async ({ browser }, testInfo) => {
    const room = roomFor(testInfo);
    const a = await (await browser.newContext()).newPage();
    const b = await (await browser.newContext()).newPage();

    await joinArena(a, room, 'ALPHA');
    await joinArena(b, room, 'BRAVO');

    // 40m up, well clear of every collider, 14m apart.
    await pinAt(a, 0, 40, 0);
    await pinAt(b, 0, 40, -14);
    await expect.poll(() => peerCount(a), { timeout: 15_000 }).toBe(1);

    // Let the interpolation buffer fill so the opponent's box is where it should be.
    await expect
      .poll(
        () =>
          a.evaluate(() => {
            const rp = window.NET.peers[Object.keys(window.NET.peers)[0]];
            return rp ? Math.round(rp.pos.z) : 0;
          }),
        { timeout: 15_000 }
      )
      .toBe(-14);

    const before = await b.evaluate(() => window.PL.hp);
    const shot = await shootPeer(a);
    expect(shot.fired).toBe(true);

    await expect.poll(() => b.evaluate(() => window.PL.hp), { timeout: 10_000 }).toBeLessThan(before);
    // The victim knows who shot them.
    expect(await b.evaluate(() => window.PL.lastAttacker)).toBeTruthy();

    await unpin(a);
    await unpin(b);
    await a.context().close();
    await b.context().close();
  });

  test('a frag scores for the shooter and respawns the victim', async ({ browser }, testInfo) => {
    const room = roomFor(testInfo);
    const a = await (await browser.newContext()).newPage();
    const b = await (await browser.newContext()).newPage();

    await joinArena(a, room, 'ALPHA');
    await joinArena(b, room, 'BRAVO');

    await pinAt(a, 0, 40, 0);
    await pinAt(b, 0, 40, -14);
    await expect.poll(() => peerCount(a), { timeout: 15_000 }).toBe(1);
    await expect
      .poll(
        () =>
          a.evaluate(() => {
            const rp = window.NET.peers[Object.keys(window.NET.peers)[0]];
            return rp ? Math.round(rp.pos.z) : 0;
          }),
        { timeout: 15_000 }
      )
      .toBe(-14);

    await b.evaluate(() => {
      window.PL.hp = 1;
      window.PL.armor = 0;
      window.MATCH.respawnDelay = 0.4;
    });

    await shootPeer(a);

    // Victim goes down, shows the respawn overlay and comes back.
    await expect.poll(() => b.evaluate(() => window.MATCH.deaths), { timeout: 10_000 }).toBe(1);
    await unpin(b);
    await expect.poll(() => b.evaluate(() => window.PL.alive), { timeout: 10_000 }).toBe(true);
    expect(await b.evaluate(() => window.PL.hp)).toBe(100);

    // Shooter is credited and both scoreboards agree.
    await expect.poll(() => a.evaluate(() => window.MATCH.kills), { timeout: 10_000 }).toBe(1);
    await expect
      .poll(() =>
        b.evaluate(() => {
          const rp = window.NET.peers[Object.keys(window.NET.peers)[0]];
          return rp ? rp.kills : -1;
        })
      )
      .toBe(1);

    await unpin(a);
    await a.context().close();
    await b.context().close();
  });

  test('reaching the frag limit ends the match', async ({ browser }, testInfo) => {
    const room = roomFor(testInfo);
    const a = await (await browser.newContext()).newPage();
    const b = await (await browser.newContext()).newPage();

    await joinArena(a, room, 'ALPHA');
    await joinArena(b, room, 'BRAVO');

    await pinAt(a, 0, 40, 0);
    await pinAt(b, 0, 40, -14);
    await expect.poll(() => peerCount(a), { timeout: 15_000 }).toBe(1);
    await expect
      .poll(
        () =>
          a.evaluate(() => {
            const rp = window.NET.peers[Object.keys(window.NET.peers)[0]];
            return rp ? Math.round(rp.pos.z) : 0;
          }),
        { timeout: 15_000 }
      )
      .toBe(-14);

    await a.evaluate(() => {
      window.MATCH.fragLimit = 1;
    });
    await b.evaluate(() => {
      window.PL.hp = 1;
      window.MATCH.respawnDelay = 0.4;
    });

    await shootPeer(a);

    await expect(a.locator('#mover')).toHaveClass(/on/, { timeout: 15_000 });
    await expect(a.locator('#moverTitle')).toHaveText('YOU WIN');
    await expect(a.locator('#moverRows .brow.me')).toContainText('ALPHA');
    expect(await a.evaluate(() => window.MATCH.on)).toBe(false);

    await unpin(a);
    await unpin(b);
    await a.context().close();
    await b.context().close();
  });

  test('a leaving player disappears from the arena', async ({ browser }, testInfo) => {
    const room = roomFor(testInfo);
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();

    await joinArena(a, room, 'ALPHA');
    await joinArena(b, room, 'BRAVO');
    await expect.poll(() => peerCount(a), { timeout: 15_000 }).toBe(1);

    await ctxB.close();
    await expect.poll(() => peerCount(a), { timeout: 15_000 }).toBe(0);

    await ctxA.close();
  });
});

test.describe('relay hardening', () => {
  test('health endpoint answers and non-websocket requests are refused', async ({ request }) => {
    const health = await request.get(`http://127.0.0.1:${RELAY_PORT}/health`);
    expect(health.ok()).toBe(true);
    expect((await health.json()).ok).toBe(true);

    const plain = await request.get(`http://127.0.0.1:${RELAY_PORT}/`);
    expect(plain.status()).toBe(426);
  });

  test('a malformed room code is rejected', async ({ page }) => {
    const result = await page.evaluate(
      (relay) =>
        new Promise((resolve) => {
          const ws = new WebSocket(relay + '/?room=' + encodeURIComponent('../../etc'));
          const done = (v) => resolve(v);
          ws.onopen = () => done('open');
          ws.onerror = () => done('rejected');
          ws.onclose = () => done('rejected');
          setTimeout(() => done('timeout'), 5000);
        }),
      RELAY
    );
    expect(result).toBe('rejected');
  });

  test('oversized payloads drop the connection instead of the server', async ({ page }) => {
    const result = await page.evaluate(
      (relay) =>
        new Promise((resolve) => {
          const ws = new WebSocket(relay + '/?room=FLOOD');
          ws.onopen = () => ws.send(JSON.stringify({ t: 's', pad: 'x'.repeat(20000) }));
          ws.onclose = () => resolve('closed');
          ws.onerror = () => resolve('closed');
          setTimeout(() => resolve('still open'), 6000);
        }),
      RELAY
    );
    expect(result).toBe('closed');

    // ...and the relay is still serving everyone else.
    const health = await page.request.get(`http://127.0.0.1:${RELAY_PORT}/health`);
    expect(health.ok()).toBe(true);
  });
});
