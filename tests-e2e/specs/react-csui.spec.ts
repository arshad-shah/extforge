import { expect } from '@playwright/test';
import { test, launchWithExtension, exampleDist, type ExtensionFixture } from '../harness.js';

const ext = test.extend<{ fx: ExtensionFixture }>({
  fx: async ({}, use) => {
    const fixture = await launchWithExtension(exampleDist('react-csui'));
    await use(fixture);
    await fixture.context.close();
  },
});

ext('Auto-discovered CSUI mounts on a normal page', async ({ fx, context }) => {
  const tab = await context.newPage();
  await tab.goto('https://example.com/');

  // The host element is in light DOM; the React tree is inside its shadow root.
  // The CSUI runtime tags hosts with `data-extforge-csui="<id>"`.
  const host = tab.locator('[data-extforge-csui="extforge-csui-demo"]');
  await expect(host).toHaveAttribute('data-extforge-shadow', '');

  // Playwright's selector engine pierces shadow roots for ID/attribute matchers.
  const widget = tab.locator('[data-testid=csui-widget]');
  await expect(widget).toBeVisible();
  await expect(widget.locator('[data-testid=csui-count]')).toContainText('Mounts seen:');
});

ext('Popup ping → background → response round-trip', async ({ fx }) => {
  const popup = await fx.openPopup();
  await expect(popup.locator('[data-testid=title]')).toHaveText('ExtForge React CSUI');

  await popup.locator('[data-testid=ping]').click();
  await expect(popup.locator('[data-testid=pong]')).toContainText('PONG');
});

ext('CSUI mount count increments per tab', async ({ fx, context }) => {
  // First tab → CSUI mounts → SW counter becomes 1 (or first non-zero).
  const tab1 = await context.newPage();
  await tab1.goto('https://example.com/');
  await expect(tab1.locator('[data-testid=csui-widget]')).toBeVisible();

  // Read count via SW (extforge/storage namespace prefix is "extforge-react-csui").
  const after1 = await fx.serviceWorker.evaluate(async () => {
    const cur = await chrome.storage.local.get('extforge-react-csui:csuiMounts');
    return cur['extforge-react-csui:csuiMounts'] as number | undefined;
  });
  expect(after1 ?? 0).toBeGreaterThanOrEqual(1);

  // Second tab → counter should bump.
  const tab2 = await context.newPage();
  await tab2.goto('https://example.org/');
  await expect(tab2.locator('[data-testid=csui-widget]')).toBeVisible();

  await expect.poll(async () => {
    return await fx.serviceWorker.evaluate(async () => {
      const cur = await chrome.storage.local.get('extforge-react-csui:csuiMounts');
      return (cur['extforge-react-csui:csuiMounts'] as number | undefined) ?? 0;
    });
  }, { timeout: 5_000 }).toBeGreaterThan(after1 ?? 0);
});
