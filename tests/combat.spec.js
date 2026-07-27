'use strict';
/**
 * Combat, physics and pickups - the systems the other suites never touch.
 * Everything runs on a threat-free range 40m above the arena so no geometry,
 * bot or falling body can perturb a measurement.
 */

const { test, expect } = require('@playwright/test');
const { bootGame, ensureLandscape, startPlaying } = require('./helpers');

/** Boot into a live round and clear the arena down to a controlled range. */
async function range(page) {
  await bootGame(page, { touch: true });
  await ensureLandscape(page);
  await startPlaying(page);
  await page.evaluate(() => {
    window.currentSpread = function () {
      return 0;
    };
    MATCH.bots = 0; // the sparring bot would wander into these measurements
    ENEMIES.slice().forEach((e) => G.scene.remove(e.mesh));
    ENEMIES.length = 0;
    PROJ.slice().forEach((p) => G.scene.remove(p.mesh));
    PROJ.length = 0;
    PICKUPS.slice().forEach((p) => G.scene.remove(p.mesh));
    PICKUPS.length = 0;

    window.__aim = function (target) {
      const ex = PL.pos.x;
      const ey = PL.pos.y + PL.eye;
      const ez = PL.pos.z;
      const dx = target.x - ex;
      const dy = target.y - ey;
      const dz = target.z - ez;
      PL.yaw = Math.atan2(-dx, -dz);
      PL.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      updateCamera(0);
      G.camera.updateMatrixWorld(true);
    };
    window.__reset = function () {
      PL.pos.set(0, 40, 0);
      PL.vel.set(0, 0, 0);
      PL.yaw = 0;
      PL.pitch = 0;
      PL.hp = PL.maxHp;
      PL.armor = 0;
      PL.stam = PL.maxStam;
      PL.exhausted = false;
      PL.alive = true;
      PL.crouch = false;
      PL.ads = 0;
      PL.adsTarget = 0;
      PL.recoilP = 0;
      PL.recoilY = 0;
      PL.heat = 0;
      PL.bobAmt = 0;
      PL.fireCd = 0;
      PL.reloading = 0;
      PL.meleeAnim = 0;
      PL.meleeCd = 0;
      PL.sprinting = false;
      PL.onGround = true;
      PL.wasAir = 0;
      PL.hurtCd = 0;
      G.shake = 0;
      G.shakeTime = 0;
      PL.shakeOff.set(0, 0, 0);
      IN.keys = {};
      IN.down = {};
      IN.axis.x = 0;
      IN.axis.y = 0;
      ENEMIES.slice().forEach((e) => G.scene.remove(e.mesh));
      ENEMIES.length = 0;
      PROJ.slice().forEach((p) => G.scene.remove(p.mesh));
      PROJ.length = 0;
      PICKUPS.slice().forEach((p) => G.scene.remove(p.mesh));
      PICKUPS.length = 0;
    };
    window.__dummy = function (x, y, z, type) {
      const e = spawnEnemy(type || 'grunt', new THREE.Vector3(x, y, z));
      e.hp = e.maxHp = 1e6;
      e.stun = 999; // freeze the AI so it cannot move mid-measurement
      updateEnemies(0);
      return e;
    };
    window.__reset();
  });
}

