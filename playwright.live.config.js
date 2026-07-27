'use strict';
const { defineConfig, devices } = require('@playwright/test');

/* Plays the deployed game for real: the published files, three.js from its CDN
   and the public signalling server. Separate from playwright.config.js so it can
   never be dragged into `npm test`, and so a live run does not start the local
   server or the relay - there is nothing local about it.
 *
 * It exists because the local suite structurally cannot catch a whole class of
 * bug: it serves the game from disk and drives the transport through
 * BroadcastChannel or a stubbed Peer, so real WebRTC timing and real peer id
 * races never happen there. Both deathmatch bugs reported from the deployed site
 * passed the full local suite at the time they were reported.
 *
 *   npm run test:live
 *   LIVE_URL=https://example.test/game/ npm run test:live
 */

const LIVE_URL = process.env.LIVE_URL || 'https://ltnsali.github.io/overrun-fps/';

module.exports = defineConfig({
  testDir: './tests',
  testMatch: /live\.spec\.js/,
  /* Real browsers, real network, several clients per test. */
  timeout: 240_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  /* The public signalling server is allowed the odd bad moment; two failures in a
     row is a real problem. */
  retries: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: LIVE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    viewport: { width: 1024, height: 640 },
    /* WebGL in headless Chromium needs the software rasteriser to be usable. */
    launchOptions: {
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist'
      ]
    }
  }
});
