'use strict';
/* ---------------------------------------------------------------------------
   ANDROID END TO END

   Drives the installed APK on a real device or emulator. Playwright attaches to
   the Capacitor WebView over adb, which gives us an ordinary Page - so these
   tests read like the browser suite, but every assertion is about the app as a
   player receives it: the native shell, the packaged assets, the real GPU.

   Requirements (none of which this suite can install for you):
     - JDK 17+ and the Android SDK platform-tools on PATH
     - a device with USB debugging on, or a running emulator  (`adb devices`)
     - the debug APK installed:  npm run android:install

   Run with:  npm run test:android
   Everything is skipped, loudly, when no device is attached.
--------------------------------------------------------------------------- */

const { test, expect } = require('@playwright/test');
/* @playwright/test does not re-export the Android driver; playwright-core does. */
const { _android: android, chromium } = require('playwright-core');

const PKG = process.env.ANDROID_PKG || 'com.overrun.fps';
const ACTIVITY = PKG + '/.MainActivity';
const SITE = process.env.LIVE_URL || 'https://ltnsali.github.io/overrun-fps/';

let device;
let page;
let isEmulator = false;

/* One install, one launch, one WebView for the whole file. Restarting the app
   between tests would triple the runtime and prove nothing extra - except for
   the settings-persistence test, which restarts it deliberately. */
test.beforeAll(async () => {
  const devices = await android.devices();
  test.skip(devices.length === 0, 'no Android device or emulator attached (check `adb devices`)');
  device = devices[0];
  isEmulator = /emulator/i.test(String(await device.shell('getprop ro.build.characteristics')));
  await launch();
});

test.afterAll(async () => {
  if (device) await device.close();
});

async function launch() {
  await device.shell('am force-stop ' + PKG);
  /* The WebView is torn down asynchronously, a moment after the process is
     told to go. Asking for one too early hands back the corpse of the previous
     session, whose page is already closed. */
  await expect
    .poll(() => device.webViews().filter((w) => w.pkg() === PKG).length, { timeout: 30_000 })
    .toBe(0);

  await device.shell('am start -n ' + ACTIVITY);
  const webview = await device.webView({ pkg: PKG }, { timeout: 60_000 });
  page = await webview.page();
  await page.waitForFunction(() => window.G && window.G.state === 'menu', undefined, {
    timeout: 60_000
  });
  return page;
}

/* An Android WebView page has no touch emulation, so Playwright's page.tap()
   refuses outright. The menu buttons are bound with onclick, so a click is a
   faithful stand-in for them. */
const press = (sel) => page.locator(sel).click();

/* The in-game controls bind touchstart/touchend themselves, so those need real
   TouchEvents - the same technique the browser suite uses in tests/helpers.js. */
async function touchTap(sel, holdMs = 120) {
  await page.locator(sel).evaluate((el, ms) => {
    const r = el.getBoundingClientRect();
    const t = new Touch({
      identifier: 7,
      target: el,
      clientX: r.left + r.width / 2,
      clientY: r.top + r.height / 2
    });
    const base = { bubbles: true, cancelable: true };
    el.dispatchEvent(
      new TouchEvent('touchstart', {
        ...base,
        touches: [t],
        targetTouches: [t],
        changedTouches: [t]
      })
    );
    return new Promise((done) =>
      setTimeout(() => {
        el.dispatchEvent(
          new TouchEvent('touchend', {
            ...base,
            touches: [],
            targetTouches: [],
            changedTouches: [t]
          })
        );
        done();
      }, ms)
    );
  }, holdMs);
}

async function backToMenu() {
  await page.evaluate(() => {
    if (window.G.state === 'paused') window.resumeGame();
    if (window.G.state !== 'menu') window.quitToMenu();
    window.showScreen('menu');
  });
  await expect(page.locator('#btnPlay')).toBeVisible();
}

