import { expect } from '@playwright/test';
import { type ExtensionFixture, exampleDist, launchWithExtension, test } from '../harness.js';

// examples/named-layout: entrypoints found by name in src/ and a generated
// manifest. The same behaviour as vanilla-popup, so a regression in either
// layout shows up here.
const ext = test.extend<{ fx: ExtensionFixture }>({
  fx: async ({}, use) => {
    const fixture = await launchWithExtension(exampleDist('named-layout'));
    await use(fixture);
    await fixture.context.close();
  },
});

ext('popup.html (from src/popup/index.html) reaches the background', async ({ fx }) => {
  const popup = await fx.openPopup('popup.html');
  await expect(popup.locator('h1')).toHaveText('Named layout');
  const reply = await popup.evaluate(() =>
    chrome.runtime.sendMessage({ __extforge: 'msg', route: 'ping', payload: undefined }),
  );
  expect((reply as { result: { type: string } }).result.type).toBe('PONG');
});

ext('defineContentScript runs main() on matching pages', async ({ fx }) => {
  const tab = await fx.openTestPage();
  const marker = tab.locator('#extforge-named-marker');
  await expect(marker).toHaveAttribute('data-extforge', 'named-layout');
  await expect(marker).toHaveText('extforge-named-layout-loaded');
});

ext('options.html directly in src/ is built and wired to the manifest', async ({ fx }) => {
  const manifest = await (await fx.openPopup('manifest.json')).evaluate(() =>
    JSON.parse(document.body.innerText),
  );
  expect(manifest.options_page).toBe('options.html');
  const options = await fx.openPopup('options.html');
  await expect(options.locator('#title')).toHaveAttribute('data-ready', 'true');
});