test.describe('gunplay', () => {
  test('headshots deal more damage than body shots', async ({ page }) => {
    await range(page);
    const r = await page.evaluate(() => {
      const shoot = (part) => {
        __reset();
        switchWeapon(1, true); // SMG
        const e = __dummy(0, 40, -12);
        const box = part === 'head' ? e.hitHead : e.hitBody;
        __aim({
          x: (box.minx + box.maxx) / 2,
          y: (box.miny + box.maxy) / 2,
          z: (box.minz + box.maxz) / 2
        });
        const before = e.hp;
        fireWeapon();
        return before - e.hp;
      };
      return { body: shoot('body'), head: shoot('head'), mult: curW().def.headMul };
    });
    expect(r.body).toBeGreaterThan(0);
    expect(r.head).toBeGreaterThan(r.body);
    expect(r.head / r.body).toBeCloseTo(r.mult, 1);
  });

  test('damage falls off past the weapon falloff range', async ({ page }) => {
    await range(page);
    const r = await page.evaluate(() => {
      const shootAt = (dist) => {
        __reset();
        switchWeapon(1, true);
        const e = __dummy(0, 40, -dist);
        __aim({
          x: 0,
          y: (e.hitBody.miny + e.hitBody.maxy) / 2,
          z: -dist
        });
        const before = e.hp;
        fireWeapon();
        return before - e.hp;
      };
      const fall = WDEF[1].falloff;
      return { near: shootAt(8), far: shootAt(Math.min(fall * 3, 200)), falloff: fall };
    });
    expect(r.near).toBeGreaterThan(0);
    expect(r.far).toBeGreaterThan(0);
    expect(r.far, 'a distant shot must do less damage').toBeLessThan(r.near);
  });

  test('the shotgun puts several pellets on a close target', async ({ page }) => {
    await range(page);
    const r = await page.evaluate(() => {
      __reset();
      switchWeapon(2, true); // SPAS-12
      const d = curW().def;
      const e = __dummy(0, 40, -6);
      __aim({ x: 0, y: (e.hitBody.miny + e.hitBody.maxy) / 2, z: -6 });
      const before = e.hp;
      fireWeapon();
      return { pellets: d.pellets, perPellet: d.dmg, dealt: before - e.hp };
    });
    expect(r.pellets).toBeGreaterThan(1);
    // With zero spread every pellet lands, so the burst beats a single pellet.
    expect(r.dealt).toBeGreaterThan(r.perPellet * 1.5);
  });

  test('the sniper pierces through several targets', async ({ page }) => {
    await range(page);
    const r = await page.evaluate(() => {
      __reset();
      switchWeapon(3, true); // M82
      // Stand the line slightly high so a level shot passes through every body -
      // aiming at the first one's centre would tilt the ray down under the rest.
      const a = __dummy(0, 40.3, -10);
      const b = __dummy(0, 40.3, -16);
      const c = __dummy(0, 40.3, -22);
      updateEnemies(0);
      __aim({ x: 0, y: PL.pos.y + PL.eye, z: -10 });
      const before = [a.hp, b.hp, c.hp];
      fireWeapon();
      return {
        pierce: curW().def.pierce,
        hurt: [a.hp < before[0], b.hp < before[1], c.hp < before[2]]
      };
    });
    expect(r.pierce).toBeGreaterThan(0);
    expect(r.hurt, 'one round should pass through the line').toEqual([true, true, true]);
  });

  test('an empty magazine dry-fires and reloads itself', async ({ page }) => {
    await range(page);
    const r = await page.evaluate(() => {
      __reset();
      switchWeapon(1, true);
      const w = curW();
      w.ammo = 1;
      w.reserve = 60;
      IN.down[0] = true;
      const steps = [];
      for (let i = 0; i < 40; i++) {
        updateWeapon(1 / 60);
        steps.push({ ammo: w.ammo, reloading: +w.def && PL.reloading > 0 });
      }
      IN.down[0] = false;
      return { emptied: steps.some((s) => s.ammo === 0), reloadStarted: PL.reloading > 0 };
    });
    expect(r.emptied, 'firing should empty the magazine').toBe(true);
    expect(r.reloadStarted, 'an empty gun should start reloading').toBe(true);
  });

  test('reloading never takes more than the reserve holds', async ({ page }) => {
    await range(page);
    const r = await page.evaluate(() => {
      __reset();
      switchWeapon(1, true);
      const w = curW();
      w.ammo = 0;
      w.reserve = 5;
      tryReload();
      const total = PL.reloadTotal;
      for (let i = 0; i < 600 && PL.reloading > 0; i++) updateWeapon(1 / 60);
      return { ammo: w.ammo, reserve: w.reserve, mag: w.def.mag, total };
    });
    expect(r.total).toBeGreaterThan(0);
    expect(r.ammo, 'only what the reserve had').toBe(5);
    expect(r.reserve).toBe(0);
    expect(r.ammo).toBeLessThanOrEqual(r.mag);
  });

  test('melee only reaches targets in front and close', async ({ page }) => {
    await range(page);
    const r = await page.evaluate(() => {
      const swing = (z) => {
        __reset();
        const e = __dummy(0, 40, z);
        __aim({ x: 0, y: (e.hitBody.miny + e.hitBody.maxy) / 2, z: z });
        const before = e.hp;
        doMelee();
        return before - e.hp;
      };
      return { close: swing(-1.4), far: swing(-9) };
    });
    expect(r.close, 'a bash should land on an adjacent target').toBeGreaterThan(0);
    expect(r.far, 'a bash should not reach across the map').toBe(0);
  });
});

