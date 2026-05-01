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
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-FBBF24.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/extforge?color=0F172A" alt="Node"></a>
  <a href="https://extforge.arshadshah.com"><img src="https://img.shields.io/badge/docs-extforge.arshadshah.com-5B21B6" alt="Docs"></a>
</p>

---

ExtForge is a zero-config build system for Manifest V3 browser extensions. It scaffolds new projects, runs an esbuild-powered dev server with HMR, generates per-browser manifests, and packages your extension for the Chrome, Firefox, Edge, and Safari stores — all from a single CLI.

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

- **Cross-browser by default.** One config emits a manifest tailored to each browser. Browser-specific quirks handled automatically.
- **HMR that works.** Targeted content-script reloads (only matched tabs), CSS hot swap, infinite reconnect.
- **Typed plugin API.** Hooks for config, manifest, build, and dev-reload events. Legacy plugin shape still works.
- **Testing helpers.** `extforge/testing` ships chrome.* fakes for runtime/storage/tabs/action/scripting plus a vitest preset.
- **Cross-browser API compat checking.** Catches `chrome.tabGroups.update()` on Safari at build time, with per-line opt-out.
- **Production-ready packaging.** `extforge package` produces store-ready `.zip` archives.

## Install <span id="installation"></span>

```bash
pnpm add -D extforge
```

Requires Node 20+. See [install guide](https://extforge.arshadshah.com/getting-started/install/) for npm/yarn/bun.

## Docs <span id="docs"></span>

Full documentation lives at **[extforge.arshadshah.com](https://extforge.arshadshah.com)**:

- [Configuration](https://extforge.arshadshah.com/reference/config/)
- [Plugin API](https://extforge.arshadshah.com/reference/plugins/api/)
- [CLI commands](https://extforge.arshadshah.com/reference/cli/commands/)
- [Error codes](https://extforge.arshadshah.com/reference/errors/)
- [Brand guidelines](https://extforge.arshadshah.com/brand/guidelines/)

## Contributing

Issues and PRs welcome. Run `pnpm install && pnpm test` to verify your environment.

## License

MIT — see [LICENSE](./LICENSE).
