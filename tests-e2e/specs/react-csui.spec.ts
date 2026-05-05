import { expect } from '@playwright/test';
import { test, launchWithExtension, exampleDist, type ExtensionFixture } from '../harness.js';

const ext = test.extend<{ fx: ExtensionFixture }>({
  fx: async ({}, use) => {
    const fixture = await launchWithExtension(exampleDist('react-csui'));
    await use(fixture);
    await fixture.context.close();
  },
});

ext('Shadow-DOM widget mounts on a normal page', async ({ fx, context }) => {
  const tab = await context.newPage();
  await tab.goto('https://example.com/');

  // The host element is in light DOM; the React tree is inside its shadow root.
  const host = tab.locator('#extforge-csui-host');
  await expect(host).toHaveAttribute('data-extforge', 'csui');
  await expect(host).toHaveAttribute('data-extforge-shadow', '');

  // Pierce the shadow boundary via Playwright's CSS engine (it goes through
  // shadow roots by default for ID/attribute matchers).
  const widget = tab.locator('[data-testid=csui-widget]');
  await expect(widget).toBeVisible();
  await expect(widget.locator('[data-testid=csui-count]')).toContainText('Mounts seen:');
});

ext('Popup ping → background → response round-trip', async ({ fx }) => {
  const popup = await fx.openPopup();
  await expect(popup.locator('[data-testid=title]')).toHaveText('ExtForge React CSUI');

  await popup.locator('[data-testid=ping]').click();
  await expect(popup.locator('[data-testid=pong]')).toContainText('"type":"PONG"');
});

ext('CSUI mount count increments per tab', async ({ fx, context }) => {
  // First tab → CSUI mounts → SW counter becomes 1 (or first non-zero).
  const tab1 = await context.newPage();
  await tab1.goto('https://example.com/');
  await expect(tab1.locator('[data-testid=csui-widget]')).toBeVisible();

  // Read count via SW.
  const after1 = await fx.serviceWorker.evaluate(async () => {
    const cur = await chrome.storage.local.get('csuiMounts');
    return cur['csuiMounts'] as number | undefined;
  });
  expect(after1 ?? 0).toBeGreaterThanOrEqual(1);

  // Second tab → counter should bump.
  const tab2 = await context.newPage();
  await tab2.goto('https://example.org/');
  await expect(tab2.locator('[data-testid=csui-widget]')).toBeVisible();

  await expect.poll(async () => {
    return await fx.serviceWorker.evaluate(async () => {
      const cur = await chrome.storage.local.get('csuiMounts');
      return (cur['csuiMounts'] as number | undefined) ?? 0;
    });
  }, { timeout: 5_000 }).toBeGreaterThan(after1 ?? 0);
});
