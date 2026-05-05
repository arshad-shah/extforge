import { test as base, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

/**
 * Path to the chrome-targeted dist of an example extension. The `pnpm
 * build:fixtures` script (or per-spec setup) is responsible for ensuring this
 * directory exists; we don't trigger a build here so test runtime stays bounded.
 */
export function exampleDist(exampleName: string): string {
  return join(REPO_ROOT, 'examples', exampleName, 'dist', 'chrome');
}

export interface ExtensionFixture {
  /** Persistent context with the extension loaded. */
  context: BrowserContext;
  /** The extension's chrome-extension://… ID, e.g. `ngnpfgmjgkglfboagaobaaodepbiibci`. */
  extensionId: string;
  /** A handle to the MV3 service worker that backs the extension. */
  serviceWorker: Worker;
  /** Open the extension's popup HTML in a regular page so we can interact with it. */
  openPopup(path?: string): Promise<Page>;
  /**
   * Open a hermetic test page on a real https URL that the content-script's
   * `<all_urls>` matcher will run on. Uses Playwright's route handler so the
   * test doesn't depend on the public internet (CI runners on Cloudflare /
   * GitHub Actions have variable connectivity).
   *
   * The served HTML is intentionally minimal — just a `<div id="page-marker">`
   * the test can probe to confirm we landed on the right page.
   */
  openTestPage(url?: string): Promise<Page>;
}

/**
 * Launch Chromium with a single MV3 extension loaded. Cleans up the user-data
 * dir on teardown.
 *
 * Headless mode: per Playwright's chrome-extensions docs, `headless: true`
 * uses Chromium's old headless mode which silently ignores `--load-extension`.
 * Extensions only load when:
 *   1. headless: false + `--headless=new` arg → Chrome's new headless mode
 *      (supports extensions, runs without a display server).
 *   2. headless: false + a real display (xvfb-run on Linux CI).
 *
 * Pattern (1) is the cleanest for CI: works without xvfb, doesn't require
 * --with-deps for X11 libs. We pass --headless=new explicitly.
 *
 * Reference: https://playwright.dev/docs/chrome-extensions
 */
export async function launchWithExtension(extensionPath: string): Promise<ExtensionFixture> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'extforge-e2e-'));

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: false, // Required for `--load-extension` to take effect.
    args: [
      '--headless=new',
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-first-run',
      '--no-default-browser-check',
      // Avoid the per-launch "default browser" prompt + extension warning
      // banners that block tests on cold profiles.
      '--disable-features=DisableLoadExtensionCommandLineSwitch',
    ],
  });

  // Wait for the MV3 service worker to register. May arrive before or after
  // launchPersistentContext resolves, hence the race fallback.
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 30_000 }));

  const url = sw.url();
  const m = /^chrome-extension:\/\/([a-z0-9]+)\//.exec(url);
  if (!m) throw new Error(`Could not parse extension id from SW url: ${url}`);
  const extensionId = m[1]!;

  const fixture: ExtensionFixture = {
    context,
    extensionId,
    serviceWorker: sw,
    async openPopup(path = 'ui/popup/index.html') {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/${path}`);
      return page;
    },
    async openTestPage(url = 'https://example.com/extforge-fixture') {
      const page = await context.newPage();
      // Intercept navigations to a sentinel host so we don't hit the network.
      // We still use https://example.com/* because content scripts match
      // `<all_urls>` — a chrome-extension:// page wouldn't run user CS code.
      await page.route('https://example.com/**', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body: `<!doctype html><html><head><meta charset="utf-8"><title>extforge fixture</title></head><body><div id="page-marker">extforge-test-page</div></body></html>`,
        });
      });
      await page.goto(url);
      return page;
    },
  };

  // Best-effort cleanup. Chromium can hold file handles for a tick after
  // `close` fires, so retry once after a short delay if the first rm fails.
  context.on('close', () => {
    const tryRemove = (): boolean => {
      try { rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); return true; }
      catch { return false; }
    };
    if (!tryRemove()) setTimeout(tryRemove, 500);
  });

  return fixture;
}

/**
 * Per-test fixture. Each spec file declares which example it wants:
 *
 *     const test = base.extend<{ ext: ExtensionFixture }>({
 *       ext: async ({}, use) => {
 *         const fx = await launchWithExtension(exampleDist('vanilla-popup'));
 *         await use(fx);
 *         await fx.context.close();
 *       },
 *     });
 *
 * (We don't expose a default fixture binding because each spec targets a
 * different example.)
 */
export { base as test };
