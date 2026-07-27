'use strict';
/** Boot / gameplay smoke tests - guards the engine init path and HUD layout. */

const { test, expect } = require('@playwright/test');
const { bootGame, measure, expectFillsViewport, startPlaying, collectErrors } = require('./helpers');

/** The game deliberately gates play behind a rotate-to-landscape screen. */
function skipIfPortrait(page) {
  const vp = page.viewportSize();
  test.skip(vp.width < vp.height, 'portrait shows the rotate gate instead of the HUD');
}

test.describe('boot', () => {
  test('reaches the main menu with a live WebGL context and no errors', async ({ page }) => {
    const errors = collectErrors(page);
    await bootGame(page);

    await expect(page.locator('#menu')).toHaveClass(/on/);
    await expect(page.locator('#loading')).toBeHidden();
    await expect(page.locator('#loadErr')).toBeHidden();

    const ok = await page.evaluate(() => {
      const gl = window.G.renderer.getContext();
      return !!gl && !gl.isContextLost();
    });
    expect(ok, 'WebGL context should be alive').toBe(true);
    expect(errors).toEqual([]);
  });

  test('renders frames continuously', async ({ page }) => {
    await bootGame(page);

    const first = await page.evaluate(() => window.G.frame);
    await page.waitForFunction((f) => window.G.frame > f + 5, first, { timeout: 10_000 });
    expect(await page.evaluate(() => window.G.frame)).toBeGreaterThan(first);
  });
});

test.describe('gameplay', () => {
  test('the menu offers deathmatch only', async ({ page }) => {
    await bootGame(page, { query: 'touch=0' });

    await expect(page.locator('#btnMulti')).toBeVisible();
    await expect(page.locator('#btnHelp')).toBeVisible();
    await expect(page.locator('#btnOpts')).toBeVisible();
    // Survival and solo practice are no longer offered.
    expect(await page.locator('#btnPlay').count(), 'Deploy should be gone').toBe(0);
    await page.locator('#btnMulti').click();
    expect(await page.locator('#btnMpSolo').count(), 'Solo vs Bots should be gone').toBe(0);
  });

  test('Enter Arena starts a deathmatch and shows the HUD', async ({ page }) => {
    skipIfPortrait(page);
    await bootGame(page, { touch: true });
    await startPlaying(page);

    await expect(page.locator('#hud')).toHaveClass(/on/);
    await expect(page.locator('#menu')).not.toHaveClass(/on/);
    await expect(page.locator('#waveTitle')).toHaveText('DEATHMATCH');
    await expect(page.locator('#waveNum')).toHaveText('0 / 20');
    await expect(page.locator('#wAmmo')).not.toBeEmpty();
    expectFillsViewport(await measure(page));
  });

  test('touch control layer is shown on touch devices', async ({ page }) => {
    skipIfPortrait(page);
    await bootGame(page, { touch: true });
    await startPlaying(page);

    await expect(page.locator('#touchUI')).toHaveClass(/on/);
    for (const id of ['tFire', 'tAds', 'tJump', 'tReload', 'tCrouch', 'tSwap']) {
      await expect(page.locator(`#${id}`)).toBeVisible();
    }
  });

  test('touch controls stay off for pointer devices', async ({ page }) => {
    await bootGame(page, { query: 'touch=0' });
    await startPlaying(page);

    await expect(page.locator('#menu')).not.toHaveClass(/on/);
    await expect(page.locator('#touchUI')).not.toHaveClass(/on/);
    await expect(page.locator('#rotate')).toBeHidden();
  });

  test('a browser that refuses pointer lock is still playable', async ({ page }) => {
    const errors = collectErrors(page);
    await bootGame(page, { query: 'touch=0' });

    // Iframes and embedded browsers reject the request; the game must not strand
    // the player with no look or fire, and must not leak an unhandled rejection.
    await page.evaluate(() => {
      HTMLElement.prototype.requestPointerLock = function () {
        return Promise.reject(new DOMException('denied', 'WrongDocumentError'));
      };
    });
    await page.evaluate(() => startGame('dm'));

    await expect.poll(() => page.evaluate(() => window.IN.locked)).toBe(true);
    expect(await page.evaluate(() => window.G.state)).toBe('playing');
    await expect(page.locator('#notice')).toContainText(/POINTER LOCK/i);
    expect(errors).toEqual([]);
  });

  // BUG-001: pausing used to rely entirely on the browser releasing pointer lock,
  // so a browser that denies the lock left the player with no way to pause.
  test('Escape pauses and resumes even without pointer lock', async ({ page }) => {
    await bootGame(page, { query: 'touch=0' });
    await page.evaluate(() => {
      HTMLElement.prototype.requestPointerLock = function () {
        return Promise.reject(new DOMException('denied', 'WrongDocumentError'));
      };
    });
    await page.evaluate(() => startGame('dm'));
    await expect.poll(() => page.evaluate(() => window.G.state)).toBe('playing');

    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => window.G.state)).toBe('paused');
    await expect(page.locator('#pause')).toHaveClass(/on/);

    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => window.G.state)).toBe('playing');
    await expect(page.locator('#pause')).not.toHaveClass(/on/);
  });

  test('settings survive a reload', async ({ page }) => {
    await bootGame(page, { query: 'touch=0' });

    await page.evaluate(() => {
      const set = (id, v) => {
        const el = document.getElementById(id);
        el.value = String(v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      set('optFov', 96);
      set('optSens', 1.75);
      set('optRes', 0.8);
      const sh = document.getElementById('optShadow');
      if (sh.checked) sh.click();
    });
    const before = await page.evaluate(() => ({ ...window.SET }));
    expect(before.fov).toBe(96);
    expect(before.shadows).toBe(false);

    await page.reload();
    await page.waitForFunction(() => window.G && window.G.state === 'menu', undefined, {
      timeout: 45_000
    });

    const after = await page.evaluate(() => ({ ...window.SET }));
    expect(after.fov, 'field of view should be remembered').toBe(96);
    expect(after.sens).toBeCloseTo(1.75, 2);
    expect(after.res).toBeCloseTo(0.8, 2);
    expect(after.shadows, 'shadow toggle should be remembered').toBe(false);
    // ...and the reloaded game should actually use them.
    await page.evaluate(() => startGame('dm'));
    await expect.poll(() => page.evaluate(() => Math.round(window.G.camera.fov))).toBe(96);
  });

  test('HUD panels stay inside the viewport in landscape', async ({ page }, testInfo) => {
    skipIfPortrait(page);
    await bootGame(page, { touch: true });
    await startPlaying(page);

    const overflow = await page.evaluate(() => {
      const app = document.getElementById('app');
      const w = app.clientWidth;
      const h = app.clientHeight;
      const bad = [];
      for (const id of ['scoreBox', 'waveBox', 'mapBox', 'vitals', 'weaponBox', 'tFire', 'tPause']) {
        const el = document.getElementById(id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.left < -1 || r.top < -1 || r.right > w + 1 || r.bottom > h + 1) {
          bad.push({ id, left: r.left, top: r.top, right: r.right, bottom: r.bottom, w, h });
        }
      }
      return bad;
    });

    expect(overflow, `HUD elements overflowing on ${testInfo.project.name}`).toEqual([]);
  });
});
