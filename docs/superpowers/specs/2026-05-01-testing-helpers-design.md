# Design: Testing Helpers

**Date:** 2026-05-01 (deepened from outline)
**Status:** Approved for implementation planning
**Repo:** `Documents/practice/extforge`
**Track:** 4 of 5

## Problem

Most extension authors don't write tests because the tooling is hostile: `chrome.*` APIs aren't available in Node, hand-rolled mocks are tedious, and end-to-end tests need a real browser with `--load-extension`. ExtForge already scaffolds a `vitest.config.ts.tpl` and a placeholder `extension.test.ts.tpl` — but the placeholder doesn't exercise any extension surface, so users delete it.

Track 4 ships:

1. A subpath export `extforge/testing` providing typed fakes for the chrome APIs the scaffolded templates already use (`chrome.runtime`, `chrome.storage`, `chrome.tabs`, `chrome.action`, `chrome.scripting`).
2. A vitest preset (`extforge/testing/vitest`) that registers the fakes globally and resets them between tests.
3. A Playwright recipe + reusable fixture for E2E tests against a built extension.
4. Real example tests in the scaffolded starter so new projects begin life with passing, *meaningful* tests.

## Goals

- Subpath exports: `extforge/testing` (fakes + utilities) and `extforge/testing/vitest` (preset).
- Typed fakes for `chrome.runtime`, `chrome.storage`, `chrome.tabs`, `chrome.action`, `chrome.scripting` covering the surface the scaffold uses (and a bit beyond).
- Vitest preset auto-registers fakes on `globalThis.chrome` and resets them in `beforeEach`. No global pollution outside vitest.
- Playwright recipe with a reusable fixture that builds the extension once per test run and loads it with `--load-extension=dist/chrome`.
- Scaffolded `extension.test.ts.tpl` is replaced with two real, failing-then-passing tests against the fakes.
- All fakes have `.reset()` plus per-method assertions (`mock.calls`-style: number of calls, last args).

## Non-goals

- A complete chrome API mock. We cover the 80% surface; everything else throws a clear `not yet implemented in extforge/testing` error so users know to fall back to manual mocks rather than getting silent undefined.
- A new test runner. Vitest is the chosen runner; Playwright is the chosen E2E tool.
- `browser.*` (Firefox WebExtensions) namespace fakes. Firefox-side parity is tested via the Playwright recipe against Firefox; unit-level fakes are `chrome.*` only.
- Network mocking. `chrome.webRequest`, `chrome.declarativeNetRequest` are not faked in v1.
- Service worker / DOM environment emulation. Vitest's `environment: 'node'` (the default) is sufficient for the surface we model.

## Backwards compatibility

- New subpath exports. Existing imports unaffected.
- The vitest preset is **opt-in** via `setupFiles`. Nothing auto-registers without the preset being loaded.
- The scaffold update (replacing the trivial test template) only affects newly-created projects via `extforge init`. Existing scaffolded projects are unchanged.

---

## API surface

### Public exports — `extforge/testing`

```ts
import {
  // Top-level: registers all fakes on globalThis.chrome
  installChromeFakes,
  resetChromeFakes,

  // Per-namespace fakes (for granular tests)
  createRuntimeFake,
  createStorageFake,
  createTabsFake,
  createActionFake,
  createScriptingFake,

  // Types
  type RuntimeFake,
  type StorageFake,
  type TabsFake,
  type ActionFake,
  type ScriptingFake,
  type ChromeFakes,
} from 'extforge/testing';
```

### Public exports — `extforge/testing/vitest`

```ts
// Used as a vitest setupFile.
// import 'extforge/testing/vitest'; // registers globally + auto-reset
```

### Per-namespace shapes (representative)

