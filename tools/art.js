#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   Store and launcher artwork.

   The game draws all of its own textures in a canvas at runtime, so its icon is
   drawn the same way rather than pulled in as a binary nobody can regenerate.
   Chromium comes with Playwright, which is already a dependency, so it is the
   renderer here too: no image library, no checked-in source of truth that
   drifts from the palette in src/styles/base.css.

       node tools/art.js

   Writes the launcher mipmaps, the adaptive-icon foreground, the splash and the
   two graphics the Play Console asks for.
--------------------------------------------------------------------------- */
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
const STORE = path.join(ROOT, 'store');

const BG = '#05070c';
const ACCENT = '#39d7ff';
const WARN = '#ffc24b';

/* Densities Android asks for, as a multiple of the mdpi baseline. */
const DENSITIES = [
  ['mdpi', 1],
  ['hdpi', 1.5],
  ['xhdpi', 2],
  ['xxhdpi', 3],
  ['xxxhdpi', 4]
];

/* The mark: a hexagonal helmet silhouette inside a targeting reticle. Drawn in
   a 0..1 space so one description serves every size. */
function markSource() {
  return `
function roundedHex(c, cx, cy, r) {
  c.beginPath();
  for (var i = 0; i < 6; i++) {
    var a = Math.PI / 180 * (60 * i - 90);
    var x = cx + r * Math.cos(a);
    var y = cy + r * Math.sin(a);
    if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  c.closePath();
}

/* size: edge length in px. inset: 0..1, how much of the tile the mark uses.
   Adaptive icons crop to the middle ~72dp of 108dp, so they pass a small one. */
function drawMark(c, size, inset) {
  var cx = size / 2, cy = size / 2, r = size * inset;

  var glow = c.createRadialGradient(cx, cy, r * 0.1, cx, cy, r * 1.5);
  glow.addColorStop(0, 'rgba(57,215,255,0.30)');
  glow.addColorStop(1, 'rgba(57,215,255,0)');
  c.fillStyle = glow;
  c.fillRect(0, 0, size, size);

  /* Reticle: four ticks on the axes, deliberately not a full ring so the shape
     still reads at 48px. */
  c.strokeStyle = '${ACCENT}';
  c.lineCap = 'round';
  c.lineWidth = Math.max(2, size * 0.035);
  c.globalAlpha = 0.85;
  for (var i = 0; i < 4; i++) {
    var a = Math.PI / 2 * i;
    c.beginPath();
    c.moveTo(cx + Math.cos(a) * r * 0.86, cy + Math.sin(a) * r * 0.86);
    c.lineTo(cx + Math.cos(a) * r * 1.12, cy + Math.sin(a) * r * 1.12);
    c.stroke();
  }
  c.globalAlpha = 1;

  /* Helmet */
  var grad = c.createLinearGradient(0, cy - r, 0, cy + r);
  grad.addColorStop(0, '#123244');
  grad.addColorStop(1, '#0a1620');
  roundedHex(c, cx, cy, r * 0.82);
  c.fillStyle = grad;
  c.fill();
  c.lineWidth = Math.max(2, size * 0.03);
  c.strokeStyle = '${ACCENT}';
  c.stroke();

  /* Visor */
  c.beginPath();
  c.moveTo(cx - r * 0.46, cy - r * 0.10);
  c.lineTo(cx + r * 0.46, cy - r * 0.10);
  c.lineTo(cx + r * 0.30, cy + r * 0.34);
  c.lineTo(cx - r * 0.30, cy + r * 0.34);
  c.closePath();
  var visor = c.createLinearGradient(0, cy - r * 0.1, 0, cy + r * 0.34);
  visor.addColorStop(0, '${ACCENT}');
  visor.addColorStop(1, '${WARN}');
  c.fillStyle = visor;
  c.fill();
}
`;
}

async function render(page, width, height, body) {
  return page.evaluate(
    ({ width, height, body }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const c = canvas.getContext('2d');
      // eslint-disable-next-line no-new-func
      new Function('c', 'w', 'h', 'drawMark', body)(c, width, height, window.drawMark);
      return canvas.toDataURL('image/png');
    },
    { width, height, body }
  );
}

function write(file, dataUrl) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
  return file;
}

const TILE = `
  c.fillStyle = '${BG}';
  c.fillRect(0, 0, w, h);
  drawMark(c, w, 0.34);
`;

/* Adaptive icons are 108dp with only the middle 72dp guaranteed visible, and
   the foreground layer must be transparent so the background layer shows. */
