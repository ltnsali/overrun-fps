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

  test('a host that is slow to finish the handshake is not abandoned', async ({ page }) => {
    await useLocalThree(page);
    await page.goto('/?touch=0&net=local');
    await page.waitForFunction(() => window.G && window.G.state === 'menu');

    const result = await page.evaluate(
      () =>
        new Promise((resolve) => {
          // A real host: answers our offer straight away, but ICE only completes
          // after 6s. Giving up before that leaves both players hosting separate
          // slots of the same room, each waiting for the other.
          const HELLO = { t: 's', id: 'HOST', n: 'HOST', x: 0, y: 1, z: 0, a: 0, b: 0, hp: 100 };
          window.Peer = function () {
            const on = {};
            this.on = (k, f) => {
              on[k] = f;
            };
            this.destroy = () => {};
            this.connect = () => {
              const ch = {};
              const conn = { peerConnection: {}, on: (k, f) => (ch[k] = f), send: () => {} };
              setTimeout(() => (conn.peerConnection.remoteDescription = { sdp: 'x' }), 100);
              setTimeout(() => {
                ch.open && ch.open();
                /* A host that is alive is broadcasting snapshots fifteen times a
                   second. Silence is how a registration that outlived its owner
                   is told apart from a real arena, so the fake has to speak. */
                ch.data && ch.data(HELLO);
              }, 6000);
              return conn;
            };
            setTimeout(() => on.open && on.open('anon'), 10);
          };
          window.NET.room = 'TEST';
          const t0 = Date.now();
          window.mpP2PTryJoin(0, (ok) => resolve({ ok, ms: Date.now() - t0 }));
        })
    );
    expect(result.ok, 'a host that answered must not be walked past').toBe(true);
    expect(result.ms, 'it should have waited out the slow handshake').toBeGreaterThan(5000);
  });

  test('a dead slot is given up on quickly', async ({ page }) => {
    await useLocalThree(page);
    await page.goto('/?touch=0&net=local');
    await page.waitForFunction(() => window.G && window.G.state === 'menu');

    const result = await page.evaluate(
      () =>
        new Promise((resolve) => {
          // A ghost registration: still listed, but it never answers the offer.
          window.Peer = function () {
            const on = {};
            this.on = (k, f) => {
              on[k] = f;
            };
            this.destroy = () => {};
            this.connect = () => ({ peerConnection: {}, on: () => {}, send: () => {} });
            setTimeout(() => on.open && on.open('anon'), 10);
          };
          window.NET.room = 'TEST';
          const t0 = Date.now();
          window.mpP2PTryJoin(0, (ok) => resolve({ ok, ms: Date.now() - t0 }));
        })
    );
    expect(result.ok).toBe(false);
    // Patience is only extended to hosts that actually answered.
    expect(result.ms, 'a silent slot must not burn the long deadline').toBeLessThan(6000);
  });

  test('losing the race for a slot joins the winner instead of hosting the next one', async ({
    page
  }) => {
    await useLocalThree(page);
    await page.goto('/?touch=0&net=local');
    await page.waitForFunction(() => window.G && window.G.state === 'menu');

    const result = await page.evaluate(
      () =>
        new Promise((resolve) => {
          // Two players enter at the same moment: both find slot 0 empty, both
          // claim it, and we are the one that loses. The slot is joinable from
          // then on, because the winner is now hosting it.
          const HELLO = { t: 's', id: 'HOST', n: 'HOST', x: 0, y: 1, z: 0, a: 0, b: 0, hp: 100 };
          let probes = 0;
          window.Peer = function (id) {
            const on = {};
            this.on = (k, f) => (on[k] = f);
            this.destroy = () => {};
            this.connect = () => {
              const ch = {};
              const conn = { peerConnection: {}, on: (k, f) => (ch[k] = f), send: () => {} };
              if (++probes > 1) {
                setTimeout(() => {
                  conn.peerConnection.remoteDescription = { sdp: 'x' };
                  ch.open && ch.open();
                  ch.data && ch.data(HELLO);   /* a live host speaks at once */
                }, 30);
              }
              return conn; // the first probe finds nobody and stays silent
            };
            setTimeout(() => {
              if (id) on.error && on.error({ type: 'unavailable-id' });
              else on.open && on.open('anon');
            }, 10);
          };
          window.NET.room = 'TEST';
          window.mpP2PSlot(0, (ok) =>
            resolve({ ok, slot: window.NET.slot, host: window.NET.isHost })
          );
        })
    );
    expect(result.ok).toBe(true);
    // Stepping to slot 1 here is what splits one room into two arenas.
    expect(result.slot, 'must join the slot the winner took, not the next one').toBe(0);
    expect(result.host, 'the loser of the race is a client').toBe(false);
  });

  test('a busy host is knocked on again rather than abandoned for the next slot', async ({
    page
  }) => {
    await useLocalThree(page);
    await page.goto('/?touch=0&net=local');
    await page.waitForFunction(() => window.G && window.G.state === 'menu');

    const result = await page.evaluate(
      () =>
        new Promise((resolve) => {
          /* Three players enter at once, so the winner of slot 0 has two losers
             knocking at the same time and misses one offer before answering it.
             Observed live: the second loser gave up on a slot it had just been
             told was owned, and hosted slot 1 alone. */
          const HELLO = { t: 's', id: 'HOST', n: 'HOST', x: 0, y: 1, z: 0, a: 0, b: 0, hp: 100 };
          let probes = 0;
          window.Peer = function (id) {
            const on = {};
            this.on = (k, f) => (on[k] = f);
            this.destroy = () => {};
            this.connect = () => {
              const ch = {};
              const conn = { peerConnection: {}, on: (k, f) => (ch[k] = f), send: () => {} };
              // Probes 1 and 2 go unanswered - the host is busy with the other loser.
              if (++probes > 2) {
                setTimeout(() => {
                  conn.peerConnection.remoteDescription = { sdp: 'x' };
                  ch.open && ch.open();
                  ch.data && ch.data(HELLO);   /* a live host speaks at once */
                }, 30);
              }
              return conn;
            };
            setTimeout(() => {
              if (id) on.error && on.error({ type: 'unavailable-id' });
              else on.open && on.open('anon');
            }, 10);
          };
          window.NET.room = 'TEST';
          window.mpP2PSlot(0, (ok) =>
            resolve({ ok, slot: window.NET.slot, host: window.NET.isHost, probes })
          );
        })
    );
    expect(result.ok).toBe(true);
    expect(result.slot, 'one missed offer must not split the room').toBe(0);
    expect(result.host, 'the loser of the race is a client').toBe(false);
  });

  test('a claim that times out is not mistaken for a free slot', async ({ page }) => {
    await useLocalThree(page);
    await page.goto('/?touch=0&net=local');
    await page.waitForFunction(() => window.G && window.G.state === 'menu');

    const result = await page.evaluate(
      () =>
        new Promise((resolve) => {
          /* Slot 0 is owned, but the signalling server never answers our attempt
             to take it - no error, just silence until the claim deadline. That is
             not evidence the slot is free, yet it used to be read as "dead slot"
             and stepped over, so both players ended up hosting their own arena.
             Observed live: two players, slot 0 and slot 1, neither seeing anyone. */
          const HELLO = { t: 's', id: 'HOST', n: 'HOST', x: 0, y: 1, z: 0, a: 0, b: 0, hp: 100 };
          let probes = 0;
          window.Peer = function (id) {
            const on = {};
            this.on = (k, f) => (on[k] = f);
            this.destroy = () => {};
            this.connect = () => {
              const ch = {};
              const conn = { peerConnection: {}, on: (k, f) => (ch[k] = f), send: () => {} };
              if (++probes > 1) {
                setTimeout(() => {
                  conn.peerConnection.remoteDescription = { sdp: 'x' };
                  ch.open && ch.open();
                  ch.data && ch.data(HELLO);   /* a live host speaks at once */
                }, 30);
              }
              return conn; // the first probe finds nobody home yet
            };
            // A claim (named peer) neither opens nor errors - it just hangs.
            if (!id) setTimeout(() => on.open && on.open('anon'), 10);
          };
          window.NET.room = 'TEST';
          window.mpP2PSlot(0, (ok) =>
            resolve({ ok, slot: window.NET.slot, host: window.NET.isHost })
          );
        })
    );
    expect(result.ok).toBe(true);
    expect(result.slot, 'a silent server must not push us onto another slot').toBe(0);
    expect(result.host, 'the slot was already owned, so we are a client').toBe(false);
  });

  test('a host that is proven to be there is never abandoned for another slot', async ({ page }) => {
    await useLocalThree(page);
    await page.goto('/?touch=0&net=local');
    await page.waitForFunction(() => window.G && window.G.state === 'menu');

    const result = await page.evaluate(
      () =>
        new Promise((resolve) => {
          /* Observed live: the host had slot 0, and every claim came back
             'unavailable-id' saying so - but its tab was in the background and it
             answered too slowly for the short probe deadline, four times running.
             The joiner then hosted slot 1, so one room became two arenas with a
             bot each. A slot we have proof is occupied must never be stepped over. */
          const HELLO = { t: 's', id: 'HOST', n: 'HOST', x: 0, y: 1, z: 0, a: 0, b: 0, hp: 100 };
          window.Peer = function (id) {
            const on = {};
            this.on = (k, f) => (on[k] = f);
            this.destroy = () => {};
            this.connect = () => {
              const ch = {};
              const conn = { peerConnection: {}, on: (k, f) => (ch[k] = f), send: () => {} };
              setTimeout(() => {
                conn.peerConnection.remoteDescription = { sdp: 'x' };
                ch.open && ch.open();
                ch.data && ch.data(HELLO);   /* a live host speaks at once */
              }, 6000); // slower than the short deadline, well inside the patient one
              return conn;
            };
            if (id) setTimeout(() => on.error && on.error({ type: 'unavailable-id' }), 10);
            else setTimeout(() => on.open && on.open('anon'), 10);
          };
          window.NET.room = 'TEST';
          window.mpP2PSlot(0, (ok) =>
            resolve({ ok, slot: window.NET.slot, host: window.NET.isHost })
          );
        })
    );
    expect(result.ok, 'the joiner should get into the arena').toBe(true);
    expect(result.slot, 'a slow host must not be traded for a private arena').toBe(0);
    expect(result.host, 'somebody already hosts this room').toBe(false);
  });

  test('?peer= redirects signalling to another server', async ({ page }) => {
    await useLocalThree(page);
    await page.goto('/?touch=0&peer=' + encodeURIComponent('wss://sig.example.test:8443/rtc'));
    await page.waitForFunction(() => window.G && window.G.state === 'menu');
    // A blocked default signalling host is otherwise unfixable from the player's side.
    expect(await page.evaluate(() => window.mpPeerOpts())).toMatchObject({
      host: 'sig.example.test',
      port: 8443,
      path: '/rtc',
      secure: true
    });
    // Bare host:port is enough, and no ?peer= leaves the library default alone.
    await page.goto('/?touch=0&peer=' + encodeURIComponent('sig.example.test'));
    await page.waitForFunction(() => window.G && window.G.state === 'menu');
    expect(await page.evaluate(() => window.mpPeerOpts().host)).toBe('sig.example.test');
    await page.goto('/?touch=0');
    await page.waitForFunction(() => window.G && window.G.state === 'menu');
    expect(await page.evaluate(() => window.mpPeerOpts().host)).toBeUndefined();
  });

  test('a player who cannot get online is told why, and stays in the lobby', async ({ page }) => {
    await useLocalThree(page);
    // No peer-to-peer library means no way to reach the arena - the same dead end
    // a signalling outage produces, but hermetic.
    await page.route(/peerjs/i, (route) => route.abort());
    await page.goto('/?touch=0&net=p2p');
    await page.waitForFunction(() => window.G && window.G.state === 'menu');

    await page.locator('#btnMulti').click();
    await page.locator('#btnMpStart').click();

    await page.waitForFunction(() => document.getElementById('mpErr').textContent.length > 0, undefined, {
      timeout: 45_000
    });
    await nextFrame(page, 90);

    const state = await page.evaluate(() => ({
      state: window.G.state,
      on: window.MATCH.on,
      lobbyOpen: document.getElementById('mp').classList.contains('on'),
      lobby: document.getElementById('mpErr').textContent
    }));
    // This is a game about fighting other people. A bots-only arena would be
    // pretending to be online, so no match starts at all.
    expect(state.state, 'no match may start when online is out of reach').not.toBe('playing');
    expect(state.on).toBe(false);
    expect(state.lobbyOpen, 'the player is left in the lobby').toBe(true);
    expect(state.lobby, 'the reason and the way to retry must both be shown').toMatch(
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
    await page.goto('/?touch=0&net=local');
    await page.waitForFunction(() => window.G && window.G.state === 'menu');
    await page.locator('#btnMulti').click();
    await page.locator('#btnMpStart').click();
    await page.waitForFunction(() => window.MATCH.on, undefined, { timeout: 20_000 });

    await page.keyboard.down('Tab');
    await expect(page.locator('#board')).toHaveClass(/on/);
    await expect(page.locator('#boardRows .brow.me')).toContainText('PLAYER');

    await page.keyboard.up('Tab');
    await expect(page.locator('#board')).not.toHaveClass(/on/);
  });
});

