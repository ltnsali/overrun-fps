'use strict';
/* Drives the installed Android app over adb. There is no webServer here - the
   app serves itself from the APK, which is the whole point of the exercise.
   Serialized: one device, one WebView, one game loop. */
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: /android\.spec\.js/,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' }
});
