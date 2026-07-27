'use strict';
/* Shared helpers for the OVERRUN browser tests. */

const fs = require('fs');
const path = require('path');
const { expect } = require('@playwright/test');

const THREE_LOCAL = path.resolve(__dirname, '..', 'node_modules', 'three', 'build', 'three.min.js');

/**
 * Serve three.js from node_modules instead of the CDN so the suite is hermetic
 * and does not depend on network access. Falls back to the real CDN if the
 * local copy is missing.
 */
async function useLocalThree(page) {
  if (!fs.existsSync(THREE_LOCAL)) return false;
  const body = fs.readFileSync(THREE_LOCAL, 'utf8');
  await page.route('**/three*.js', (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body })
  );
  return true;
}

/**
 * Load the game and wait until the engine has booted to the main menu.
 * `?touch=1` forces the mobile control scheme regardless of UA sniffing.
 * `net=local` keeps Enter Arena on the cross-tab transport so tests never depend
 * on the internet; callers can override it through `query`.
 */
async function bootGame(page, { touch = false, query = '' } = {}) {
  await useLocalThree(page);
  const params = [touch ? 'touch=1' : '', 'net=local', query].filter(Boolean).join('&');
  await page.goto(`/?${params}`);
  await page.waitForFunction(() => window.G && window.G.state === 'menu', undefined, {
    timeout: 45_000
  });
  // One frame so the first onResize() has definitely run.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
  return page;
}

/** Read every size the renderer, camera and layout agree (or disagree) on. */
function measure(page) {
  return page.evaluate(() => {
    const app = document.getElementById('app');
    const canvas = app.querySelector('canvas');
    const rect = canvas.getBoundingClientRect();
    return {
      app: { w: app.clientWidth, h: app.clientHeight },
      css: { w: rect.width, h: rect.height, x: rect.left, y: rect.top },
      buffer: { w: canvas.width, h: canvas.height },
      pixelRatio: window.G.renderer.getPixelRatio(),
      camAspect: window.G.camera.aspect,
      viewCamAspect: window.G.viewCam.aspect,
      inner: { w: window.innerWidth, h: window.innerHeight }
    };
  });
}

/**
 * The core invariant: the canvas element covers the whole drawable area, and
 * the drawing buffer / camera match it. A violation is exactly the "half the
 * page is blank" bug.
 */
function expectFillsViewport(m) {
  expect.soft(m.css.x, 'canvas left offset').toBeCloseTo(0, 0);
  expect.soft(m.css.y, 'canvas top offset').toBeCloseTo(0, 0);

  expect(Math.abs(m.css.w - m.app.w), `canvas css width ${m.css.w} vs viewport ${m.app.w}`)
    .toBeLessThanOrEqual(1);
  expect(Math.abs(m.css.h - m.app.h), `canvas css height ${m.css.h} vs viewport ${m.app.h}`)
    .toBeLessThanOrEqual(1);

  const expectW = Math.floor(m.app.w * m.pixelRatio);
  const expectH = Math.floor(m.app.h * m.pixelRatio);
  expect(Math.abs(m.buffer.w - expectW), `buffer width ${m.buffer.w} vs ${expectW}`)
    .toBeLessThanOrEqual(2);
  expect(Math.abs(m.buffer.h - expectH), `buffer height ${m.buffer.h} vs ${expectH}`)
    .toBeLessThanOrEqual(2);

  const aspect = m.app.w / m.app.h;
  expect(m.camAspect, 'world camera aspect').toBeCloseTo(aspect, 2);
  expect(m.viewCamAspect, 'viewmodel camera aspect').toBeCloseTo(aspect, 2);
}

/**
 * Hit-test a grid of points across the viewport. The canvas must appear in the
 * hit stack at every point - i.e. it geometrically covers the whole screen.
 * HUD panels and touch buttons may sit on top; a blank area is one where the
 * canvas is simply not there.
 */
function probeCoverage(page) {
  return page.evaluate(() => {
    const app = document.getElementById('app');
    const canvas = app.querySelector('canvas');
    const w = app.clientWidth;
    const h = app.clientHeight;
    const fr = [0.02, 0.25, 0.5, 0.75, 0.98];
    const misses = [];
    for (const fx of fr) {
      for (const fy of fr) {
        const x = Math.min(w - 1, Math.round(w * fx));
        const y = Math.min(h - 1, Math.round(h * fy));
        const stack = document.elementsFromPoint(x, y);
        if (!stack.includes(canvas)) {
          misses.push({ x, y, top: stack[0] ? stack[0].id || stack[0].tagName : 'null' });
        }
      }
    }
    return misses;
  });
}

