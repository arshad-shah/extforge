import { expect } from '@playwright/test';
import { test, launchWithExtension, exampleDist, type ExtensionFixture } from '../harness.js';

const ext = test.extend<{ fx: ExtensionFixture }>({
  fx: async ({}, use) => {
    const fixture = await launchWithExtension(exampleDist('react-csui'));
    await use(fixture);
    await fixture.context.close();
  },
});

ext('Auto-discovered CSUI mounts on a normal page', async ({ fx }) => {
  const tab = await fx.openTestPage();

  // The host element is in light DOM; the React tree is inside its shadow root.
  const host = tab.locator('[data-extforge-csui="extforge-csui-demo"]');
  await expect(host).toHaveAttribute('data-extforge-shadow', '');

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

ext('CSUI mount count increments per tab', async ({ fx }) => {
  // Helper: read the namespaced counter via the SW.
  const readCount = async (): Promise<number> =>
    fx.serviceWorker.evaluate(async () => {
      const cur = await chrome.storage.local.get('extforge-react-csui:csuiMounts');
      return (cur['extforge-react-csui:csuiMounts'] as number | undefined) ?? 0;
    });

  // First tab → CSUI mounts → SW counter eventually becomes ≥ 1.
  // The widget's useEffect fires async AFTER first render, so we poll for the
  // storage value to land rather than reading once.
  const tab1 = await fx.openTestPage('https://example.com/page-a');
  await expect(tab1.locator('[data-testid=csui-widget]')).toBeVisible();

  await expect.poll(readCount, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
  const after1 = await readCount();

  // Second tab → counter should bump above whatever after1 was.
  const tab2 = await fx.openTestPage('https://example.com/page-b');
  await expect(tab2.locator('[data-testid=csui-widget]')).toBeVisible();

  await expect.poll(readCount, { timeout: 5_000 }).toBeGreaterThan(after1);
});
