'use strict';
/* Runs tests/package.spec.js against www/ - the folder Capacitor packages into
   the APK - on a port of its own so it never collides with `npm test`.
   A phone viewport, because that is the only shape this build ever runs in. */
const { defineConfig, devices } = require('@playwright/test');

const PORT = Number(process.env.PKG_PORT || 4176);
const BASE_URL = `http://127.0.0.1:${PORT}`;

const GL_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist'
];

module.exports = defineConfig({
  testDir: './tests',
  testMatch: /package\.spec\.js/,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    ...devices['iPhone 14 Pro Max'],
    browserName: 'chromium',
    viewport: { width: 932, height: 430 },
    deviceScaleFactor: 3,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { args: GL_ARGS }
  },
  webServer: [
    {
      command: `node tests/server.js ${PORT}`,
      env: { SERVE_ROOT: 'www' },
      url: BASE_URL,
      reuseExistingServer: false,
      stdout: 'ignore',
      stderr: 'pipe'
    }
  ]
});