/**
 * What happens when signalling works but the connection does not.
 *
 * These are the ways a real arena fails, and none of them can be provoked
 * against the live PeerJS cloud on demand: a host whose registration outlived
 * it, and a network that lets two peers exchange offers but never lets a data
 * channel open. Both were found by putting a phone and a browser in one room
 * and watching the lobby sit there. So the signalling layer is faked - only the
 * layer the game does not own - and the state machine above it is driven for
 * real.
 */
test.describe('an arena that will not connect', () => {
  /** Replaces PeerJS. `claim` decides who owns the id, `join` how the host behaves. */
  const fakePeer = (page, cfg) =>
    page.addInitScript((cfg) => {
      const bus = () => {
        const h = {};
        return {
          on(k, f) {
            (h[k] = h[k] || []).push(f);
          },
          emit(k, v) {
            (h[k] || []).slice().forEach((f) => f(v));
          }
        };
      };
      window.Peer = function (id) {
        const peer = bus();
        peer.destroy = () => {
          peer.dead = true;
        };
        peer.disconnect = () => {};
        setTimeout(() => {
          if (peer.dead) return;
          if (id && cfg.claim === 'taken') peer.emit('error', { type: 'unavailable-id' });
          else peer.emit('open', id || 'client');
        }, 20);
        peer.connect = (hostId) => {
          const conn = bus();
          conn.open = false;
          conn.peerConnection = { remoteDescription: null };
          conn.send = () => {};
          conn.close = () => {};
          /* liveFrom pins which slot actually has somebody on it; the ids are
             `overrun-v1-ROOM`, `...-1`, `...-2`. */
          const slot = Number((/-(\d+)$/.exec(hostId) || [0, 0])[1]);
          const mode = cfg.liveFrom !== undefined && slot >= cfg.liveFrom ? 'live' : cfg.join;
          if (mode === 'nobody') return conn; /* the slot really is empty */
          setTimeout(() => {
            /* The host answered our offer - from here on somebody is there. */
            conn.peerConnection.remoteDescription = { type: 'answer' };
            if (mode === 'ice') return; /* ...and the channel never opens */
            conn.open = true;
            conn.emit('open');
            if (mode === 'live') {
              setTimeout(
                () =>
                  conn.emit('data', {
                    t: 's',
                    id: 'HOSTPEER',
                    n: 'HOST',
                    x: 0,
                    y: 1,
                    z: 0,
                    a: 0,
                    b: 0,
                    hp: 100
                  }),
                30
              );
            }
          }, 40);
          return conn;
        };
        return peer;
      };
    }, cfg);

  /** Boot with the fake in place and press Enter Arena. Returns what happened. */
  async function enter(page, cfg) {
    await fakePeer(page, cfg);
    await useLocalThree(page);
    await page.goto('/?touch=0&net=p2p&mptrace=1');
    await page.waitForFunction(() => window.G && window.G.state === 'menu');
    return page.evaluate(() => {
      /* The real deadlines are tuned for a slow phone on a slow network. The
         logic under test is the same at a tenth of the wait. */
      window.MP_JOIN_MS = 300;
      window.MP_HANDSHAKE_MS = 600;
      window.MP_CLAIM_MS = 400;
      window.MP_ALIVE_MS = 250;
      window.MP_REJOIN_MS = 60;
      window.MP_RETRY_MS = 60;
      const began = Date.now();
      return new Promise((resolve) =>
        window.mpConnect('p2p', 'TESTRM', 'ME', (ok) =>
          resolve({
            ok,
            ms: Date.now() - began,
            kind: window.NET.kind,
            host: window.NET.isHost,
            slot: window.NET.slot,
            err: window.NET.err,
            knocks: window.NET.trace.filter((l) => /slot \d+ try/.test(l)).length,
            trace: window.NET.trace
          })
        )
      );
    });
  }

  test('a live host is joined and its players show up', async ({ page }) => {
    const r = await enter(page, { claim: 'taken', join: 'live' });
    expect(r, r.trace && r.trace.join('\n')).toMatchObject({ ok: true, host: false });
    await page.waitForFunction(() => Object.keys(window.NET.peers).length === 1, undefined, {
      timeout: 10_000
    });
  });

  test('an empty arena is claimed and hosted', async ({ page }) => {
    const r = await enter(page, { claim: 'ok', join: 'nobody' });
    expect(r, r.trace && r.trace.join('\n')).toMatchObject({ ok: true, host: true });
  });

  /* A registration that outlived its owner answers the offer and opens a channel,
     then says nothing ever again. Treating that as an arena drops the player into
     an empty match that calls itself online - which is worse than a refusal,
     because there is nothing to react to. */
  test('a host that opens a channel and then says nothing is not an arena', async ({ page }) => {
    const r = await enter(page, { claim: 'ok', join: 'silent' });
    expect(r, r.trace && r.trace.join('\n')).toMatchObject({ ok: true, host: true });
    expect(await page.evaluate(() => Object.keys(window.NET.peers).length)).toBe(0);
  });

  test('a dead host on an id we cannot take is refused, not faked', async ({ page }) => {
    const r = await enter(page, { claim: 'taken', join: 'silent' });
    expect(r.ok, 'trace:\n' + (r.trace || []).join('\n')).toBe(false);
    expect(r.err).toMatch(/[a-z]{4,}.*\./i);
  });

  /* A registration that outlived its tab will be just as dead on the fourth
     knock as on the first, and the id stays taken - so it is stepped over rather
     than knocked on again. Only when every slot in the room is a ghost is there
     nothing left to do but say so, and point at a way out. */
  test('a stuck room is named and abandoned, not knocked on four times', async ({ page }) => {
    const r = await enter(page, { claim: 'taken', join: 'silent' });
    expect(r.err, 'the player needs a way out, not just a failure').toMatch(/room=/i);
    expect(r.knocks, 'one knock per slot, none of them repeated').toBeLessThanOrEqual(3);
  });

  /* The common case, and the one that keeps the default arena usable: one dead
     registration must not lock everybody out of the room. */
  test('a ghost on the first slot is stepped over, not treated as the room', async ({ page }) => {
    const r = await enter(page, { claim: 'taken', join: 'silent', liveFrom: 1 });
    expect(r, r.trace && r.trace.join('\n')).toMatchObject({ ok: true, host: false });
    expect(r.slot, 'the arena is on the next slot along').toBe(1);
  });

  /* The offer is answered, so the host is there and reachable through
     signalling; the data channel still never opens. That is the network
     refusing a direct connection - symmetric NAT, mobile data, an office
     firewall - and no amount of knocking on the same door will change it. */
  test('a blocked direct connection is named, once, instead of retried forever', async ({
    page
  }) => {
    const r = await enter(page, { claim: 'taken', join: 'ice' });
    expect(r.ok, 'trace:\n' + (r.trace || []).join('\n')).toBe(false);
    expect(r.err, 'the player must be told what is actually wrong').toMatch(
      /direct connection/i
    );
    expect(r.knocks, 'retrying a blocked path cannot help').toBeLessThanOrEqual(2);
  });

  test('the lobby stays open and says why, rather than hanging', async ({ page }) => {
    await fakePeer(page, { claim: 'taken', join: 'ice' });
    await useLocalThree(page);
    await page.goto('/?touch=0&net=p2p&mptrace=1');
    await page.waitForFunction(() => window.G && window.G.state === 'menu');
    await page.evaluate(() => {
      window.MP_JOIN_MS = 300;
      window.MP_HANDSHAKE_MS = 600;
      window.MP_CLAIM_MS = 400;
      window.MP_ALIVE_MS = 250;
      window.MP_REJOIN_MS = 60;
      window.MP_RETRY_MS = 60;
    });

    await page.locator('#btnMulti').click();
    await page.locator('#mpName').fill('ME');
    await page.locator('#btnMpStart').click();

    /* Left in the lobby, told what happened, and able to try again. */
    await expect(page.locator('#mpErr')).toContainText(/direct connection/i, {
      timeout: 20_000
    });
    await expect(page.locator('#mp')).toHaveClass(/on/);
    await expect(page.locator('#btnMpStart')).toBeVisible();
    expect(await page.evaluate(() => window.G.state)).toBe('menu');
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