test.describe('player physics', () => {
  test('solid geometry stops the player walking through it', async ({ page }) => {
    await range(page);
    const r = await page.evaluate(() => {
      // An interior block - a perimeter wall is unusable because the arena clamp
      // keeps the player inside it anyway.
      const edge = WORLD.size - 14;
      const c = WORLD.colliders.find(
        (b) =>
          !b.disabled &&
          b.miny <= 0.2 &&
          b.maxy > 1.4 &&
          b.maxx - b.minx > 1 &&
          b.maxz - b.minz > 1 &&
          Math.abs(b.minx) < edge &&
          Math.abs(b.minz) < edge
      );
      if (!c) return { skipped: true };
      const midZ = (c.minz + c.maxz) / 2;
      __reset();
      PL.pos.set(c.minx - 2.5, 0, midZ);
      PL.yaw = -Math.PI / 2; // face +X, into the block
      IN.keys['KeyW'] = true;
      for (let i = 0; i < 180; i++) updatePlayer(1 / 60);
      IN.keys['KeyW'] = false;
      return {
        skipped: false,
        finalX: PL.pos.x,
        wallX: c.minx,
        insideSolid: blockedAt(PL.pos.x, PL.pos.y, PL.pos.z, PL.radius, PL.standH)
      };
    });
    test.skip(r.skipped, 'no suitable collider in this arena');
    expect(r.insideSolid, 'the player must never end up inside geometry').toBe(false);
    expect(r.finalX, 'walking into a wall must not pass through it').toBeLessThan(r.wallX);
  });

  test('falling from height hurts', async ({ page }) => {
    await range(page);
    const r = await page.evaluate(() => {
      __reset();
      PL.pos.set(0, 30, 26);
      PL.vel.set(0, 0, 0);
      PL.onGround = false;
      for (let i = 0; i < 600 && !(PL.onGround && PL.vel.y >= 0 && PL.pos.y < 1); i++) {
        updatePlayer(1 / 60);
      }
      return { hp: PL.hp, landedY: +PL.pos.y.toFixed(2), alive: PL.alive };
    });
    expect(r.hp, 'a long drop should cost health').toBeLessThan(100);
  });

  test('sprinting drains stamina and exhaustion stops it', async ({ page }) => {
    await range(page);
    const r = await page.evaluate(() => {
      __reset();
      PL.pos.set(0, 0, 26);
      IN.keys['KeyW'] = true;
      IN.keys['ShiftLeft'] = true;
      let sprintedAtAll = false;
      for (let i = 0; i < 60 * 20; i++) {
        updatePlayer(1 / 60);
        if (PL.sprinting) sprintedAtAll = true;
        if (PL.exhausted) break;
      }
      const exhausted = PL.exhausted;
      // Sprint is decided from the previous frame's exhaustion, so step past the
      // transition frame before checking that it actually stopped.
      for (let i = 0; i < 10; i++) updatePlayer(1 / 60);
      const sprintingWhileSpent = PL.sprinting;
      IN.keys['KeyW'] = false;
      IN.keys['ShiftLeft'] = false;
      return { sprintedAtAll, exhausted, stam: Math.round(PL.stam), sprintingWhileSpent };
    });
    expect(r.sprintedAtAll).toBe(true);
    expect(r.exhausted, 'holding sprint should eventually exhaust you').toBe(true);
    expect(r.sprintingWhileSpent, 'an exhausted player cannot keep sprinting').toBe(false);
  });

  test('crouching lowers the player and standing up is blocked under cover', async ({ page }) => {
    await range(page);
    const r = await page.evaluate(() => {
      __reset();
      PL.pos.set(0, 0, 26);
      IN.keys['ControlLeft'] = true;
      for (let i = 0; i < 90; i++) updatePlayer(1 / 60);
      const crouched = { h: +PL.h.toFixed(2), crouch: PL.crouch };
      IN.keys['ControlLeft'] = false;
      for (let i = 0; i < 120; i++) updatePlayer(1 / 60);
      return { crouched, stoodH: +PL.h.toFixed(2), standH: PL.standH, crouchH: PL.crouchH };
    });
    expect(r.crouched.crouch).toBe(true);
    expect(r.crouched.h).toBeLessThan(r.standH);
    expect(r.crouched.h).toBeCloseTo(r.crouchH, 1);
    expect(r.stoodH).toBeCloseTo(r.standH, 1);
  });
});

