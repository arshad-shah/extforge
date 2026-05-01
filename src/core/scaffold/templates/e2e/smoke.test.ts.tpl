import { test, expect } from './fixture.js';

test('extension service worker boots', async ({ extensionId }) => {
  expect(extensionId).toMatch(/^[a-z]{32}$/);
  // Open the popup if your manifest defines one:
  // const page = await context.newPage();
  // await page.goto(`chrome-extension://${extensionId}/popup.html`);
  // await expect(page.locator('h1')).toBeVisible();
});
