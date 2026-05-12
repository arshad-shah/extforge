<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/logo-wordmark-dark.svg">
    <img src="brand/logo-wordmark.svg" alt="ExtForge" width="320">
  </picture>
</p>

<p align="center">
  <em>The build system for Manifest V3 browser extensions.</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/extforge"><img src="https://img.shields.io/npm/v/extforge.svg?color=5B21B6" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/extforge"><img src="https://img.shields.io/npm/dm/extforge.svg?color=5B21B6" alt="npm downloads"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-FBBF24.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/extforge?color=0F172A" alt="Node"></a>
  <a href="https://extforge.arshadshah.com"><img src="https://img.shields.io/badge/docs-extforge.arshadshah.com-5B21B6" alt="Docs"></a>
</p>

<p align="center">
  <a href="https://github.com/arshad-shah/extforge/actions/workflows/ci.yml"><img src="https://github.com/arshad-shah/extforge/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
  <a href="https://github.com/arshad-shah/extforge/actions/workflows/codeql.yml"><img src="https://github.com/arshad-shah/extforge/actions/workflows/codeql.yml/badge.svg?branch=main" alt="CodeQL"></a>
  <a href="https://api.securityscorecards.dev/projects/github.com/arshad-shah/extforge"><img src="https://api.securityscorecards.dev/projects/github.com/arshad-shah/extforge/badge" alt="OpenSSF Scorecard"></a>
  <a href="https://github.com/arshad-shah/extforge/blob/main/SECURITY.md"><img src="https://img.shields.io/badge/security-policy-FBBF24" alt="Security policy"></a>
</p>

---

ExtForge is a zero-config build system for Manifest V3 browser extensions. One config, every browser. esbuild-powered dev server with true 0-reload UI updates via React Fast Refresh. First-party packages for storage, messaging, and Shadow-DOM-mounted content UIs. **0 production CVEs, 32 prod packages.**

## Quick start <span id="quick-start"></span>

```bash
pnpm dlx extforge init my-extension
cd my-extension
pnpm install
pnpm dev
```

Open `chrome://extensions`, enable Developer mode, and **Load unpacked** from `dist/chrome/`.

[Full quick-start guide →](https://extforge.arshadshah.com/getting-started/quick-start/)

## What it does <span id="features"></span>

### Build & dev
- **Cross-browser by default.** One config emits a manifest tailored to each browser. Browser-specific quirks handled automatically.
- **True 0-reload UI updates.** SWC-powered React Fast Refresh for popup/options/sidepanel — components update with state preserved. Falls back gracefully (full reload) when `@swc/core` isn't installed.
- **Versioned HMR protocol (v3).** Targeted module swaps for UI-only changes; full reload for manifest / background / content-script changes. CSS hot swap, infinite reconnect.
- **Cross-browser API compat checking.** MDN BCD-driven — catches `chrome.tabGroups.update()` on Safari at build time, with per-line opt-out.
- **Production-ready packaging.** `extforge package` produces store-ready `.zip` archives.

### First-party runtime packages
- **`extforge/storage`** + **`extforge/storage/react`** — typed `chrome.storage` wrapper with watch API and `useStorage()` hook. localStorage fallback for non-extension contexts.
- **`extforge/messaging`** — typed RPC over `chrome.runtime`. `defineHandler` / `sendMessage` with full inference via the augmentable `MessageMap` interface. Plus typed Ports API.
- **`extforge/csui`** — Content Script UI. Drop a file at `src/contents/*.csui.tsx`, `export default defineCSUI({matches: [...]}, render)`, and ExtForge auto-discovers it, registers it in the manifest, and mounts it inside a Shadow DOM at runtime.
- **`extforge/env`** — `.env` loading with Vite-style precedence. `EXTFORGE_PUBLIC_*` keys are inlined into bundles via esbuild's `define`.
- **`extforge/testing`** — `chrome.*` fakes for runtime/storage/tabs/action/scripting plus a vitest preset.
- **`extforge/logger`** — structured logger used by the CLI. Exposes scoped loggers, timers, and a JSON transport for piping CI output into log aggregators.

### Extensibility
- **Typed plugin API.** Hooks for config, manifest, build, and dev-reload events. Legacy plugin shape still works.
- **`extforge doctor`** — 9 preflight checks for node version, config validity, icons, HMR port, browser overrides, permissions, and cross-browser API support.

## Install <span id="installation"></span>

```bash
pnpm add -D extforge
```

Requires Node 20+. Optional: `pnpm add -D @swc/core react-refresh` to enable React Fast Refresh in dev. See [install guide](https://extforge.arshadshah.com/getting-started/install/) for npm/yarn/bun.

## Docs <span id="docs"></span>

Full documentation lives at **[extforge.arshadshah.com](https://extforge.arshadshah.com)**:

- [Configuration](https://extforge.arshadshah.com/reference/config/)
- [Storage](https://extforge.arshadshah.com/reference/runtime/storage/) · [Messaging](https://extforge.arshadshah.com/reference/runtime/messaging/) · [CSUI](https://extforge.arshadshah.com/reference/runtime/csui/) · [Env](https://extforge.arshadshah.com/reference/runtime/env/) · [Logger](https://extforge.arshadshah.com/reference/runtime/logger/)
- [HMR & Fast Refresh](https://extforge.arshadshah.com/guides/hmr/)
- [Plugin API](https://extforge.arshadshah.com/reference/plugins/api/)
- [CLI commands](https://extforge.arshadshah.com/reference/cli/commands/)
- [Error codes](https://extforge.arshadshah.com/reference/errors/)
- [Brand guidelines](https://extforge.arshadshah.com/brand/guidelines/)

## Examples

Working reference extensions live in [`examples/`](./examples):

- **[`vanilla-popup`](./examples/vanilla-popup)** — popup + content + background in plain TypeScript. Uses `extforge/messaging` and `extforge/storage`.
- **[`react-csui`](./examples/react-csui)** — React popup + Shadow-DOM-mounted React widget injected via `extforge/csui` (auto-discovered).

Both build for `chrome` and `firefox` from a single config, exercised end-to-end in [`tests-e2e/`](./tests-e2e) via Playwright with Chrome's new headless mode.

## Security & supply chain

Every release ships with [npm provenance attestations](https://docs.npmjs.com/generating-provenance-statements) and is published via [trusted publishing (OIDC)](https://docs.npmjs.com/trusted-publishers) from a single, required-reviewer GitHub Environment. CI runs CodeQL, OpenSSF Scorecard, and `pnpm audit --prod` on every PR. Verify a release locally with:

```bash
npm view extforge --json | jq '.dist.attestations'
npm audit signatures
```

Full disclosure policy in [SECURITY.md](./SECURITY.md). Pipeline details in the [supply-chain guide](https://extforge.arshadshah.com/guides/supply-chain/).

## Contributing

Issues and PRs welcome. Run `pnpm install && pnpm test` to verify your environment. User-visible changes need a changeset:

```bash
pnpm changeset
```

See [`.changeset/README.md`](./.changeset/README.md) for the workflow.

## License

MIT — see [LICENSE](./LICENSE).
