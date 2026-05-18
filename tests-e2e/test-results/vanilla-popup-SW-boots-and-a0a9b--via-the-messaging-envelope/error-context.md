# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: vanilla-popup.spec.ts >> SW boots and answers ping via the messaging envelope
- Location: specs/vanilla-popup.spec.ts:12:1

# Error details

```
Error: browserType.launchPersistentContext: Executable doesn't exist at /opt/pw-browsers/chromium-1217/chrome-linux64/chrome
╔════════════════════════════════════════════════════════════╗
║ Looks like Playwright was just installed or updated.       ║
║ Please run the following command to download new browsers: ║
║                                                            ║
║     pnpm exec playwright install                           ║
║                                                            ║
║ <3 Playwright Team                                         ║
╚════════════════════════════════════════════════════════════╝
```

# Test source

```ts
  1   | import { test as base, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
  2   | import { mkdtempSync, rmSync } from 'node:fs';
  3   | import { tmpdir } from 'node:os';
  4   | import { join, resolve } from 'node:path';
  5   | import { fileURLToPath } from 'node:url';
  6   | 
  7   | const __dirname = fileURLToPath(new URL('.', import.meta.url));
  8   | const REPO_ROOT = resolve(__dirname, '..');
  9   | 
  10  | /**
  11  |  * Path to the chrome-targeted dist of an example extension. The `pnpm
  12  |  * build:fixtures` script (or per-spec setup) is responsible for ensuring this
  13  |  * directory exists; we don't trigger a build here so test runtime stays bounded.
  14  |  */
  15  | export function exampleDist(exampleName: string): string {
  16  |   return join(REPO_ROOT, 'examples', exampleName, 'dist', 'chrome');
  17  | }
  18  | 
  19  | export interface ExtensionFixture {
  20  |   /** Persistent context with the extension loaded. */
  21  |   context: BrowserContext;
  22  |   /** The extension's chrome-extension://… ID, e.g. `ngnpfgmjgkglfboagaobaaodepbiibci`. */
  23  |   extensionId: string;
  24  |   /** A handle to the MV3 service worker that backs the extension. */
  25  |   serviceWorker: Worker;
  26  |   /** Open the extension's popup HTML in a regular page so we can interact with it. */
  27  |   openPopup(path?: string): Promise<Page>;
  28  |   /**
  29  |    * Open a hermetic test page on a real https URL that the content-script's
  30  |    * `<all_urls>` matcher will run on. Uses Playwright's route handler so the
  31  |    * test doesn't depend on the public internet (CI runners on Cloudflare /
  32  |    * GitHub Actions have variable connectivity).
  33  |    *
  34  |    * The served HTML is intentionally minimal — just a `<div id="page-marker">`
  35  |    * the test can probe to confirm we landed on the right page.
  36  |    */
  37  |   openTestPage(url?: string): Promise<Page>;
  38  | }
  39  | 
  40  | /**
  41  |  * Launch Chromium with a single MV3 extension loaded. Cleans up the user-data
  42  |  * dir on teardown.
  43  |  *
  44  |  * Headless mode: per Playwright's chrome-extensions docs, `headless: true`
  45  |  * uses Chromium's old headless mode which silently ignores `--load-extension`.
  46  |  * Extensions only load when:
  47  |  *   1. headless: false + `--headless=new` arg → Chrome's new headless mode
  48  |  *      (supports extensions, runs without a display server).
  49  |  *   2. headless: false + a real display (xvfb-run on Linux CI).
  50  |  *
  51  |  * Pattern (1) is the cleanest for CI: works without xvfb, doesn't require
  52  |  * --with-deps for X11 libs. We pass --headless=new explicitly.
  53  |  *
  54  |  * Reference: https://playwright.dev/docs/chrome-extensions
  55  |  */
  56  | export async function launchWithExtension(extensionPath: string): Promise<ExtensionFixture> {
  57  |   const userDataDir = mkdtempSync(join(tmpdir(), 'extforge-e2e-'));
  58  | 
> 59  |   const context = await chromium.launchPersistentContext(userDataDir, {
      |                   ^ Error: browserType.launchPersistentContext: Executable doesn't exist at /opt/pw-browsers/chromium-1217/chrome-linux64/chrome
  60  |     channel: 'chromium',
  61  |     headless: false, // Required for `--load-extension` to take effect.
  62  |     args: [
  63  |       '--headless=new',
  64  |       `--disable-extensions-except=${extensionPath}`,
  65  |       `--load-extension=${extensionPath}`,
  66  |       '--no-first-run',
  67  |       '--no-default-browser-check',
  68  |       // Avoid the per-launch "default browser" prompt + extension warning
  69  |       // banners that block tests on cold profiles.
  70  |       '--disable-features=DisableLoadExtensionCommandLineSwitch',
  71  |     ],
  72  |   });
  73  | 
  74  |   // Wait for the MV3 service worker to register. May arrive before or after
  75  |   // launchPersistentContext resolves, hence the race fallback.
  76  |   const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 30_000 }));
  77  | 
  78  |   const url = sw.url();
  79  |   const m = /^chrome-extension:\/\/([a-z0-9]+)\//.exec(url);
  80  |   if (!m) throw new Error(`Could not parse extension id from SW url: ${url}`);
  81  |   const extensionId = m[1]!;
  82  | 
  83  |   const fixture: ExtensionFixture = {
  84  |     context,
  85  |     extensionId,
  86  |     serviceWorker: sw,
  87  |     async openPopup(path = 'ui/popup/index.html') {
  88  |       const page = await context.newPage();
  89  |       await page.goto(`chrome-extension://${extensionId}/${path}`);
  90  |       return page;
  91  |     },
  92  |     async openTestPage(url = 'https://example.com/extforge-fixture') {
  93  |       const page = await context.newPage();
  94  |       // Intercept navigations to a sentinel host so we don't hit the network.
  95  |       // We still use https://example.com/* because content scripts match
  96  |       // `<all_urls>` — a chrome-extension:// page wouldn't run user CS code.
  97  |       await page.route('https://example.com/**', (route) => {
  98  |         route.fulfill({
  99  |           status: 200,
  100 |           contentType: 'text/html; charset=utf-8',
  101 |           body: `<!doctype html><html><head><meta charset="utf-8"><title>extforge fixture</title></head><body><div id="page-marker">extforge-test-page</div></body></html>`,
  102 |         });
  103 |       });
  104 |       await page.goto(url);
  105 |       return page;
  106 |     },
  107 |   };
  108 | 
  109 |   // Best-effort cleanup. Chromium can hold file handles for a tick after
  110 |   // `close` fires, so retry once after a short delay if the first rm fails.
  111 |   context.on('close', () => {
  112 |     const tryRemove = (): boolean => {
  113 |       try { rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); return true; }
  114 |       catch { return false; }
  115 |     };
  116 |     if (!tryRemove()) setTimeout(tryRemove, 500);
  117 |   });
  118 | 
  119 |   return fixture;
  120 | }
  121 | 
  122 | /**
  123 |  * Per-test fixture. Each spec file declares which example it wants:
  124 |  *
  125 |  *     const test = base.extend<{ ext: ExtensionFixture }>({
  126 |  *       ext: async ({}, use) => {
  127 |  *         const fx = await launchWithExtension(exampleDist('vanilla-popup'));
  128 |  *         await use(fx);
  129 |  *         await fx.context.close();
  130 |  *       },
  131 |  *     });
  132 |  *
  133 |  * (We don't expose a default fixture binding because each spec targets a
  134 |  * different example.)
  135 |  */
  136 | export { base as test };
  137 | 
```