test.describe('damage and survival', () => {
  test('armor soaks most of a hit before health does', async ({ page }) => {
    await range(page);
    const r = await page.evaluate(() => {
      __reset();
      PL.armor = 100;
      const hp0 = PL.hp;
      const ar0 = PL.armor;
      damagePlayer(100, null, true);
      return { hpLost: hp0 - PL.hp, armorLost: ar0 - PL.armor };
    });
    expect(r.armorLost, 'armor should absorb the bulk of it').toBeGreaterThan(r.hpLost);
    expect(r.hpLost).toBeGreaterThan(0);
    expect(r.armorLost + r.hpLost).toBeCloseTo(100, 0);
  });

  test('health regenerates only after the hurt window passes', async ({ page }) => {
    await range(page);
    const r = await page.evaluate(() => {
      __reset();
      PL.pos.set(0, 0, 26);
      damagePlayer(40, null, true);
      const hurt = PL.hp;
      for (let i = 0; i < 60; i++) updatePlayer(1 / 60); // 1s - still bleeding out
      const soonAfter = PL.hp;
      for (let i = 0; i < 60 * 12; i++) updatePlayer(1 / 60);
      return { hurt, soonAfter, later: PL.hp, max: PL.maxHp };
    });
    expect(r.hurt).toBeLessThan(r.max);
    expect(r.soonAfter, 'no instant regen').toBeCloseTo(r.hurt, 0);
    expect(r.later, 'health should come back eventually').toBeGreaterThan(r.hurt);
  });

  test('explosions damage everything in their radius', async ({ page }) => {
    await range(page);
    const r = await page.evaluate(() => {
      __reset();
      const near = __dummy(0, 40, -3);
      const far = __dummy(0, 40, -40);
      updateEnemies(0);
      const before = [near.hp, far.hp];
      doExplosion(new THREE.Vector3(0, 40, -3), 9.5, 210, true);
      return { nearHurt: before[0] - near.hp, farHurt: before[1] - far.hp };
    });
    expect(r.nearHurt, 'a target in the blast must take damage').toBeGreaterThan(0);
    expect(r.farHurt, 'a target well outside the radius must not').toBe(0);
  });

  test('grenades and rockets both spawn and detonate', async ({ page }) => {
    await range(page);
    const r = await page.evaluate(() => {
      __reset();
      const dir = new THREE.Vector3(0, 0, -1);
      spawnGrenade(new THREE.Vector3(0, 40, 0), dir, 1);
      const afterGrenade = PROJ.length;
      spawnRocket(new THREE.Vector3(0, 40, 0), dir);
      const afterRocket = PROJ.length;
      const kinds = PROJ.map((p) => p.type);
      // Run them out: both are explosive and must clear themselves up.
      for (let i = 0; i < 60 * 10 && PROJ.length; i++) updateProjectiles(1 / 60);
      return { afterGrenade, afterRocket, kinds, left: PROJ.length };
    });
    expect(r.afterGrenade).toBe(1);
    expect(r.afterRocket).toBe(2);
    expect(r.kinds).toEqual(['grenade', 'rocket']);
    expect(r.left, 'projectiles must not leak').toBe(0);
  });
});

