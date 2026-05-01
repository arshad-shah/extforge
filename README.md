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

ExtForge is a zero-config build system for Manifest V3 browser extensions. It scaffolds new projects, runs an esbuild-powered dev server with hot module reloading, generates per-browser manifests, and packages your extension for the Chrome, Firefox, Safari, and Edge stores — all from a single CLI.

```bash
npx extforge init my-extension
cd my-extension
npm run dev
```

## Features

- **🔥 Hot reload that actually works.** Edit your side panel, popup, content script, or background service worker — ExtForge rebuilds and pushes updates over WebSocket. CSS swaps without a reload; JS triggers a tab reload; manifest and background changes do a full extension reload.
- **🌐 Cross-browser by default.** A single config emits a manifest tailored to Chrome, Firefox, Safari, and Edge. Browser-specific quirks (background `service_worker` vs. `scripts`, `host_permissions` placement, etc.) are handled automatically.
- **📦 Manifest V3 first.** Built around MV3 from day one. Service workers as ESM modules. Side panel, action popup, content scripts, and page-world injected scripts as separate entry points.
- **🚀 Powered by esbuild.** Cold-start build in tens of milliseconds. Incremental rebuilds in single digits.
- **⚛️ Framework-agnostic.** First-class React + Tailwind support, but you can use Vue, Svelte, Solid, or vanilla JS/TS.
- **🧱 Scaffolding.** `extforge init` walks you through framework, CSS, and target-browser choices and writes a working starter.
- **📋 Validation.** `extforge validate` checks for common manifest mistakes, missing icons, and structural problems before they hit the store.
- **🗜️ Packaging.** `extforge package` produces store-ready `.zip` archives per browser.

## Installation

```bash
# Per-project (recommended)
npm install -D extforge

# Global
npm install -g extforge
```

Requires **Node.js ≥ 20**.

## Quick start

### Scaffold a new extension

```bash
npx extforge init my-extension
cd my-extension
npm install
npm run dev
```

The interactive prompt asks for:
- Project name
- Framework (React, Vue, Svelte, Solid, vanilla)
- CSS approach (Tailwind, vanilla, none)
- Target browsers
- Which entry points to generate (popup, side panel, content script, background, injected)

Pass `--defaults` to skip prompts.

### Load the extension

After `npm run dev`, open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select `dist/chrome/`. (Or `dist/firefox/`, `dist/edge/`, `dist/safari/`.)

The dev server prints the path to load when it starts.

## Project layout

ExtForge expects a conventional layout — no glue code, no entry-point manifest:

```
my-extension/
├── extforge.config.ts        # config (browsers, manifest, framework, css)
├── icons/                    # icon-16.png, icon-32.png, icon-48.png, icon-128.png
├── src/
│   ├── background.ts         # service worker (MV3)
│   ├── content.ts            # content script (runs in page DOM)
│   ├── injected.ts           # page-world script (optional)
│   ├── injected/             # OR multiple page-world scripts
│   │   ├── feature-a.ts
│   │   └── feature-b.ts
│   ├── ui/
│   │   ├── popup/
│   │   │   ├── index.html
│   │   │   └── index.tsx     # action popup
│   │   └── sidepanel/
│   │       ├── index.html
│   │       └── index.tsx     # side panel
│   └── styles/
│       └── globals.css       # Tailwind / global CSS
└── public/                   # static assets copied verbatim to dist/
```

Any entry point you don't need, you simply don't create. ExtForge auto-discovers what's there.

## Configuration

`extforge.config.ts` at the project root:

```ts
import { defineConfig } from 'extforge';

export default defineConfig({
  browsers: ['chrome', 'firefox', 'safari', 'edge'],
  framework: 'react',
  css: 'tailwind',
  manifest: {
    manifestVersion: 3,
    name: 'My Extension',
    version: '0.1.0',
    description: 'Does something useful',
    icons: {
      '16': 'icons/icon-16.png',
      '48': 'icons/icon-48.png',
      '128': 'icons/icon-128.png',
    },
    action: {
      defaultPopup: 'ui/popup/index.html',
      defaultIcon: { '16': 'icons/icon-16.png', '48': 'icons/icon-48.png' },
    },
    background: { entrypoint: 'background/index.js' },
    contentScripts: [
      { matches: ['<all_urls>'], js: ['content/index.js'], runAt: 'document_start' },
    ],
    sidePanel: { defaultPath: 'ui/sidepanel/index.html' },
    permissions: {
      required: ['storage', 'activeTab', 'scripting'],
      optional: [],
      host: ['<all_urls>'],
    },
    webAccessibleResources: [
      { resources: ['injected.js'], matches: ['<all_urls>'] },
    ],
  },
});
```

