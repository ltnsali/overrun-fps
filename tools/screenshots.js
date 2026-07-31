#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   Play Console screenshots, taken from the app itself.

   Play wants at least two phone screenshots and will reject anything that is
   not the real product, so these are grabbed off an attached device or
   emulator running the installed build rather than mocked up.

       npm run android:install
       node tools/screenshots.js

   Writes store/screenshots/*.png.

   Play requires "JPEG or 24-bit PNG (no alpha)" for screenshots, and a canvas
   always hands back RGBA, so the frames are encoded here rather than by
   toDataURL - see writeOpaquePng below.

   Re-encoding a set that is already on disk, without a device:

       node tools/screenshots.js --reencode
--------------------------------------------------------------------------- */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { _android: android, chromium } = require('playwright-core');

const PKG = process.env.ANDROID_PKG || 'com.overrun.fps';
const ACTIVITY = PKG + '/.MainActivity';
/* Play keeps a separate set of screenshots per device type, so the tablet run
   writes somewhere else:  SHOT_DIR=screenshots-tablet node tools/screenshots.js */
const OUT = path.resolve(__dirname, '..', 'store', process.env.SHOT_DIR || 'screenshots');

/* Play refuses a screenshot whose long side is more than twice its short one,
   and a Pixel 5 framebuffer is 2340x1080 - just over the line. Rather than crop
   into the HUD, the frame is scaled to fit a 16:9 canvas and the leftover
   pillars are filled with the game's own background, so nothing is lost. */
const SHOT_W = 1920;
const SHOT_H = 1080;
const BG = '#05070c';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* --- 24-bit PNG writer ----------------------------------------------------
   Play rejects screenshots that carry an alpha channel, and canvas.toDataURL
   only ever emits colour type 6. zlib is in the standard library and a PNG is
   a short header plus one deflated stream, so the encoder lives here instead
   of pulling in an image library the rest of the repo does without. */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/* The five PNG row filters, picked per row by the minimum-sum-of-absolute-
   differences heuristic the spec itself suggests. Without it a 1920x1080 frame
   deflates to several megabytes; with it, to well under one. */
function filterRows(rgb, width, height) {
  const stride = width * 3;
  const out = Buffer.alloc((stride + 1) * height);
  const prev = Buffer.alloc(stride);
  const line = Buffer.alloc(stride);
  const cand = [Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride),
    Buffer.alloc(stride), Buffer.alloc(stride)];
  for (let y = 0; y < height; y++) {
    rgb.copy(line, 0, y * stride, y * stride + stride);
    const score = [0, 0, 0, 0, 0];
    for (let i = 0; i < stride; i++) {
      const a = i >= 3 ? line[i - 3] : 0;
      const b = prev[i];
      const c = i >= 3 ? prev[i - 3] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      cand[0][i] = line[i];
      cand[1][i] = (line[i] - a) & 0xff;
      cand[2][i] = (line[i] - b) & 0xff;
      cand[3][i] = (line[i] - ((a + b) >> 1)) & 0xff;
      cand[4][i] = (line[i] - pred) & 0xff;
      for (let f = 0; f < 5; f++) {
        const v = cand[f][i];
        score[f] += v < 128 ? v : 256 - v;
      }
    }
    let best = 0;
    for (let f = 1; f < 5; f++) if (score[f] < score[best]) best = f;
    const at = y * (stride + 1);
    out[at] = best;
    cand[best].copy(out, at + 1);
    line.copy(prev);
  }
  return out;
}

function writeOpaquePng(file, width, height, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; /* bit depth */
  ihdr[9] = 2; /* colour type 2: truecolour, no alpha */
  const body = zlib.deflateSync(filterRows(rgb, width, height), { level: 9 });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', body),
    pngChunk('IEND', Buffer.alloc(0))
  ]));
}

/* Letterbox a source frame onto the 16:9 store canvas and hand back its pixels
   as flat RGB, ready for writeOpaquePng. */
async function toRgb(canvas, dataUrl) {
  const b64 = await canvas.evaluate(
    async ([src, w, h, bg]) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const el = document.createElement('canvas');
      el.width = w;
      el.height = h;
      const c = el.getContext('2d', { alpha: false });
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
      const s = Math.min(w / img.width, h / img.height);
      const dw = img.width * s;
      const dh = img.height * s;
      c.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      const px = c.getImageData(0, 0, w, h).data;
      const rgb = new Uint8Array(w * h * 3);
      for (let i = 0, j = 0; i < px.length; i += 4) {
        rgb[j++] = px[i];
        rgb[j++] = px[i + 1];
        rgb[j++] = px[i + 2];
      }
      let s2 = '';
      for (let i = 0; i < rgb.length; i += 0x8000) {
        s2 += String.fromCharCode.apply(null, rgb.subarray(i, i + 0x8000));
      }
      return btoa(s2);
    },
    [dataUrl, SHOT_W, SHOT_H, BG]
  );
  return Buffer.from(b64, 'base64');
}

/* Rewrite a directory of already-captured frames as 24-bit PNGs. Nothing is
   re-shot: the pixels are the same, only the encoding changes. */
async function reencode() {
  const dirs = [
    path.resolve(__dirname, '..', 'store', 'screenshots'),
    path.resolve(__dirname, '..', 'store', 'screenshots-tablet')
  ].filter((d) => fs.existsSync(d));
  const browser = await chromium.launch();
  const canvas = await browser.newPage();
  for (const dir of dirs) {
    for (const name of fs.readdirSync(dir).filter((n) => /\.png$/i.test(n))) {
      const file = path.join(dir, name);
      const url = 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
      writeOpaquePng(file, SHOT_W, SHOT_H, await toRgb(canvas, url));
      console.log('  ' + path.relative(process.cwd(), file));
    }
  }
  await browser.close();
  console.log('screenshots: re-encoded as 24-bit PNG');
}

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
    const file = path.join(OUT, name + '.png');
    writeOpaquePng(file, SHOT_W, SHOT_H,
      await toRgb(canvas, 'data:image/png;base64,' + raw));
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

if (process.argv.includes('--reencode')) reencode();
else main();