test.describe('the installed app', () => {
  test('launches straight to the menu with both modes', async () => {
    await expect(page.locator('#loadErr')).toBeHidden();
    await expect(page.locator('#btnPlay')).toHaveText(/single player/i);
    await expect(page.locator('#btnMulti')).toHaveText(/multiplayer/i);
  });

  test('knows it is running natively', async () => {
    expect(await page.evaluate(() => !!(window.Capacitor && window.Capacitor.isNativePlatform())))
      .toBe(true);
  });

  test('serves every asset from the package, never the network', async () => {
    /* An installed app on a train has no CDN. Capacitor serves the bundle from
       https://localhost, so anything else is a file we forgot to package. */
    const external = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map((e) => e.name)
        .filter((u) => !u.startsWith(location.origin) && !u.startsWith('data:'))
    );
    expect(external, 'the app fetched something off-device at boot').toEqual([]);
    expect(await page.evaluate(() => !!window.THREE), 'three.js from the package').toBe(true);
  });

  test('renders through a live WebGL context', async () => {
    const gl = await page.evaluate(() => {
      const ctx = window.G.renderer.getContext();
      const dbg = ctx.getExtension('WEBGL_debug_renderer_info');
      return {
        lost: ctx.isContextLost(),
        renderer: dbg ? ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : ''
      };
    });
    expect(gl.lost, 'WebGL context lost').toBe(false);
    expect(gl.renderer, 'no renderer reported at all').not.toBe('');
    /* An emulator rasterises in software by design, so this can only be a real
       assertion on real hardware - where a software fallback means an
       unplayable frame rate and is worth failing over. */
    if (!isEmulator) {
      expect(gl.renderer, 'software rasteriser on a phone would be unplayable').not.toMatch(
        /swiftshader|llvmpipe/i
      );
    }
  });

  test('fills the screen with no blank strip', async () => {
    const m = await page.evaluate(() => {
      const app = document.getElementById('app');
      const c = app.querySelector('canvas');
      const r = c.getBoundingClientRect();
      return { app: { w: app.clientWidth, h: app.clientHeight }, css: { w: r.width, h: r.height, x: r.left, y: r.top } };
    });
    expect(Math.abs(m.css.w - m.app.w), 'canvas width vs viewport').toBeLessThanOrEqual(1);
    expect(Math.abs(m.css.h - m.app.h), 'canvas height vs viewport').toBeLessThanOrEqual(1);
    expect(m.css.x).toBeCloseTo(0, 0);
    expect(m.css.y).toBeCloseTo(0, 0);
  });

  test('is landscape, and stays landscape', async () => {
    const vp = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
    expect(vp.w, 'app is locked to landscape by the manifest').toBeGreaterThan(vp.h);
    await expect(page.locator('#rotate')).toBeHidden();
  });

  test('shows the touch controls, not a keyboard prompt', async () => {
    await press('#btnPlay');
    await page.waitForFunction(() => window.G.state === 'playing', undefined, { timeout: 30_000 });
    await expect(page.locator('#touchUI')).toBeVisible();
    await expect(page.locator('#tFire')).toBeVisible();
    await expect(page.locator('#tStick')).toBeVisible();
    await backToMenu();
  });
});

test.describe('playing on the device', () => {
  test.beforeEach(backToMenu);

  test('Single Player runs the survival waves', async () => {
    await press('#btnPlay');
    await page.waitForFunction(() => window.G.state === 'playing', undefined, { timeout: 30_000 });
    expect(await page.evaluate(() => window.G.mode)).toBe('survival');
    await page.waitForFunction(() => window.G.wave >= 1 && window.G.waveActive, undefined, {
      timeout: 30_000
    });
    await expect(page.locator('#hud')).toHaveClass(/on/);
  });

  test('firing costs ammo and the frame keeps moving', async () => {
    await press('#btnPlay');
    await page.waitForFunction(() => window.G.state === 'playing', undefined, { timeout: 30_000 });
    const ammo = () => page.evaluate(() => window.PL.weapons[window.PL.wi].ammo);
    const before = await ammo();
    await touchTap('#tFire');
    await page.waitForTimeout(600);
    expect(await ammo(), 'tapping FIRE should spend ammo').toBeLessThan(before);

    const frames = await page.evaluate(
      () =>
        new Promise((r) => {
          let n = 0;
          const t = setInterval(() => {}, 1000);
          const tick = () => (++n < 30 ? requestAnimationFrame(tick) : (clearInterval(t), r(n)));
          requestAnimationFrame(tick);
        })
    );
    expect(frames, 'the render loop stalled').toBe(30);
  });

  test('the back button pauses the match instead of closing the game', async () => {
    await press('#btnPlay');
    await page.waitForFunction(() => window.G.state === 'playing', undefined, { timeout: 30_000 });

    await device.shell('input keyevent KEYCODE_BACK');
    await page.waitForFunction(() => window.G.state === 'paused', undefined, { timeout: 10_000 });
    await expect(page.locator('#pause')).toHaveClass(/on/);

    /* And the app is still the thing on screen - the whole point. */
    await device.shell('input keyevent KEYCODE_BACK');
    await page.waitForFunction(() => window.G.state === 'playing', undefined, { timeout: 10_000 });
  });

  test('leaving the app pauses rather than letting the player be killed offscreen', async () => {
    await press('#btnPlay');
    await page.waitForFunction(() => window.G.state === 'playing', undefined, { timeout: 30_000 });

    /* A backgrounded WebView is frozen, so it cannot be polled while it is away.
       Send it home, give it a moment, and read the state once it is back - which
       is also the only moment the player would ever see it. */
    await device.shell('input keyevent KEYCODE_HOME');
    await new Promise((r) => setTimeout(r, 2500));
    await device.shell('am start -n ' + ACTIVITY);

    await page.waitForFunction(() => window.G.state === 'paused', undefined, { timeout: 15_000 });
    await expect(page.locator('#pause')).toHaveClass(/on/);
  });
});