```ts
interface RuntimeFake {
  // The faked chrome.runtime object plugins/code under test consume.
  readonly chrome: {
    onInstalled: { addListener(fn: (details: { reason: string }) => void): void; removeListener(fn: any): void };
    onStartup:   { addListener(fn: () => void): void; removeListener(fn: any): void };
    onMessage:   { addListener(fn: (message: any, sender: any, sendResponse: (r: any) => void) => boolean | void): void; removeListener(fn: any): void };
    sendMessage(message: any): Promise<any>;
    id: string;
    reload(): void;
  };

  // Test-side controls.
  fireOnInstalled(details?: { reason: string }): void;
  fireOnStartup(): void;
  fireOnMessage(message: any, sender?: any): Promise<any>;

  // Spies.
  readonly sendMessage: { calls: unknown[][] };
  readonly reload:      { calls: unknown[][] };

  reset(): void;
}

interface StorageFake {
  readonly chrome: {
    local: StorageAreaFake;
    sync:  StorageAreaFake;
    session: StorageAreaFake;
  };
  reset(): void;
}

interface StorageAreaFake {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  clear(): Promise<void>;
  /** Inspect: synchronous read of the underlying state. */
  __state(): Record<string, unknown>;
  /** Inspect: spies. */
  readonly get: ((...args: any[]) => any) & { calls: unknown[][] };
  readonly set: ((...args: any[]) => any) & { calls: unknown[][] };
}

interface TabsFake {
  readonly chrome: {
    query(info: { url?: string; active?: boolean }): Promise<Array<{ id: number; url: string; active: boolean }>>;
    sendMessage(tabId: number, message: any): Promise<any>;
    create(props: { url: string }): Promise<{ id: number; url: string }>;
    reload(tabId: number): Promise<void>;
  };
  /** Test-side: seed tabs into the fake. */
  __seed(tabs: Array<{ id: number; url: string; active?: boolean }>): void;
  reset(): void;
}

// ActionFake: setBadgeText, getBadgeText, setIcon (no-op), enable/disable
// ScriptingFake: executeScript (records calls + returns user-provided fakeResult)
```

### Top-level helpers

```ts
function installChromeFakes(): ChromeFakes {
  const fakes = createChromeFakes();
  (globalThis as any).chrome = fakes.chrome;
  return fakes;
}

function resetChromeFakes(fakes?: ChromeFakes): void {
  // resets all namespaces. If `fakes` provided, resets that bag; otherwise looks up globalThis.
}

interface ChromeFakes {
  runtime:   RuntimeFake;
  storage:   StorageFake;
  tabs:      TabsFake;
  action:    ActionFake;
  scripting: ScriptingFake;
  reset(): void;
  /** The composed object that gets assigned to globalThis.chrome. */
  readonly chrome: typeof chrome;
}
```

### Vitest preset

```ts
// src/core/testing/vitest.ts (the file behind `extforge/testing/vitest`)
import { afterEach, beforeEach } from 'vitest';
import { installChromeFakes, resetChromeFakes } from './index.js';

const fakes = installChromeFakes();

beforeEach(() => { resetChromeFakes(fakes); });
afterEach(() => { /* nothing — keep fakes installed */ });

export { fakes };
```

User wires it via `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    setupFiles: ['extforge/testing/vitest'],
  },
});
```

This is what the updated `vitest.config.ts.tpl` will scaffold.

### Playwright recipe

A short markdown doc (in `docs-site/` next track) plus a reusable fixture file copied into the scaffolded project at `tests/e2e/fixture.ts`:

```ts
import { test as base, chromium, type BrowserContext } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'pathe';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXT_PATH = resolve(__dirname, '../../dist/chrome');

export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  context: async ({}, use) => {
    const ctx = await chromium.launchPersistentContext('', {
      headless: false,
      args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
    });
    await use(ctx);
    await ctx.close();
  },
  extensionId: async ({ context }, use) => {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');
    const id = sw.url().split('/')[2]!;
    await use(id);
  },
});

export const expect = test.expect;
```

This file ships in the scaffold (gated on `--with-e2e` flag, or always — choose later).

---

## File layout (new code)

