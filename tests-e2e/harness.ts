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
}

/**
 * Launch Chromium with a single MV3 extension loaded. Cleans up the user-data
 * dir on teardown.
 *
 * Caveat: `chromium.launchPersistentContext` is the only Playwright API that
 * supports loading extensions, and it doesn't support `headless: true` for
 * MV3. We use `headless: 'new'` (Chrome's --headless=new) which DOES support
 * extensions. On older runners this may fall back to headful — that's fine
 * in CI as long as a virtual display is provided (xvfb-run on Linux).
 */
export async function launchWithExtension(extensionPath: string): Promise<ExtensionFixture> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'extforge-e2e-'));

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true, // Chrome 'new' headless supports extensions since v120.
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      // Permissions the SW needs without UI prompts:
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  // Wait for the SW to register. In MV3 chromium fires `serviceworker` once
  // the extension's manifest registers a SW. May arrive before or after
  // launchPersistentContext resolves, hence the race.
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 30_000 }));

  // chrome-extension://<extensionId>/_generated_background_page.html
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
  };

  // Attach cleanup so the test runner removes the user-data dir even on failure.
  context.on('close', () => {
    rmSync(userDataDir, { recursive: true, force: true });
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
