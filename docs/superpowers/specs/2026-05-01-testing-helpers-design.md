# Design: Testing Helpers

**Date:** 2026-05-01
**Status:** Outline — to be deepened before implementation
**Repo:** `Documents/practice/extforge`
**Track:** 4 of 5

## Problem

Most extension authors don't write tests because the tooling is hostile: `chrome.*` APIs aren't available in Node, mocking them by hand is tedious, and end-to-end tests need a real browser with `--load-extension`. ExtForge can flatten this hill by shipping typed fakes for the chrome APIs people actually use, a vitest preset that wires them up, and a Playwright recipe that loads a built extension.

This track raises the bar for a category of tools that mostly ignore it.

## Goals

- A subpath export `extforge/testing` providing typed fakes for `chrome.runtime`, `chrome.storage`, `chrome.tabs` (messaging surface), `chrome.action`, `chrome.scripting`.
- A vitest preset that registers the fakes globally and resets them between tests.
- A Playwright recipe and reusable fixture that builds the extension once and loads it with `--load-extension=dist/chrome`.
- Example tests in the scaffolded starter so new projects begin life with passing tests.

## Non-goals

- A complete chrome API mock. We cover the surface 80% of extensions use; everything else throws a clear "not implemented in @extforge/testing" error.
- A new test runner. Vitest is the chosen runner; Playwright is the chosen E2E tool.
- Browser compat fakes for Firefox `browser.*`. The fakes only model the `chrome.*` namespace; cross-browser behavior is tested via the Playwright recipe against Firefox.

## Backwards compatibility

- New subpath export. Existing imports unaffected.
- The vitest preset is opt-in; nothing auto-registers.

## Approach (sketch)

```
packages/testing/
  src/
    index.ts            # public exports
    chrome/
      runtime.ts        # onMessage / sendMessage / connect
      storage.ts        # local + sync, with quota simulation
      tabs.ts
      scripting.ts
      action.ts
    vitest-preset.ts    # setupFiles entry
  README.md
```

Fakes are class-based, deterministic, and have a `reset()` that the vitest preset calls in `beforeEach`. Messaging fakes record calls (Jest-style `mock.calls`) for assertions.

Playwright recipe (in `examples/`):
- A reusable fixture spins up `chromium.launchPersistentContext` with `--disable-extensions-except` and `--load-extension`.
- A helper waits for the service worker to register.

## Key decisions to make in the plan

- Should fakes support a "real Chrome" mode (proxy to live API in Playwright)? **Lean:** no, that's what E2E is for. Unit fakes stay pure.
- Where do scaffolded example tests live — co-located with the entry point or under `tests/`? **Lean:** co-located, since users discover them while editing.

## Open questions

- Do we ship `extforge/testing` as part of the main package or as `@extforge/testing`? **Lean:** subpath export of the main package for v1; promote to a separate package only if it grows.
- How to handle async settle for messaging — flush microtasks vs. fake timers? Probably both, with a `flush()` helper.

## Success criteria

- A scaffolded project's default tests pass on the first run.
- Mocking `chrome.storage.local.set` and asserting reads from another module works in under 5 lines.
- An E2E test that opens a popup, clicks a button, and asserts on `chrome.storage` state runs in under 10 seconds locally.
- Documented in the docs site (track 5) under "Testing".
