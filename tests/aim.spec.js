'use strict';
/**
 * Aim fidelity: a shot must land on whatever the crosshair is covering, and the
 * on-screen FIRE / AIM buttons must be draggable so the aim can be corrected
 * without lifting the firing thumb.
 */

const { test, expect } = require('@playwright/test');
const {
  bootGame,
  resizeTo,
  ensureLandscape,
  startPlaying,
  touchStart,
  touchMoveBy,
  touchEnd,
  nextFrame
} = require('./helpers');

/** Boot straight into a live round in landscape (the game gates portrait play). */
async function bootRound(page) {
  await bootGame(page, { touch: true });
  await ensureLandscape(page);
  await startPlaying(page);
}

/**
 * Park the player and one enemy in empty air 40m up (nothing in the level can
 * block the ray), aim `yawOffsetDeg` off the enemy's body centre, and fire one
 * deterministic shot. Everything happens inside a single evaluate so no game
 * frame can move anything mid-measurement.
 */
function aimAndFire(page, yawOffsetDeg) {
  return page.evaluate((offDeg) => {
    window.currentSpread = function () {
      return 0;
    };

    ENEMIES.slice().forEach(function (e) {
      G.scene.remove(e.mesh);
    });
    ENEMIES.length = 0;

    PL.pos.set(0, 40, 0);
    PL.vel.set(0, 0, 0);
    PL.ads = 0;
    PL.adsTarget = 0;
    PL.crouch = false;
    PL.sprinting = false;
    PL.heat = 0;
    PL.recoilP = 0;
    PL.recoilY = 0;
    PL.bobAmt = 0;
    PL.fireCd = 0;
    PL.reloading = 0;
    PL.meleeAnim = 0;
    G.shake = 0;
    G.shakeTime = 0;
    PL.shakeOff.set(0, 0, 0);

    const e = spawnEnemy('grunt', new THREE.Vector3(0, 40, -14));
    e.hp = e.maxHp = 1e6; // survives any weapon so damage is measurable
    updateEnemies(0); // refresh hitboxes without advancing anything

    const cx = (e.hitBody.minx + e.hitBody.maxx) / 2;
    const cy = (e.hitBody.miny + e.hitBody.maxy) / 2;
    const cz = (e.hitBody.minz + e.hitBody.maxz) / 2;

    const ex = PL.pos.x;
    const ey = PL.pos.y + PL.eye;
    const ez = PL.pos.z;
    const dx = cx - ex;
    const dy = cy - ey;
    const dz = cz - ez;

    PL.yaw = Math.atan2(-dx, -dz) + (offDeg * Math.PI) / 180;
    PL.pitch = Math.atan2(dy, Math.hypot(dx, dz));

    updateCamera(0);
    G.camera.updateMatrixWorld(true);

    // Where does the target sit on screen? (0,0) in NDC is the crosshair.
    const ndc = new THREE.Vector3(cx, cy, cz).project(G.camera);
    const aimEnemy = getAimEnemy();

    const before = e.hp;
    fireWeapon();

    return {
      ndc: { x: ndc.x, y: ndc.y },
      damage: before - e.hp,
      crosshairSaysHostile: aimEnemy === e
    };
  }, yawOffsetDeg);
}

