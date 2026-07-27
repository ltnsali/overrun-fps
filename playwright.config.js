'use strict';
const { defineConfig, devices } = require('@playwright/test');

const PORT = Number(process.env.PORT || 4173);
const RELAY_PORT = Number(process.env.RELAY_PORT || 8788);
const BASE_URL = `http://127.0.0.1:${PORT}`;

/* Device projects cover layout and input. These specs are device-independent, so
   they run once instead of four times. Multiplayer also needs two browser
   contexts per test, so it gets a project of its own. */
const LOGIC_SPECS = /(multiplayer|combat)\.spec\.js/;
const MULTIPLAYER_SPEC = /multiplayer\.spec\.js/;

/* WebGL in headless Chromium needs the software rasteriser to be usable. */
const GL_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist'
];

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  /* Every test runs a WebGL game; too many at once starves the software
     rasteriser and makes timing-sensitive tests flaky. */
  workers: process.env.CI ? 1 : 4,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { args: GL_ARGS }
  },
  projects: [
    {
      name: 'phone-portrait',
      testIgnore: LOGIC_SPECS,
      use: { ...devices['Pixel 7'], viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 }
    },
    {
      name: 'phone-landscape',
      testIgnore: LOGIC_SPECS,
      use: {
        ...devices['iPhone 14 Pro Max'],
        browserName: 'chromium',
        viewport: { width: 932, height: 430 },
        deviceScaleFactor: 3
      }
    },
    {
      name: 'tablet',
      testIgnore: LOGIC_SPECS,
      use: { ...devices['iPad (gen 7) landscape'], browserName: 'chromium' }
    },
    {
      name: 'desktop',
      testIgnore: MULTIPLAYER_SPEC,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } }
    },
    {
      name: 'multiplayer',
      testMatch: MULTIPLAYER_SPEC,
      /* Each test drives two full WebGL clients - running them at the same time
         starves the software rasteriser, so this project goes one at a time. */
      fullyParallel: false,
      timeout: 120_000,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 640 } }
    }
  ],

  webServer: [
    {
      command: `node tests/server.js ${PORT}`,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      stdout: 'ignore',
      stderr: 'pipe'
    },
    {
      command: `node server/relay.js ${RELAY_PORT}`,
      url: `http://127.0.0.1:${RELAY_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      stdout: 'ignore',
      stderr: 'pipe'
    }
  ]
});