const ADAPTIVE_FG = `
  c.clearRect(0, 0, w, h);
  drawMark(c, w, 0.24);
`;

const ROUND = `
  c.save();
  c.beginPath();
  c.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
  c.clip();
  c.fillStyle = '${BG}';
  c.fillRect(0, 0, w, h);
  drawMark(c, w, 0.32);
  c.restore();
`;

const SPLASH = `
  c.fillStyle = '${BG}';
  c.fillRect(0, 0, w, h);
  var s = Math.min(w, h);
  c.save();
  c.translate((w - s) / 2, (h - s) / 2);
  drawMark(c, s, 0.20);
  c.restore();
`;

const FEATURE = `
  var g = c.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#05070c');
  g.addColorStop(0.55, '#0b1a26');
  g.addColorStop(1, '#05070c');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);

  /* Faint arena grid, the same idea as the floor texture in game. */
  c.strokeStyle = 'rgba(57,215,255,0.10)';
  c.lineWidth = 1;
  for (var x = 0; x <= w; x += 40) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
  for (var y = 0; y <= h; y += 40) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }

  /* Play crops this graphic on some surfaces, so nothing important goes near
     the edges: the mark sits a tenth of the way in and the text ends a tenth
     from the right. */
  var markBox = h * 0.86;
  c.save();
  c.translate(w * 0.06, (h - markBox) / 2);
  drawMark(c, markBox, 0.30);
  c.restore();

  var textLeft = w * 0.06 + markBox + w * 0.03;
  var textRoom = w * 0.94 - textLeft;

  /* Pick the largest type that still fits the room left over. */
  function fit(text, weight, ideal) {
    var size = ideal;
    do {
      c.font = weight + ' ' + Math.round(size) + 'px "Segoe UI", Arial, sans-serif';
      if (c.measureText(text).width <= textRoom) break;
      size -= 1;
    } while (size > 8);
    return size;
  }

  c.textBaseline = 'middle';
  fit('OVERRUN', '700', h * 0.26);
  c.fillStyle = '#e8f6ff';
  c.fillText('OVERRUN', textLeft, h * 0.42);

  fit('SURVIVE THE WAVES \\u00b7 FRAG YOUR FRIENDS', '600', h * 0.085);
  c.fillStyle = '${ACCENT}';
  c.fillText('SURVIVE THE WAVES \\u00b7 FRAG YOUR FRIENDS', textLeft, h * 0.63);
`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<html><body></body></html>');
  await page.addScriptTag({ content: markSource() });

  const written = [];

  for (const [density, scale] of DENSITIES) {
    const launcher = Math.round(48 * scale);
    const adaptive = Math.round(108 * scale);
    written.push(write(path.join(RES, 'mipmap-' + density, 'ic_launcher.png'),
      await render(page, launcher, launcher, TILE)));
    written.push(write(path.join(RES, 'mipmap-' + density, 'ic_launcher_round.png'),
      await render(page, launcher, launcher, ROUND)));
    written.push(write(path.join(RES, 'mipmap-' + density, 'ic_launcher_foreground.png'),
      await render(page, adaptive, adaptive, ADAPTIVE_FG)));
  }

  /* Capacitor ships one splash per orientation and density; the game is
     landscape-locked but the launch theme can still be shown either way. */
  for (const [density, scale] of DENSITIES) {
    const w = Math.round(480 * scale);
    const h = Math.round(320 * scale);
    written.push(write(path.join(RES, 'drawable-land-' + density, 'splash.png'),
      await render(page, w, h, SPLASH)));
    written.push(write(path.join(RES, 'drawable-port-' + density, 'splash.png'),
      await render(page, h, w, SPLASH)));
  }
  written.push(write(path.join(RES, 'drawable', 'splash.png'), await render(page, 960, 640, SPLASH)));

  /* Play Console: a 512x512 icon and a 1024x500 feature graphic. */
  written.push(write(path.join(STORE, 'icon-512.png'), await render(page, 512, 512, TILE)));
  written.push(write(path.join(STORE, 'feature-1024x500.png'), await render(page, 1024, 500, FEATURE)));

  await browser.close();
  console.log('art: wrote ' + written.length + ' files');
  console.log('  launcher + adaptive foreground: mipmap-*');
  console.log('  splash: drawable-land-*, drawable-port-*');
  console.log('  store: store/icon-512.png, store/feature-1024x500.png');
})();
