'use strict';
/* ---------------------------------------------------------------------------
   PACKAGED PAYLOAD

   These tests do not exercise gameplay - the device suites already do. They
   exercise the *package*: the contents of www/, which tools/build-www.js
   assembles and `npx cap sync android` copies verbatim into
   android/app/src/main/assets/public.

   Two things can only go wrong here and nowhere else:

     1. a file the game needs was never copied, and
     2. something still reaches for a CDN, which an installed app on a phone
        with no signal cannot do.

   So the server is pointed at www/ (SERVE_ROOT, see playwright.package.config.js)
   and every CDN host is cut off at the network layer. If the game boots and
   plays under those conditions, the APK will too.
--------------------------------------------------------------------------- */

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { measure, expectFillsViewport, nextFrame, collectErrors } = require('./helpers');

const WWW = path.resolve(__dirname, '..', 'www');
const ASSETS = path.resolve(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public');

/* Anything that is not our own origin. Note this deliberately does NOT stub a
   local copy in: the point is to prove none is needed. */
const CDN = /cdnjs|jsdelivr|unpkg|cloudflare|googleapis|gstatic/i;

async function bootOffline(page, query) {
  await page.route(CDN, (route) => route.abort());
  const offOrigin = [];
  page.on('request', (r) => {
    const u = r.url();
    if (!/^https?:\/\/127\.0\.0\.1|^https?:\/\/localhost/.test(u) && !u.startsWith('data:')) {
      offOrigin.push(u);
    }
  });
  await page.goto('/?' + ['touch=0', 'net=local', query].filter(Boolean).join('&'));
  await page.waitForFunction(() => window.G && window.G.state === 'menu', undefined, {
    timeout: 45_000
  });
  await nextFrame(page, 2);
  return offOrigin;
}

test.describe('the payload that ships in the APK', () => {
  test('carries its own engine and networking library', () => {
    /* Cheap, but it is the failure everyone hits first: a new dependency is
       added to index.html and nobody teaches the copy step about it. */
    for (const rel of ['index.html', 'vendor/three.min.js', 'vendor/peerjs.min.js']) {
      expect(fs.existsSync(path.join(WWW, rel)), rel + ' missing from www/').toBe(true);
    }
    const scripts = fs.readdirSync(path.join(WWW, 'src', 'js'));
    expect(scripts.length, 'script count in www/src/js').toBeGreaterThan(20);
  });

  test('contains every file index.html asks for', () => {
    const html = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8');
    const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((m) => m[1])
      .filter((u) => !/^(https?:)?\/\//.test(u) && !u.startsWith('data:'));
    expect(refs.length).toBeGreaterThan(20);
    for (const rel of refs) {
      expect(fs.existsSync(path.join(WWW, rel)), rel + ' referenced but not packaged').toBe(true);
    }
  });

  test('is what Capacitor actually copied into the Android project', () => {
    /* A stale android/ assets folder is a silent way to ship last week's game. */
    test.skip(!fs.existsSync(ASSETS), 'android platform not synced');
    const a = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8');
    const b = fs.readFileSync(path.join(ASSETS, 'index.html'), 'utf8');
    expect(b, 'android assets are stale - run `npm run android`').toBe(a);
  });

  test('boots to the menu with every CDN unreachable', async ({ page }) => {
    const errors = collectErrors(page);
    const offOrigin = await bootOffline(page);

    await expect(page.locator('#loadErr')).toBeHidden();
    await expect(page.locator('#btnPlay')).toBeVisible();
    await expect(page.locator('#btnMulti')).toBeVisible();
    expect(await page.evaluate(() => !!window.THREE), 'three.js loaded').toBe(true);
    expect(offOrigin, 'the packaged app reached off-origin').toEqual([]);
    expect(errors, 'console errors during boot').toEqual([]);
  });

  test('renders the arena full-screen with no CDN', async ({ page }) => {
    await bootOffline(page);
    await page.locator('#btnPlay').click();
    await page.waitForFunction(() => window.G.state === 'playing', undefined, { timeout: 25_000 });
    await nextFrame(page, 4);
    await page.evaluate(() => document.exitFullscreen && document.exitFullscreen().catch(() => {}));
    await nextFrame(page, 3);

    expect(await page.evaluate(() => window.G.mode)).toBe('survival');
    expectFillsViewport(await measure(page));
    const ctx = await page.evaluate(() => !window.G.renderer.getContext().isContextLost());
    expect(ctx, 'live WebGL context').toBe(true);
  });

  test('has PeerJS on hand for multiplayer without fetching it', async ({ page }) => {
    /* Multiplayer needs the internet for signalling, but not for its *code*.
       The library must load out of the package with every CDN cut off. */
    await bootOffline(page, 'net=off');
    await page.locator('#btnMulti').click();
    await expect(page.locator('#mp')).toHaveClass(/on/);

    const loaded = await page.evaluate(
      () => new Promise((r) => window.mpLoadPeerJs(r))
    );
    expect(loaded, 'peerjs.min.js loaded from the package').toBe(true);
    expect(await page.evaluate(() => typeof window.Peer)).toBe('function');
  });
});
