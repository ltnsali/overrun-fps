'use strict';
/**
 * Regression suite for the mobile "half the page is blank" bug.
 *
 * Cause: onResize() called renderer.setSize(w, h, false) - updateStyle=false -
 * while the initial setSize() had pinned inline px styles on the canvas. After a
 * rotation the drawing buffer was resized but the element kept its old CSS box,
 * so a 932x430 landscape screen only painted the first 430px and the rest of the
 * page stayed at the body background colour.
 */

const { test, expect } = require('@playwright/test');
const {
  bootGame,
  measure,
  expectFillsViewport,
  probeCoverage,
  resizeTo,
  startPlaying
} = require('./helpers');

test.describe('canvas / viewport sizing', () => {
  test('canvas fills the viewport on first paint', async ({ page }) => {
    await bootGame(page, { touch: true });

    const m = await measure(page);
    expect(m.buffer.w, 'drawing buffer must not be empty').toBeGreaterThan(0);
    expect(m.buffer.h, 'drawing buffer must not be empty').toBeGreaterThan(0);
    expectFillsViewport(m);
  });

  test('canvas is sized by CSS, not by pinned inline pixels', async ({ page }) => {
    await bootGame(page, { touch: true });

    const style = await page.evaluate(() => {
      const c = document.querySelector('#app canvas');
      const cs = getComputedStyle(c);
      return {
        inlineWidth: c.style.width,
        inlineHeight: c.style.height,
        position: cs.position,
        left: cs.left,
        top: cs.top
      };
    });

    // If three.js pins inline px here, any missed resize event strands the canvas.
    expect(style.inlineWidth, 'canvas must not carry an inline px width').toBe('');
    expect(style.inlineHeight, 'canvas must not carry an inline px height').toBe('');
    expect(style.position).toBe('absolute');
    expect(style.left).toBe('0px');
    expect(style.top).toBe('0px');
  });

  test('rotating portrait -> landscape keeps the canvas full-bleed', async ({ page }) => {
    await bootGame(page, { touch: true });
    await resizeTo(page, 412, 915);
    expectFillsViewport(await measure(page));

    await resizeTo(page, 915, 412);

    const m = await measure(page);
    expectFillsViewport(m);
    // The exact symptom that was reported: canvas stuck at the portrait width.
    expect(m.css.w, 'canvas must not stay at the portrait width').toBeGreaterThan(900);
  });

  test('rotating landscape -> portrait keeps the canvas full-bleed', async ({ page }) => {
    await bootGame(page, { touch: true });
    await resizeTo(page, 915, 412);
    expectFillsViewport(await measure(page));

    await resizeTo(page, 412, 915);

    const m = await measure(page);
    expectFillsViewport(m);
    expect(m.css.h, 'canvas must not stay at the landscape height').toBeGreaterThan(900);
  });

  test('repeated rotations never desync the canvas', async ({ page }) => {
    await bootGame(page, { touch: true });

    for (let i = 0; i < 3; i++) {
      await resizeTo(page, 844, 390);
      expectFillsViewport(await measure(page));
      await resizeTo(page, 390, 844);
      expectFillsViewport(await measure(page));
    }
  });

  test('URL-bar collapse (height-only change) is picked up', async ({ page }) => {
    await bootGame(page, { touch: true });
    await resizeTo(page, 932, 430);
    expectFillsViewport(await measure(page));

    // Mobile Safari/Chrome grow the viewport when the toolbars auto-hide.
    await resizeTo(page, 932, 510);

    const m = await measure(page);
    expectFillsViewport(m);
    expect(m.css.h).toBeCloseTo(510, 0);
  });

  test('odd / very small viewports still map 1:1', async ({ page }) => {
    await bootGame(page, { touch: true });

    for (const [w, h] of [[320, 568], [667, 375], [1024, 768], [281, 653]]) {
      await resizeTo(page, w, h);
      expectFillsViewport(await measure(page));
    }
  });

  test('lowering the render resolution keeps the canvas full-bleed', async ({ page }) => {
    await bootGame(page, { touch: true });

    const before = await measure(page);
    await page.evaluate(() => {
      const el = document.getElementById('optRes');
      el.value = '0.5';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));

    const after = await measure(page);
    expect(after.pixelRatio, 'pixel ratio should drop with the res slider')
      .toBeLessThan(before.pixelRatio);
    // Fewer buffer pixels, identical element box.
    expect(after.buffer.w).toBeLessThan(before.buffer.w);
    expectFillsViewport(after);
  });

  test('no blank region anywhere on screen while playing', async ({ page }) => {
    await bootGame(page, { touch: true });
    await resizeTo(page, 932, 430);
    await startPlaying(page);

    expectFillsViewport(await measure(page));
    expect(await probeCoverage(page), 'points not covered by the canvas').toEqual([]);

    // ...and after a rotation, which is when the bug used to appear.
    await resizeTo(page, 430, 932);
    await resizeTo(page, 932, 430);

    expectFillsViewport(await measure(page));
    expect(await probeCoverage(page), 'points not covered after rotating').toEqual([]);
  });

  test('touch controls re-anchor inside the viewport after a rotation', async ({ page }) => {
    await bootGame(page, { touch: true });
    await resizeTo(page, 412, 915);
    await resizeTo(page, 915, 412);

    const stick = await page.evaluate(() => {
      const app = document.getElementById('app');
      const el = document.getElementById('tStick');
      const r = el.getBoundingClientRect();
      return {
        homeX: window.TOUCH.homeX,
        homeY: window.TOUCH.homeY,
        rect: { x: r.left, y: r.top, w: r.width, h: r.height },
        view: { w: app.clientWidth, h: app.clientHeight }
      };
    });

    expect(stick.homeX).toBeGreaterThan(0);
    expect(stick.homeX).toBeLessThan(stick.view.w);
    expect(stick.homeY).toBeGreaterThan(0);
    expect(stick.homeY).toBeLessThan(stick.view.h);
    expect(stick.rect.y + stick.rect.h, 'stick must stay on screen')
      .toBeLessThanOrEqual(stick.view.h + 1);
  });

  test('portrait gate follows the real viewport orientation', async ({ page }) => {
    await bootGame(page, { touch: true });

    await resizeTo(page, 412, 915);
    await expect
      .poll(() => page.evaluate(() => document.body.classList.contains('portrait')))
      .toBe(true);
    await expect(page.locator('#rotate')).toBeVisible();

    await resizeTo(page, 915, 412);
    await expect
      .poll(() => page.evaluate(() => document.body.classList.contains('portrait')))
      .toBe(false);
    await expect(page.locator('#rotate')).toBeHidden();
  });

  test('rotating to portrait mid-round pauses and gates the game', async ({ page }) => {
    await bootGame(page, { touch: true });
    await resizeTo(page, 932, 430);
    await startPlaying(page);

    await resizeTo(page, 430, 932);

    await expect.poll(() => page.evaluate(() => window.G.state)).toBe('paused');
    await expect(page.locator('#rotate')).toBeVisible();
    expectFillsViewport(await measure(page));
  });
});
