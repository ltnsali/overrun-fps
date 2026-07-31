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

async function render(page, width, height, body, mime) {
  return page.evaluate(
    ({ width, height, body, mime }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const c = canvas.getContext('2d');
      // eslint-disable-next-line no-new-func
      new Function('c', 'w', 'h', 'drawMark', body)(c, width, height, window.drawMark);
      return canvas.toDataURL(mime || 'image/png', 0.94);
    },
    { width, height, body, mime }
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

/* The Play Store icon. Same mark as the launcher tile, but on a lifted plate:
   Play's own icon guidance is to fill the whole square with an opaque brand
   colour, and the game's #05070c disappears into the Store's dark chrome.
   Play masks the corners at 30% radius and adds its own drop shadow, so the
   artwork stays a full square with neither. */
const STORE_ICON = `
  var plate = c.createRadialGradient(w * 0.5, h * 0.42, w * 0.04, w * 0.5, h * 0.52, w * 0.8);
  plate.addColorStop(0, '#17475f');
  plate.addColorStop(0.55, '#0c2637');
  plate.addColorStop(1, '#06121d');
  c.fillStyle = plate;
  c.fillRect(0, 0, w, h);
  drawMark(c, w, 0.34);
`;

/* The feature graphic is a storefront banner, not a second app icon. Play asks
   for the game experience rather than repeated branding, for the focal point in
   the middle with the left and right edges treated as cutoff zones, and for
   colour with some life in it - pure black and dark grey sink into the Store's
   own background. So: the arena floor in perspective, a wave closing in, and
   the wordmark centred over the top of it. */
const FEATURE = `
  var cx = w / 2;
  var horizon = h * 0.38;

  var sky = c.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#0b2036');
  sky.addColorStop(1, '#15586f');
  c.fillStyle = sky;
  c.fillRect(0, 0, w, horizon);

  var ground = c.createLinearGradient(0, horizon, 0, h);
  ground.addColorStop(0, '#12384d');
  ground.addColorStop(1, '#071722');
  c.fillStyle = ground;
  c.fillRect(0, horizon, w, h - horizon);

  var haze = c.createRadialGradient(cx, horizon, 0, cx, horizon, w * 0.45);
  haze.addColorStop(0, 'rgba(57,215,255,0.55)');
  haze.addColorStop(0.45, 'rgba(57,215,255,0.14)');
  haze.addColorStop(1, 'rgba(57,215,255,0)');
  c.fillStyle = haze;
  c.fillRect(0, 0, w, h);

  /* Arena walls, kept out at the edges where Play expects background only. */
  function wall(bx, bw, bh) {
    c.fillStyle = 'rgba(6,22,32,0.90)';
    c.fillRect(bx, horizon - bh, bw, bh);
    c.strokeStyle = 'rgba(57,215,255,0.30)';
    c.lineWidth = Math.max(1, h * 0.004);
    c.strokeRect(bx, horizon - bh, bw, bh);
  }
  wall(-w * 0.03, w * 0.15, h * 0.20);
  wall(w * 0.88, w * 0.15, h * 0.24);

  /* The wave, out at the far end of the arena. Blocky silhouettes with the
     same red eye the enemies carry in game. They stay small and above the
     horizon line so the wordmark below them is never fighting for space. */
  function hostile(hx, scale) {
    var bh = h * 0.24 * scale;
    var bw = bh * 0.44;
    var y = horizon + h * 0.012 * scale;
    c.save();
    c.globalAlpha = 0.45;
    c.fillStyle = '#03101a';
    c.beginPath();
    c.ellipse(hx, y, bw * 1.05, bh * 0.05, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.fillStyle = 'rgba(3,12,19,0.96)';
    c.fillRect(hx - bw * 0.78, y - bh * 0.74, bw * 0.28, bh * 0.44);
    c.fillRect(hx + bw * 0.50, y - bh * 0.74, bw * 0.28, bh * 0.44);
    c.fillRect(hx - bw / 2, y - bh, bw, bh);
    c.fillRect(hx - bw * 0.34, y - bh * 1.30, bw * 0.68, bh * 0.32);
    c.save();
    c.shadowColor = '#ff3322';
    c.shadowBlur = bh * 0.40;
    c.fillStyle = '#ff3b2a';
    c.fillRect(hx - bw * 0.22, y - bh * 1.19, bw * 0.44, bh * 0.08);
    c.restore();
  }
  hostile(w * 0.115, 1.00);
  hostile(w * 0.215, 0.74);
  hostile(w * 0.305, 0.52);
  hostile(w * 0.385, 0.36);
  hostile(w * 0.885, 0.94);
  hostile(w * 0.790, 0.68);
  hostile(w * 0.705, 0.47);
  hostile(w * 0.625, 0.33);

  /* Arena floor: verticals converging on the vanishing point, horizontals
     spaced by a square law so the grid reads as distance. Kept coarse - Play
     warns that fine detail is lost at the sizes this is shown at. */
  c.strokeStyle = '${ACCENT}';
  c.lineWidth = Math.max(1, h * 0.005);
  for (var i = -13; i <= 13; i++) {
    c.globalAlpha = 0.32 - Math.abs(i) * 0.017;
    c.beginPath();
    c.moveTo(cx + i * (w * 0.011), horizon);
    c.lineTo(cx + i * (w * 0.26), h);
    c.stroke();
  }
  for (var k = 1; k <= 8; k++) {
    var t = k / 8;
    c.globalAlpha = 0.09 + 0.26 * t;
    var gy = horizon + (h - horizon) * t * t;
    c.beginPath();
    c.moveTo(0, gy);
    c.lineTo(w, gy);
    c.stroke();
  }
  c.globalAlpha = 1;

  /* The near floor is dropped back so the type on top of it stays legible. */
  var scrim = c.createLinearGradient(0, horizon, 0, h);
  scrim.addColorStop(0, 'rgba(5,16,25,0)');
  scrim.addColorStop(0.45, 'rgba(5,16,25,0.55)');
  scrim.addColorStop(1, 'rgba(5,16,25,0.72)');
  c.fillStyle = scrim;
  c.fillRect(0, horizon, w, h - horizon);

  /* Type, centred and kept well inside the cutoff zones. */
  var room = w * 0.58;
  function fit(text, weight, ideal) {
    var size = ideal;
    do {
      c.font = weight + ' ' + Math.round(size) + 'px "Segoe UI", Arial, sans-serif';
      if (c.measureText(text).width <= room) break;
      size -= 1;
    } while (size > 8);
  }

  c.textAlign = 'center';
  c.textBaseline = 'middle';

  fit('OVERRUN', '700', h * 0.26);
  c.save();
  c.shadowColor = 'rgba(4,14,22,0.9)';
  c.shadowBlur = h * 0.10;
  c.fillStyle = '#eaf8ff';
  c.fillText('OVERRUN', cx, h * 0.63);
  c.restore();

  fit('SURVIVE THE WAVES \\u00b7 FRAG YOUR FRIENDS', '600', h * 0.078);
  c.save();
  c.shadowColor = 'rgba(4,14,22,0.9)';
  c.shadowBlur = h * 0.07;
  c.fillStyle = '${ACCENT}';
  c.fillText('SURVIVE THE WAVES \\u00b7 FRAG YOUR FRIENDS', cx, h * 0.85);
  c.restore();

  /* Vignette, so the edges fall away instead of ending on a hard crop. */
  var vig = c.createRadialGradient(cx, h * 0.5, w * 0.22, cx, h * 0.5, w * 0.64);
  vig.addColorStop(0, 'rgba(4,12,20,0)');
  vig.addColorStop(1, 'rgba(4,12,20,0.55)');
  c.fillStyle = vig;
  c.fillRect(0, 0, w, h);
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

  /* Play Console. The icon must be a 32-bit PNG *with* alpha; the feature
     graphic must have *no* alpha at all, and a canvas PNG always carries an
     alpha channel - so that one is written as JPEG, which Play accepts and
     which cannot have one. */
  written.push(write(path.join(STORE, 'icon-512.png'), await render(page, 512, 512, STORE_ICON)));
  written.push(
    write(
      path.join(STORE, 'feature-1024x500.jpg'),
      await render(page, 1024, 500, FEATURE, 'image/jpeg')
    )
  );
  fs.rmSync(path.join(STORE, 'feature-1024x500.png'), { force: true });

  await browser.close();
  console.log('art: wrote ' + written.length + ' files');
  console.log('  launcher + adaptive foreground: mipmap-*');
  console.log('  splash: drawable-land-*, drawable-port-*');
  console.log('  store: store/icon-512.png, store/feature-1024x500.jpg');
})();
