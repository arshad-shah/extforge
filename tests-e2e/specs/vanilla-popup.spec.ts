import { expect } from '@playwright/test';
import { test, launchWithExtension, exampleDist, type ExtensionFixture } from '../harness.js';

const ext = test.extend<{ fx: ExtensionFixture }>({
  fx: async ({}, use) => {
    const fixture = await launchWithExtension(exampleDist('vanilla-popup'));
    await use(fixture);
    await fixture.context.close();
  },
});

ext('SW boots and answers ping via the messaging envelope', async ({ fx }) => {
  // Drive the SW directly via chrome.runtime.sendMessage. The new messaging
  // library wraps payloads in `{ __extforge: 'msg', route, payload }` and
  // unwraps replies as `{ __extforge: 'ok', result }`.
  const reply = await fx.serviceWorker.evaluate(async () => {
    return await new Promise<unknown>((resolve) => {
      chrome.runtime.sendMessage(
        { __extforge: 'msg', route: 'ping', payload: undefined },
        (res: unknown) => resolve(res),
      );
    });
  });
  expect(reply).toMatchObject({ __extforge: 'ok' });
  const r = reply as { result: { type: string; from: string } };
  expect(r.result).toMatchObject({ type: 'PONG', from: 'background' });
});

ext('Popup renders and updates count after content script fires', async ({ fx, context }) => {
  // Open a normal page first so the content script triggers a CONTENT_LOADED
  // message that bumps the SW's counter.
  const tab = await context.newPage();
  await tab.goto('https://example.com/');

  // The marker injected by the content script should be present.
  const marker = tab.locator('#extforge-vanilla-marker');
  await expect(marker).toHaveAttribute('data-extforge', 'vanilla-popup');
  await expect(marker).toContainText('extforge-vanilla-popup-loaded');

  // Now open the popup; it should report tabsSeen >= 1.
  const popup = await fx.openPopup();
  const result = popup.locator('[data-testid=result]');
  await expect(result).toContainText('tabs seen:');
  // Race tolerance: first paint may show 'tabs seen: 0' before the storage
  // listener resolves. Wait up to 5s for any non-zero count.
  await expect.poll(async () => (await result.textContent()) ?? '', { timeout: 5_000 })
    .toMatch(/tabs seen: [1-9]/);

  // Click ping → result becomes the JSON PONG.
  await popup.locator('[data-testid=ping]').click();
  await expect(result).toContainText('"PONG"');
});

ext('manifest references built paths, not source paths', async ({ fx }) => {
  // Pull the manifest the browser actually loaded.
  const manifestText = await fx.serviceWorker.evaluate(async () => {
    const r = await fetch(chrome.runtime.getURL('manifest.json'));
    return await r.text();
  });
  const m = JSON.parse(manifestText) as {
    content_scripts?: Array<{ js?: string[] }>;
    background?: { service_worker?: string };
  };
  // The js field MUST point at content/index.js (built), not src/...
  expect(m.content_scripts?.[0]?.js?.[0]).toBe('content/index.js');
  expect(m.background?.service_worker).toBe('background/index.js');
});
