# ExtForge Examples

Reference extensions used both as user-facing starting points and as the
fixtures driven by `tests-e2e/`.

| Example | What it exercises |
|---|---|
| [`vanilla-popup`](./vanilla-popup) | Popup + content script + background SW in plain TypeScript. Tests `chrome.storage`, content-script DOM mutation, and SW message round-trip. |
| [`react-csui`](./react-csui) | React popup + Shadow-DOM-mounted React widget injected by a content script. Tests cross-context messaging, Shadow DOM, and React rendering. |
| [`env-config`](./env-config) | `.env` loading via `extforge/env`. Shows `EXTFORGE_PUBLIC_*` inlining, the public/private key split, and `import.meta.env.MODE`. |

## Build them all

```bash
pnpm examples:build
# or just one:
pnpm -C examples/vanilla-popup build
```

## Run the e2e harness against them

```bash
pnpm test:e2e:install   # one-time: download Playwright's Chromium
pnpm test:e2e           # builds fixtures, then runs Playwright specs
```

The e2e harness in `tests-e2e/` loads the built `dist/chrome/` output into a
real Chromium instance via `chromium.launchPersistentContext`, captures the
extension's MV3 service worker, and validates popup, content script,
background, and HMR end-to-end.