ExtForge converts this single declaration into a per-browser `manifest.json` at build time, applying browser-specific transformations (e.g. `background.scripts` for Firefox, `host_permissions` placement, etc.).

## CLI

```
extforge init [name]        # Scaffold a new extension project
extforge dev                # Start dev server with HMR
extforge build              # Production build (all browsers)
extforge build --browser    # Build a single browser target
extforge build --dev        # Dev-mode build (no minify, sourcemaps)
extforge validate           # Validate config and project structure
extforge package            # Create dist .zip archives for stores
extforge icons              # Generate PNG icons from icons/icon.svg
```

### `extforge dev`

Flags:
- `--browser <chrome|firefox|safari|edge>` — target (default: `chrome`)
- `--port <n>` — HMR WebSocket port (default: `35729`; auto-bumps if busy)
- `--host <h>` — HMR host (default: `localhost`)

What it does:
1. Reserves a free WebSocket port.
2. Builds your extension once into `dist/<browser>/`, embedding an HMR client into your background, popup, side panel, and content bundles.
3. Starts a `ws://` server and a file watcher on `src/`, `public/`, `icons/`, and `extforge.config.ts`.
4. On change: rebuilds (incremental when possible) and broadcasts the update kind. CSS swaps in place; JS reloads the open tab/page; manifest or background changes call `chrome.runtime.reload()`.

### `extforge build`

Default: builds all browsers in `config.browsers` (or all four if unset). Pass `--browser <name>` for a single target. `--dev` produces an unminified, sourcemap-included build.

### `extforge package`

Zips each `dist/<browser>/` directory into `packages/<name>-<browser>-v<version>.zip`. Run after `extforge build`.

### `extforge icons`

Renders `icons/icon.svg` to PNGs at 16/32/48/128. Requires `sharp-cli` (preferred) or `cairosvg` (fallback).

## How HMR works

ExtForge injects a small WebSocket client as an esbuild `banner` into each ESM entry (background, side panel, popup) at dev-time. When you save a file, the server:

1. Classifies the change (`css` / `js` / `assets` / `manifest` / `full-reload`).
2. Rebuilds incrementally.
3. Broadcasts a JSON payload to all connected clients.

Clients react based on context:
- **Service worker context** — receives `full-reload` / `manifest` and calls `chrome.runtime.reload()`.
- **Window context (popup, side panel, content script)** — receives `css` and swaps `<link>` href timestamps; receives `js` and reloads the page; receives `full-reload` and calls `chrome.runtime.reload()`.

Notes:
- After loading the extension in your browser the first time, you must reload it from `chrome://extensions` for the freshly bundled HMR client to start.
- The injected page-world script (`src/injected.ts`) is intentionally excluded from HMR client injection to keep page-world clean.

## Programmatic API

ExtForge exposes its core building blocks:

```ts
import {
  build, buildAll, createBuildContext,
  createHMRServer,
  validateProject,
  generateManifest,
  loadExtForgeConfig,
} from 'extforge';
```

See [`src/core/index.ts`](./src/core/index.ts) for the full surface.

Example — programmatic dev server:

```ts
import { createHMRServer, loadExtForgeConfig, createLogger } from 'extforge';

const config = await loadExtForgeConfig(process.cwd());
const server = createHMRServer({
  projectRoot: process.cwd(),
  config,
  browser: 'chrome',
  port: 35729,
  logger: createLogger({ scope: 'my-app' }),
});

await server.start();
```

## Comparison

| | ExtForge | Plasmo | WXT | CRXJS |
|---|---|---|---|---|
| Manifest V3 | ✅ | ✅ | ✅ | ✅ |
| Cross-browser manifest | ✅ | ✅ | ✅ | ⚠️ |
| HMR | ✅ esbuild + ws | ✅ | ✅ Vite | ✅ Vite |
| Bundler | esbuild | Parcel | Vite | Vite |
| Framework-agnostic | ✅ | ✅ | ✅ | ✅ |
| Init scaffolder | ✅ interactive | ✅ | ✅ | ❌ |
| Zero-config | ✅ | ✅ | ✅ | ❌ |

ExtForge optimizes for **build speed** and **explicit configuration**. If you prefer Vite-based tooling, WXT is excellent. If you want filesystem-based routing of entry points with magic conventions, try Plasmo. ExtForge gives you esbuild speed and a single typed config.

## Contributing

PRs welcome. Please open an issue first for non-trivial changes.

```bash
git clone https://github.com/arshad-shah/extforge.git
cd extforge
pnpm install
pnpm build
pnpm test
```

To test against a sample project, link locally:

```bash
cd extforge && pnpm link --global
cd ../my-extension && pnpm link --global extforge
```

## License

MIT © [Arshad Shah](https://github.com/arshad-shah)
