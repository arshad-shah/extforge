import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  // MV3 extensions need a persistent Chromium context, which is single-threaded
  // per worker. Run serially so the SW state isn't shared between specs.
  fullyParallel: false,
  workers: 1,
  // CI flakes happen — service-worker startup timing varies, file watchers
  // race with the test. One retry on CI keeps spurious red builds out of
  // the contributor's way; locally we still fail fast so flakiness is
  // visible immediately.
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    trace: process.env['CI'] ? 'retain-on-failure' : 'off',
    video: process.env['CI'] ? 'retain-on-failure' : 'off',
    actionTimeout: 10_000,
  },
});
