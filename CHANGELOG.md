# Changelog

All notable changes to ExtForge are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
