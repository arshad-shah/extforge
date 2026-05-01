# Changelog

All notable changes to ExtForge are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `ExtForgeError` class with codes (`EXT_*` registry) and docs URLs; CLI now renders code, file:line:column, hint, and docs link.
- Zod-based config validation with pretty error formatting and field-level suggestions.
- `extforge doctor` command with 9 checks: node version, config validity, icons present, HMR port free, dist gitignored, permissions known, browser overrides match, recommended scripts present, cross-browser API compat.
- Cross-browser API compatibility check using MDN browser-compat-data: warns by default during `extforge build`/`extforge dev`, fails the build with `--strict`. Per-line opt-out via `// extforge-ignore-compat: <reason>`.
- `--quiet` and `--json` flags on `dev`, `build`, `validate`, `doctor`.
- `extforge upgrade` stub command (codemods land in track 3).
- `Logger` gains `group`, `step`, `summary`, and a JSON transport (`jsonTransport`).

### Changed
- esbuild build failures are now wrapped as `ExtForgeError(EXT_BUILD_FAILED)` with file/line/column.
- `buildAll` ends with a grouped summary showing each browser's output dir, file count, and total size.

### HMR
- Versioned websocket protocol envelope (`v: 2`); legacy clients tolerated, future versions ignored with one warning.
- Targeted content-script reloads — server emits `scriptIds` and the in-page client filters via `__EXTFORGE_SCRIPT_ID__`. Tabs that don't host the changed script are not touched.
- Infinite reconnect with capped exponential backoff (250ms → 8s) and a visible reconnect badge in matched pages.
- One-line reload log on both server and client: `[hmr] reloaded <files> — <reason> — <ms> (<n> client(s))`.
- `extforge dev --verbose` prints per-change file detail.
- `extforge dev --once` runs a single dev build then exits (CI smoke).
- `HMR_STRATEGY` constant exposes the per-entry-point reload matrix as the single source of truth.
- Pure HMR client logic extracted to `src/core/hmr/client-logic.ts` with full unit-test coverage.

### Backwards compatibility (HMR)
No breaking changes. Old projects rebuilt against this version automatically inherit the new client. Old clients connecting to a new server still receive the same legacy message shapes (the new fields are optional). No `extforge.config.ts` changes required.

### Plugins
- New plugin API: `setup(ctx)` with hooks `onConfigResolved`, `onManifestTransform`, `onBuildStart`, `onBuildEntry`, `onBuildEnd`, `onDevReload`. Plugins are versioned via `apiVersion: 1`.
- Subpath export: `import { presetReact, type ExtForgePluginV1 } from 'extforge/plugins'`.
- First-party `presetReact()` ships built-in. Auto-injected when `framework: 'react'` is set; users may also pass it explicitly to override `jsxImportSource` or `jsxRuntime`.
- Plugin throws now produce `ExtForgeError(EXT_PLUGIN_FAILED)` carrying the plugin name and hook.
- Legacy thin plugin shape (`{ name, setup(config), buildStart, buildEnd }`) keeps working unchanged via a compatibility shim.

### Removed (internal)
- Hardcoded `jsxImportSource: 'react'` and `jsx: 'automatic'` in the builder. React JSX is now supplied by `presetReact()`.

### Backwards compatibility (Plugins)
No breaking changes. Existing configs continue to work; legacy plugins continue to load via a shim.

### Testing
- New subpath exports: `extforge/testing` (typed `chrome.*` fakes for `runtime`, `storage`, `tabs`, `action`, `scripting`) and `extforge/testing/vitest` (vitest setup-file preset that auto-installs fakes and resets them between tests).
- `installChromeFakes()` / `resetChromeFakes()` for granular control.
- Unmodeled `chrome.*` calls throw a clear "not modeled" error pointing at the docs.
- Scaffolded projects now ship a `vitest.config.ts` wired to the preset and an `extension.test.ts` with real, passing tests.
- New scaffold templates for Playwright E2E: `tests/e2e/fixture.ts` and `tests/e2e/smoke.test.ts`.

### Backwards compatibility (Testing)
No breaking changes. Existing scaffolded projects are unaffected; the new template applies only to projects created via `extforge init` from this version onward.

### Docs
- New documentation site at https://extforge.arshadshah.com (Astro Starlight on Cloudflare Pages).
- Auto-generated reference from code: configuration schema, error codes, plugin API. Drift-checked in CI.
- Hand-written guides: getting started, configuration, HMR, cross-browser, plugins, testing, deployment.
- README slimmed to a one-screen pitch. Old anchor IDs preserved (#features, #installation, #quick-start, #docs).
- Brand guidelines documented at /brand/guidelines.

### Backwards compatibility (Docs)
No breaking changes. Old README anchors still resolve.

### Backwards compatibility
No breaking changes. The Zod schema uses `.passthrough()` so unknown config keys still work today; they will become warnings in v0.4.0 and errors thereafter.

## [0.2.0] — 2026-04-30

### Added
- Centralized CLI error handler (`withErrorHandler`) with friendly messages, hint mapping for common failure modes (`EADDRINUSE`, missing templates, missing config, missing esbuild peer, permission errors), and `EXTFORGE_DEBUG=1` for full stack traces.
- Process-level guards: `unhandledRejection` and `uncaughtException` are now caught and formatted instead of dumping raw stack traces. `SIGINT`/`SIGTERM` exit cleanly.
- Scaffolded React projects now ship with an `ErrorBoundary` component (`src/components/ErrorBoundary.tsx`) and the popup template wraps its root render in it. Added `window.error` and `unhandledrejection` listeners in the popup entry.
- New scaffold template: `error-boundary.tsx.tpl`.

## [0.1.0] — 2026-04-30

Initial public release.

### Added
- `extforge init` — interactive project scaffolder (framework, CSS, browsers, entry points).
- `extforge dev` — esbuild-based dev server with WebSocket HMR for background, popup, side panel, and content scripts.
- `extforge build` — production builds for Chrome, Firefox, Safari, and Edge from a single config.
- `extforge validate` — project structure and manifest sanity checks.
- `extforge package` — store-ready `.zip` archives per browser.
- `extforge icons` — PNG generation from `icons/icon.svg` (sharp-cli or cairosvg).
- Programmatic API: `build`, `buildAll`, `createBuildContext`, `createHMRServer`, `validateProject`, `generateManifest`, `loadExtForgeConfig`.
- TypeScript typings shipped in `dist/core/index.d.ts`.
- HMR client auto-injected into ESM bundles via esbuild `banner`. Service worker context calls `chrome.runtime.reload()`; window contexts swap CSS hrefs in place and reload on JS changes.
- Free-port reservation for the HMR WebSocket server so the embedded client always points at the actual listening port.