/**
 * The game requests fullscreen when a round starts on touch devices, and
 * Chromium refuses to resize a fullscreen window - drop out of it first.
 */
async function exitFullscreen(page) {
  const wasFullscreen = await page.evaluate(async () => {
    if (!document.fullscreenElement) return false;
    try {
      await document.exitFullscreen();
    } catch (e) {
      /* ignore */
    }
    return true;
  });
  if (wasFullscreen) {
    await page.waitForFunction(() => !document.fullscreenElement, undefined, { timeout: 5_000 });
  }
}

/** Resize the viewport and give the page a moment to settle (rAF-debounced). */
async function resizeTo(page, width, height) {
  await exitFullscreen(page);
  try {
    await page.setViewportSize({ width, height });
  } catch (err) {
    // startGame() requests fullscreen asynchronously, so it can land between the
    // exit above and this call. Drop out of it and try once more.
    if (!/fullscreen|setWindowBounds/i.test(String(err))) throw err;
    await exitFullscreen(page);
    await page.setViewportSize({ width, height });
  }
  // Wait for the layout to actually reflect BOTH dimensions before measuring.
  await page.waitForFunction(
    ([w, h]) => {
      const app = document.getElementById('app');
      return app.clientWidth === w && app.clientHeight === h;
    },
    [width, height],
    { timeout: 10_000 }
  );
  // ...then let the rAF-debounced onResize run.
  await nextFrame(page, 3);
}

/** Swap to landscape if this project's device is portrait (the game gates play). */
async function ensureLandscape(page) {
  const vp = page.viewportSize();
  if (vp.height > vp.width) await resizeTo(page, vp.height, vp.width);
}

/** Enter the arena through the real lobby and wait for the round to be live. */
async function startPlaying(page) {
  await page.locator('#btnMulti').click();
  await page.locator('#btnMpStart').click();
  await page.waitForFunction(() => window.G.state === 'playing' && window.MATCH.on, undefined, {
    timeout: 25_000
  });
  // startGame() fires goFullscreen() after flipping the state, so let that request
  // settle and undo it - Chromium refuses to resize a fullscreen window.
  await nextFrame(page, 4);
  await exitFullscreen(page);
}

/* ---- synthetic touch gestures -------------------------------------------
   Playwright's touchscreen API only exposes taps, and the on-screen buttons
   bind their own touchstart/touchmove/touchend, so drive real TouchEvents. */

async function touchStart(page, selector) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const r = el.getBoundingClientRect();
    window.__touch = { el, id: 7, x: r.left + r.width / 2, y: r.top + r.height / 2 };
    window.__emitTouch = (type) => {
      const s = window.__touch;
      const t = new Touch({ identifier: s.id, target: s.el, clientX: s.x, clientY: s.y });
      const active = type === 'touchend' || type === 'touchcancel' ? [] : [t];
      s.el.dispatchEvent(
        new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          touches: active,
          targetTouches: active,
          changedTouches: [t]
        })
      );
    };
    window.__emitTouch('touchstart');
  }, selector);
}

async function touchMoveBy(page, dx, dy, steps = 4) {
  await page.evaluate(
    ({ dx, dy, steps }) => {
      for (let i = 0; i < steps; i++) {
        window.__touch.x += dx / steps;
        window.__touch.y += dy / steps;
        window.__emitTouch('touchmove');
      }
    },
    { dx, dy, steps }
  );
}

async function touchEnd(page) {
  await page.evaluate(() => window.__emitTouch('touchend'));
}

/** Wait for one full game frame so queued look input is consumed. */
async function nextFrame(page, count = 2) {
  await page.evaluate(
    (n) =>
      new Promise((resolve) => {
        let left = n;
        const step = () => (--left <= 0 ? resolve() : requestAnimationFrame(step));
        requestAnimationFrame(step);
      }),
    count
  );
}

/** Collect console errors / page errors for the lifetime of the test. */
function collectErrors(page) {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  return errors;
}

module.exports = {
  useLocalThree,
  bootGame,
  measure,
  expectFillsViewport,
  probeCoverage,
  resizeTo,
  ensureLandscape,
  exitFullscreen,
  startPlaying,
  touchStart,
  touchMoveBy,
  touchEnd,
  nextFrame,
  collectErrors
};
