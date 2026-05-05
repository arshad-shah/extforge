import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  // MV3 extensions need a persistent Chromium context, which is single-threaded
  // per worker. Run serially so the SW state isn't shared between specs.
  fullyParallel: false,
  workers: 1,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    trace: process.env['CI'] ? 'retain-on-failure' : 'off',
    video: process.env['CI'] ? 'retain-on-failure' : 'off',
    actionTimeout: 10_000,
  },
});