test.describe('aim fidelity', () => {
  test('crosshair sits exactly at the centre of the rendered canvas', async ({ page }) => {
    await bootGame(page, { touch: true });

    const c = await page.evaluate(() => {
      const canvas = document.querySelector('#app canvas');
      const cross = document.getElementById('crosshair');
      const cr = canvas.getBoundingClientRect();
      const xr = cross.getBoundingClientRect();
      return {
        canvas: { x: cr.left + cr.width / 2, y: cr.top + cr.height / 2 },
        crosshair: { x: xr.left + xr.width / 2, y: xr.top + xr.height / 2 }
      };
    });

    // If these drift apart, every shot lands away from where the player aimed.
    expect(Math.abs(c.crosshair.x - c.canvas.x), 'crosshair x vs canvas centre')
      .toBeLessThanOrEqual(1);
    expect(Math.abs(c.crosshair.y - c.canvas.y), 'crosshair y vs canvas centre')
      .toBeLessThanOrEqual(1);
  });

  test('a shot lands on whatever the crosshair covers', async ({ page }) => {
    await bootRound(page);

    const r = await aimAndFire(page, 0);

    expect(Math.abs(r.ndc.x), 'target must project onto the crosshair').toBeLessThan(0.01);
    expect(Math.abs(r.ndc.y), 'target must project onto the crosshair').toBeLessThan(0.01);
    expect(r.crosshairSaysHostile, 'crosshair should flag the hostile').toBe(true);
    expect(r.damage, 'centred shot must hit').toBeGreaterThan(0);
  });

  test('a shot aimed off-target misses', async ({ page }) => {
    await bootRound(page);

    const r = await aimAndFire(page, 12);

    expect(Math.abs(r.ndc.x), 'target should be well off centre').toBeGreaterThan(0.05);
    expect(r.crosshairSaysHostile).toBe(false);
    expect(r.damage, 'off-target shot must not hit').toBe(0);
  });

  test('aim stays true after a device rotation', async ({ page }) => {
    await bootGame(page, { touch: true });
    await resizeTo(page, 932, 430);
    await startPlaying(page);

    await resizeTo(page, 430, 932);
    await resizeTo(page, 932, 430);
    await page.evaluate(() => resumeGame());
    await page.waitForFunction(() => window.G.state === 'playing');

    const r = await aimAndFire(page, 0);
    expect(Math.abs(r.ndc.x)).toBeLessThan(0.01);
    expect(Math.abs(r.ndc.y)).toBeLessThan(0.01);
    expect(r.damage).toBeGreaterThan(0);
  });

  /* The RPG used to be posed like a rifle, putting 62% of the launcher over the
     target the moment you aimed. Iron sights legitimately cross the centre, so
     the budget allows a thin post but not a weapon body. */
  test('no weapon covers the target while aiming', async ({ page }) => {
    await bootRound(page);

    const occlusion = await page.evaluate(() => {
      const ray = new THREE.Raycaster();
      const out = [];
      for (let i = 0; i < PL.weapons.length; i++) {
        switchWeapon(i, true);
        PL.ads = 1; PL.adsTarget = 1;
        PL.sway.x = 0; PL.sway.y = 0; PL.bobAmt = 0;
        PL.viewKick = 0; PL.viewRot = 0; PL.viewSwitch = 0;
        PL.reloading = 0; PL.meleeAnim = 0; PL.sprinting = false;
        // Settle the damped view-model pose, then refresh the matrices the
        // raycaster reads - normally the renderer does that.
        for (let k = 0; k < 300; k++) animateViewModel(1 / 60);
        updateCamera(0);
        G.viewCam.updateMatrixWorld(true);
        G.viewScene.updateMatrixWorld(true);

        const m = VM.cur;
        let hit = 0;
        let total = 0;
        if (m.visible) {
          for (let gx = -6; gx <= 6; gx++) {
            for (let gy = -6; gy <= 6; gy++) {
              total++;
              ray.setFromCamera({ x: gx * 0.02, y: gy * 0.02 }, G.viewCam);
              if (ray.intersectObject(m, true).length) hit++;
            }
          }
        }
        out.push({ weapon: curW().def.name, pct: total ? Math.round((hit / total) * 100) : 0 });
      }
      return out;
    });

    expect(occlusion.length).toBe(5);
    for (const w of occlusion) {
      expect(w.pct, `${w.weapon} covers ${w.pct}% of the sight picture while aiming`)
        .toBeLessThanOrEqual(10);
    }
  });
});