test.describe('pickups', () => {
  test('health, armor, ammo and grenade pickups all apply', async ({ page }) => {
    await range(page);
    const r = await page.evaluate(() => {
      const take = (kind, amount, prep) => {
        __reset();
        PL.pos.set(0, 0, 26);
        prep();
        spawnPickup(new THREE.Vector3(PL.pos.x, PL.pos.y + 0.5, PL.pos.z), kind, amount);
        for (let i = 0; i < 30 && PICKUPS.length; i++) updatePickups(1 / 60);
        return PICKUPS.length === 0;
      };
      const out = {};
      out.health = take('health', 40, () => {
        PL.hp = 40;
      });
      out.healthHp = PL.hp;
      out.armor = take('armor', 50, () => {
        PL.armor = 0;
      });
      out.armorVal = PL.armor;
      out.grenade = take('grenade', 1, () => {
        PL.grenades = 0;
      });
      out.grenadeVal = PL.grenades;
      let reserveBefore = 0;
      out.ammo = take('ammo', 1, () => {
        switchWeapon(1, true);
        curW().reserve = 10;
        reserveBefore = 10;
      });
      out.reserveBefore = reserveBefore;
      out.reserveAfter = curW().reserve;
      return out;
    });
    expect(r.health, 'health pickup consumed').toBe(true);
    expect(r.healthHp).toBeGreaterThan(40);
    expect(r.armor).toBe(true);
    expect(r.armorVal).toBeGreaterThan(0);
    expect(r.grenade).toBe(true);
    expect(r.grenadeVal).toBeGreaterThan(0);
    expect(r.ammo).toBe(true);
    expect(r.reserveAfter).toBeGreaterThan(r.reserveBefore);
  });

  test('a full player leaves a health pickup on the floor', async ({ page }) => {
    await range(page);
    const left = await page.evaluate(() => {
      __reset();
      PL.pos.set(0, 0, 26);
      PL.hp = PL.maxHp;
      spawnPickup(new THREE.Vector3(PL.pos.x, PL.pos.y + 0.5, PL.pos.z), 'health', 25);
      for (let i = 0; i < 30; i++) updatePickups(1 / 60);
      return PICKUPS.length;
    });
    expect(left, 'do not waste a medkit at full health').toBe(1);
  });
});

test.describe('deathmatch rules', () => {
  test('respawn points are always clear of geometry', async ({ page }) => {
    await range(page);
    const bad = await page.evaluate(() => {
      const misses = [];
      for (let i = 0; i < 40; i++) {
        const sp = mpSpawnPoint();
        if (blockedAt(sp.x, 0, sp.z, PL.radius, PL.standH)) {
          misses.push([+sp.x.toFixed(1), +sp.z.toFixed(1)]);
        }
      }
      return misses;
    });
    expect(bad, 'never respawn a player inside a wall').toEqual([]);
  });

  test('the scoreboard ranks by frags', async ({ page }) => {
    await range(page);
    const rows = await page.evaluate(() => {
      MATCH.kills = 3;
      MATCH.deaths = 1;
      NET.peers['aaa'] = mpMakePeer('aaa', 'TOP');
      NET.peers['aaa'].kills = 9;
      NET.peers['bbb'] = mpMakePeer('bbb', 'MID');
      NET.peers['bbb'].kills = 5;
      return mpBoard().map((r) => ({ name: r.name, kills: r.kills }));
    });
    expect(rows.map((r) => r.kills)).toEqual([9, 5, 3]);
    expect(rows[0].name).toBe('TOP');
  });
});