```
src/core/testing/
  index.ts                     # public re-exports
  install.ts                   # installChromeFakes / resetChromeFakes / ChromeFakes type
  vitest.ts                    # `extforge/testing/vitest` setupFile
  fakes/
    runtime.ts
    storage.ts
    tabs.ts
    action.ts
    scripting.ts
  internal/
    spy.ts                     # tiny spy() helper used by the fakes
src/core/scaffold/templates/
  vitest.config.ts.tpl         # MODIFIED — adds setupFiles: ['extforge/testing/vitest']
  extension.test.ts.tpl        # REPLACED — real tests against the fakes
  e2e/                         # NEW — Playwright fixture + a sample test
    fixture.ts.tpl
    smoke.test.ts.tpl
tests/
  testing-runtime.test.ts
  testing-storage.test.ts
  testing-tabs.test.ts
  testing-action.test.ts
  testing-scripting.test.ts
  testing-install.test.ts      # the bag installer + reset behavior
```

Plus:
- `package.json` — add `./testing` and `./testing/vitest` subpath exports.
- `tsup.config.ts` — emit `core/testing/index` and `core/testing/vitest` as separate ESM/DTS.

---

## Testing the testing helpers

Each fake gets:
- A pass test for the happy path.
- A test that listeners fire when test-side triggers are invoked (for runtime/onMessage etc.).
- A test that `reset()` actually clears state and call records.
- A test for the "not yet implemented" path: calling an unmodeled method (e.g., `chrome.tabs.captureVisibleTab`) throws a clear ExtForgeError-flavored Error pointing to docs.

The vitest preset gets a small integration test in this repo: a fixture vitest config wires the preset, and a tiny test file uses `chrome.storage.local.set/get` and asserts behavior. Verifies the global registration + per-test reset both work.

---

## Key decisions

- **`extforge/testing` lives inside the main package.** No separate `@extforge/testing` package in v1 (same scoping as `extforge/plugins`). Promote later only if testing helpers grow large.
- **Fakes are deterministic and synchronous-ish.** They return `Promise.resolve(...)` to match the real API shape, but the underlying state mutates synchronously. No fake timers, no microtask flushing magic. If a test needs to await event listeners, it `await`s the trigger function.
- **Spies are bespoke, not Jest/Sinon.** A 30-line `spy()` helper records calls and lets you replace return values. Avoids pulling in jest-mock.
- **`chrome` global is set on `globalThis`** when the preset runs. Code under test that references `chrome.runtime` (no import) sees the fakes. Matches how the real API is exposed.
- **Unmodeled calls throw.** No silent undefined. Throw `Error("chrome.${ns}.${method} is not modeled by extforge/testing v1; supply your own mock")`.
- **Reset between tests is mandatory by default.** The preset's `beforeEach` resets state. Users who want to opt out can wire their own preset.

## Open questions

- **Should `installChromeFakes()` mirror the existing real `chrome` if it's already defined?** Probably not — assume Node, `chrome` is undefined, we set it. If it is defined (rare), throw with a clear message.
- **Playwright recipe — ship as scaffold template or as a copy-paste docs snippet?** Scaffold template is friendlier; users get it for free. Add a `--with-e2e` flag to `extforge init` to opt in (default on for new projects? off?). **Recommendation:** ship template, default off, prompt the user during `init`.
- **JSDoc on every fake method explaining "this matches the chrome API behavior except..." gaps?** Yes — these are user-facing docs.

## Success criteria

- A scaffolded project's default unit tests pass on the first run (no `chrome.*` "is not defined" errors).
- A test that exercises `chrome.storage.local.set` and reads it back from another module passes in under 10 lines of test code.
- An E2E test that opens a popup, clicks a button, and asserts `chrome.storage` state runs locally in under 10 seconds.
- Calling an unmodeled `chrome.*` method throws a clear "not modeled" error pointing at the docs.
- All existing tests still pass; new tests cover every fake and the install/reset path.
- Docs URL `extforge.arshadshah.com/testing` is referenced in error messages (404s gracefully today; lights up with Track 5).