test.describe('multiplayer on the device', () => {
  test.beforeEach(backToMenu);

  test('the lobby opens and asks only for a callsign', async () => {
    await press('#btnMulti');
    await expect(page.locator('#mp')).toHaveClass(/on/);
    await expect(page.locator('#mpName')).toBeVisible();
    await expect(page.locator('#btnMpStart')).toBeVisible();
  });

  test('entering an arena reaches a live match or says why not', async () => {
    /* One device cannot hold a deathmatch, and the public signalling server is
       not ours to depend on - so this asserts the two acceptable outcomes and
       fails only on the third: hanging forever with no explanation. */
    await press('#btnMulti');
    await page.locator('#mpName').fill('DEVICE');
    await press('#btnMpStart');

    await page.waitForFunction(
      () => (window.G.state === 'playing' && window.MATCH.on) || !!window.NET.err,
      undefined,
      { timeout: 60_000 }
    );
    const s = await page.evaluate(() => ({
      playing: window.G.state === 'playing',
      err: window.NET.err,
      trace: window.NET.trace
    }));
    if (!s.playing) {
      /* A refusal must be a sentence a player can act on, not a stack trace. */
      expect(s.err, 'trace:\n  ' + s.trace.join('\n  ')).toMatch(/[a-z]{4,}.*\./i);
      await expect(page.locator('#mp')).toHaveClass(/on/);
    }
  });

  /* The scenario a player actually reported: host on the phone, join from a
     desktop browser on the deployed site. Whether the two can reach each other
     depends on the network they are on - a phone behind carrier NAT often
     cannot be reached at all - so this asserts the two honest outcomes and
     fails only on the third, which is the bug that was reported: the browser
     sitting in the lobby forever with nothing to show for it. */
  test('a browser joining the arena hosted here either meets it or is told why', async () => {
    test.slow();
    const room = 'X' + Math.random().toString(36).slice(2, 7).toUpperCase();

    /* The packaged app has no query string of its own, so the room is pinned by
       navigating the WebView - the same origin, the same bytes. */
    await page.goto('https://localhost/?room=' + room + '&mptrace=1');
    await page.waitForFunction(() => window.G && window.G.state === 'menu', { timeout: 60_000 });
    await press('#btnMulti');
    await page.locator('#mpName').fill('PHONE');
    await press('#btnMpStart');
    await page.waitForFunction(() => window.NET.kind === 'p2p' || !!window.NET.err, undefined, {
      timeout: 90_000
    });
    expect(
      await page.evaluate(() => window.NET.isHost),
      'the phone should own an arena nobody else is in'
    ).toBe(true);

    const browser = await chromium.launch();
    try {
      const web = await browser.newPage();
      await web.goto(SITE + '?touch=0&room=' + room + '&mptrace=1', {
        waitUntil: 'domcontentloaded'
      });
      await web.waitForFunction(() => window.G && window.G.state === 'menu', undefined, {
        timeout: 60_000
      });
      await web.locator('#mpName').fill('DESKTOP');
      await web.locator('#btnMulti').click();
      await web.locator('#btnMpStart').click();

      /* Met, or refused with a reason. Never still thinking about it. */
      await web.waitForFunction(
        () => Object.keys(window.NET.peers).length > 0 || !!window.NET.err,
        undefined,
        { timeout: 90_000 }
      );
      const w = await web.evaluate(() => ({
        met: Object.keys(window.NET.peers).length > 0,
        err: window.NET.err,
        lobby: document.getElementById('mpErr').textContent,
        trace: window.NET.trace
      }));
      const why = 'browser trace:\n  ' + w.trace.join('\n  ');
      if (w.met) {
        await expect
          .poll(() => page.evaluate(() => NET.conns.length), { timeout: 30_000 })
          .toBeGreaterThan(0);
      } else {
        expect(w.err, why).toMatch(/[a-z]{4,}.*\./i);
        await expect(web.locator('#mpErr'), why).not.toBeEmpty();
        expect(await web.evaluate(() => window.G.state), why).toBe('menu');
      }
    } finally {
      await browser.close();
    }
  });
});

test.describe('the app between sessions', () => {
  test('remembers settings after a cold restart', async () => {
    await backToMenu();
    await page.evaluate(() => {
      window.SET.sens = 3.7;
      window.saveSettings();
    });

    /* Android flushes WebView storage when the activity pauses. Killing a
       foreground process outright skips that, and loses the write - so send the
       app to the background first, the way the system itself always does before
       it retires an app. */
    await device.shell('input keyevent KEYCODE_HOME');
    await new Promise((r) => setTimeout(r, 2500));

    await launch();
    expect(await page.evaluate(() => window.SET.sens)).toBeCloseTo(3.7, 1);
  });
});