test.describe('touch FIRE / AIM buttons', () => {
  test('FIRE fires while held and stops on release', async ({ page }) => {
    await bootRound(page);

    await touchStart(page, '#tFire');
    expect(await page.evaluate(() => window.IN.down[0])).toBe(true);
    await expect(page.locator('#tFire')).toHaveClass(/act/);

    await touchEnd(page);
    expect(await page.evaluate(() => window.IN.down[0])).toBe(false);
    await expect(page.locator('#tFire')).not.toHaveClass(/act/);
  });

  test('dragging on FIRE steers the aim while still firing', async ({ page }) => {
    await bootRound(page);

    const yaw0 = await page.evaluate(() => window.PL.yaw);

    await touchStart(page, '#tFire');
    await touchMoveBy(page, 120, 0);
    await nextFrame(page);

    const mid = await page.evaluate(() => ({ yaw: window.PL.yaw, firing: window.IN.down[0] }));
    expect(mid.firing, 'must keep firing while dragging').toBe(true);
    // Dragging right turns right, i.e. yaw decreases.
    expect(mid.yaw, 'drag right should turn the camera right').toBeLessThan(yaw0);

    const pitch0 = await page.evaluate(() => window.PL.pitch);
    await touchMoveBy(page, 0, -80);
    await nextFrame(page);
    expect(await page.evaluate(() => window.PL.pitch), 'drag up should raise the aim')
      .toBeGreaterThan(pitch0);

    await touchEnd(page);
    expect(await page.evaluate(() => window.IN.down[0])).toBe(false);
  });

  test('AIM latches ADS on and off', async ({ page }) => {
    await bootRound(page);

    await touchStart(page, '#tAds');
    await touchEnd(page);
    expect(await page.evaluate(() => window.IN.down[2]), 'first tap arms ADS').toBe(true);
    await expect(page.locator('#tAds')).toHaveClass(/act/);
    await expect.poll(() => page.evaluate(() => window.PL.ads)).toBeGreaterThan(0.5);

    await touchStart(page, '#tAds');
    await touchEnd(page);
    expect(await page.evaluate(() => window.IN.down[2]), 'second tap drops ADS').toBe(false);
    await expect(page.locator('#tAds')).not.toHaveClass(/act/);
  });

  test('dragging on AIM steers without cancelling ADS', async ({ page }) => {
    await bootRound(page);

    // Tap to latch ADS on.
    await touchStart(page, '#tAds');
    await touchEnd(page);
    expect(await page.evaluate(() => window.IN.down[2])).toBe(true);

    const yaw0 = await page.evaluate(() => window.PL.yaw);

    // A second touch used as a drag must steer, not toggle ADS back off.
    await touchStart(page, '#tAds');
    await touchMoveBy(page, -120, 0);
    await nextFrame(page);

    const after = await page.evaluate(() => ({ yaw: window.PL.yaw, ads: window.IN.down[2] }));
    expect(after.ads, 'a drag must not cancel ADS').toBe(true);
    expect(after.yaw, 'drag left should turn the camera left').toBeGreaterThan(yaw0);

    await touchEnd(page);
    expect(await page.evaluate(() => window.IN.down[2]), 'ADS stays latched after the drag')
      .toBe(true);
  });

  test('dragging on AIM from the hip does not switch ADS on', async ({ page }) => {
    await bootRound(page);
    expect(await page.evaluate(() => window.IN.down[2])).toBe(false);

    const yaw0 = await page.evaluate(() => window.PL.yaw);
    await touchStart(page, '#tAds');
    await touchMoveBy(page, 120, 0);
    await nextFrame(page);

    const after = await page.evaluate(() => ({ yaw: window.PL.yaw, ads: window.IN.down[2] }));
    expect(after.ads, 'a drag is an aim correction, not a toggle').toBe(false);
    expect(after.yaw, 'drag right should still turn the camera').toBeLessThan(yaw0);

    await touchEnd(page);
  });

  test('button drags never move the movement stick', async ({ page }) => {
    await bootRound(page);

    await touchStart(page, '#tFire');
    await touchMoveBy(page, -300, -200);
    await nextFrame(page);

    const axis = await page.evaluate(() => ({ x: window.IN.axis.x, y: window.IN.axis.y }));
    expect(axis.x).toBe(0);
    expect(axis.y).toBe(0);

    await touchEnd(page);
  });

  test('pausing clears a held FIRE button', async ({ page }) => {
    await bootRound(page);
    expect(await page.evaluate(() => window.G.state), 'round must be live').toBe('playing');

    await touchStart(page, '#tFire');
    expect(await page.evaluate(() => window.IN.down[0])).toBe(true);

    await page.evaluate(() => pauseGame());
    expect(await page.evaluate(() => window.IN.down[0]), 'must not fire while paused').toBe(false);
    await expect(page.locator('#tFire')).not.toHaveClass(/act/);
  });
});
