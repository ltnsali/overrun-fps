#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   Play Console screenshots, taken from the app itself.

   Play wants at least two phone screenshots and will reject anything that is
   not the real product, so these are grabbed off an attached device or
   emulator running the installed build rather than mocked up.

       npm run android:install
       node tools/screenshots.js

   Writes store/screenshots/*.png.
--------------------------------------------------------------------------- */
'use strict';

const fs = require('fs');
const path = require('path');
const { _android: android, chromium } = require('playwright-core');

const PKG = process.env.ANDROID_PKG || 'com.overrun.fps';
const ACTIVITY = PKG + '/.MainActivity';
const OUT = path.resolve(__dirname, '..', 'store', 'screenshots');

/* Play refuses a screenshot whose long side is more than twice its short one,
   and a Pixel 5 framebuffer is 2340x1080 - just over the line. Rather than crop
   into the HUD, the frame is scaled to fit a 16:9 canvas and the leftover
   pillars are filled with the game's own background, so nothing is lost. */
const SHOT_W = 1920;
const SHOT_H = 1080;
const BG = '#05070c';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const devices = await android.devices();
  if (devices.length === 0) {
    console.error('no device or emulator attached - check `adb devices`');
    process.exit(1);
  }
  const device = devices[0];
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const canvas = await browser.newPage();

  await device.shell('am force-stop ' + PKG);
  await device.shell('am start -n ' + ACTIVITY);
  const page = await (await device.webView({ pkg: PKG }, { timeout: 60_000 })).page();
  await page.waitForFunction(() => window.G && window.G.state === 'menu', undefined, {
    timeout: 60_000
  });

  const shot = async (name) => {
    const raw = (await device.screenshot()).toString('base64');
    const url = await canvas.evaluate(
      async ([src, w, h, bg]) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const el = document.createElement('canvas');
        el.width = w;
        el.height = h;
        const c = el.getContext('2d');
        c.fillStyle = bg;
        c.fillRect(0, 0, w, h);
        const s = Math.min(w / img.width, h / img.height);
        const dw = img.width * s;
        const dh = img.height * s;
        c.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
        return el.toDataURL('image/png');
      },
      ['data:image/png;base64,' + raw, SHOT_W, SHOT_H, BG]
    );
    const file = path.join(OUT, name + '.png');
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    console.log('  ' + path.relative(process.cwd(), file));
  };

  await wait(800);
  await shot('1-menu');

  await page.locator('#btnPlay').click();
  await page.waitForFunction(() => window.G.state === 'playing', undefined, { timeout: 30_000 });

  /* Let a wave actually arrive - an empty arena is a dull first impression. */
  await page.waitForFunction(() => window.ENEMIES && window.ENEMIES.length > 0, undefined, {
    timeout: 30_000
  }).catch(() => {});
  await wait(2500);
  await shot('2-survival');

  await page.evaluate(() => {
    if (typeof window.fireWeapon === 'function') window.fireWeapon();
  }).catch(() => {});
  await wait(400);
  await shot('3-firefight');

  await page.evaluate(() => window.pauseGame && window.pauseGame());
  await wait(600);
  await shot('4-pause');

  await page.evaluate(() => window.quitToMenu && window.quitToMenu());
  await page.waitForFunction(() => window.G.state === 'menu', undefined, { timeout: 20_000 });
  await page.locator('#btnMulti').click();
  await wait(1200);
  await shot('5-multiplayer');

  await device.close();
  await browser.close();
  console.log('screenshots: done');
}

main();
