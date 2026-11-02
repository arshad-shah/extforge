# Entrypoint discovery from `src/` (#96, with #97)

Status: **accepted 2026-11-02**. Decisions:
- **D1:** entrypoints live directly in `src/` (`build.srcDir`), not in an `entrypoints/` subfolder.
- **D2:** options are declared inline with `define*()` and `config.manifest` overrides them.
- **D3:** the old layout builds for all of 1.x with a deprecation warning and is removed in 2.0.
- **D4:** output paths are flat.

## Problem

Five entrypoints are hard-coded (`ENTRY_SCANS`: background, content, ui/popup, ui/options, ui/sidepanel), plus `src/injected/*` and `src/contents/*.csui.tsx`. Anything else (a second content script, devtools, a new-tab override, an offscreen document) can't be expressed. Worse, the manifest never comes from what was built: users hand-write dist-relative paths in `config.manifest` (`background.entrypoint: 'background/index.js'`, `contentScripts[].js: ['content/index.js']`). Two lists that have to agree, with nothing checking that they do.

Consequences found while mapping this (verified):

- **Targeted content-script HMR never fires in real projects.** `buildContentScriptMap` keys on `resolve(root, contentScripts[].js)`, which are dist paths, while the builder looks entries up by source path. No `__EXTFORGE_SCRIPT_ID__` is assigned in a real dev build, so every edit reloads every content script. Unit tests pass only because they put source paths in `js`.
- **The docs over-promise.** `project-layout.mdx` says `src/content/*.ts` gives multiple content scripts and that HTML maps to manifest keys automatically. Neither is implemented.
- **Unsupported MV3 surfaces are silently dropped.** `generateManifest` whitelists keys, so `devtools_page`, `chrome_url_overrides` and `sandbox` can't be set through config.
- **`build.srcDir` and `build.outDir` are ignored** by the builder, the HMR watch and hash paths, and `dev --open`. They're only partly honoured elsewhere.

## Goals

1. Any entrypoint file in `src/` becomes a build entry **and** its manifest entry. No path is written twice.
2. Multiple content scripts with no config edits: options live in the file (#97).
3. The full MV3 surface: background, popup, options, side panel, devtools, new-tab/history/bookmarks overrides, offscreen, sandbox pages, unlisted pages and scripts, injected (main-world) scripts, CSUI.
4. The old layout keeps building through v1.x with a deprecation warning. Removed in v2.
5. A migration guide, and `extforge migrate-layout` to move files.

Non-goals: framework-agnostic builds (#98) and auto-imports (#110).

## Naming convention

Close to WXT's naming, but rooted at `src/` (D1). Because shared code lives in the same folder, **only these count as entrypoints**: the reserved names below, files with an entry suffix (`.content`, `.csui`, `.injected`, `.unlisted`, `.offscreen`, `.sandbox`), and HTML files. `src/lib/index.ts`, `src/components/Button.tsx` and the like are never entries.

| File | Kind | Manifest | Output |
|---|---|---|---|
| `background.ts` or `background/index.ts` | background | `background.service_worker` (Firefox: `scripts`) | `background.js` |
| `popup.html` or `popup/index.html` | popup | `action.default_popup` | `popup.html` + `popup.js` |
| `options.html` / `options/index.html` | options | `options_page` / `options_ui` | `options.html` |
| `sidepanel.html` / `sidepanel/index.html` | side panel | `side_panel.default_path` (Firefox `sidebar_action`) | `sidepanel.html` |
| `devtools.html` / `devtools/index.html` | devtools | `devtools_page` | `devtools.html` |
| `newtab.html`, `history.html`, `bookmarks.html` | override | `chrome_url_overrides.<name>` | `<name>.html` |
| `content.ts`, `<name>.content.ts`, `<name>.content/index.ts` | content script | `content_scripts[]`, options from `defineContentScript()` | `content-scripts/<name>.js` |
| `<name>.csui.tsx` | CSUI (existing) | `content_scripts[]` from `defineCSUI()` | `content-scripts/<name>.js` |
| `<name>.injected.ts` | main-world script | `web_accessible_resources` | `injected/<name>.js` |
| `offscreen.html` / `<name>.offscreen.html` | offscreen document | none (used at runtime through `chrome.offscreen`) | `<name>.html` |
| `<name>.sandbox.html` | sandbox page | `sandbox.pages[]` | `<name>.html` |
| any other `<name>.html` directly in `src/` | unlisted page | none | `<name>.html` |
| `<name>.unlisted.ts` | unlisted script | none (added to `web_accessible_resources` when `defineUnlistedScript({ webAccessible: true })`) | `<name>.js` |

Rules:
- Only `src/` itself and `src/<name>/index.*` folders are scanned. A folder whose name isn't reserved or suffixed is ordinary code, and HTML inside it is not an entry.
- A name that two files claim (`popup.html` and `popup/index.html`) is an error naming both.
- **HTML is the entry for pages.** `<script type="module" src="./main.ts">` inside is rewritten to the built JS, so the script no longer has to sit next to the HTML under a fixed name.
- Entries whose kind needs the API on a browser that lacks it are dropped with the existing compat warning (side panel on Safari, for example).
- Legacy names are still recognised, as deprecated aliases: `ui/popup|options|sidepanel/index.html`, `content/index.ts`, `injected/*.ts`, `contents/*.csui.tsx`. `popup.html` and `ui/popup/index.html` existing together is an error.

## Inline per-entry config (#97) **(D2: inline vs. config)**

```ts
// src/youtube.content.ts
import { defineContentScript } from 'extforge/entrypoints';

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  runAt: 'document_idle',
  world: 'ISOLATED',
  main() { /* ... */ },
});
```

- At build time, options are read **statically** by generalising the CSUI extractor (`src/core/csui/discovery.ts`), so nothing executes at build time. Non-literal values produce the existing "could not resolve option" warning.
- `defineBackground({ type, persistent })`, `defineUnlistedScript()` and `defineInjectedScript()` follow the same pattern. Pages take options from `<meta name="extforge:*">` tags (for example `extforge:title`, or `extforge:open-in-tab` for options).
- Precedence: anything in `config.manifest` for the same key overrides discovered values, with an info line. Config therefore becomes an escape hatch rather than a second source of truth.

## Compatibility (D3: all of 1.x)

Both layouts live in `src/` (D1), so no folder can say which one a project uses. What is actually deprecated is **hand-writing entry paths in `config.manifest`**, so that is the switch:

- **Legacy output mode:** `config.manifest` sets any of `background.entrypoint`, `action.defaultPopup`, `optionsPage`, `sidePanel.defaultPath` or `contentScripts[].js`. Every entry keeps today's output key (`background/index.js`, `ui/popup/index.html`, `content/index.js`), so those hand-written strings stay valid. Each build prints one deprecation warning naming the keys to delete, with a link to the migration guide.
- **Generated mode:** none of those keys are set. Outputs are flat (D4) and the manifest is generated from discovery.
- Legacy folder names work in both modes, with their own deprecation line.
- Both legacy behaviours are removed in 2.0. `extforge migrate-layout` renames the files and deletes the hand-written keys in one step.
- **Plugin API:** `EntryDescriptor.name` stays the output key. New-layout keys differ (`content-scripts/youtube`), and that's documented in the plugin reference as part of the opt-in. `EntryDescriptor` gains an optional `kind`, which is additive and therefore minor.

## Architecture

New `src/core/entrypoints/`:
- `discover.ts`: `discoverEntrypoints(srcDir, { legacyOutputs }) → Entrypoint[]`, where `Entrypoint = { name, kind, input, outputKey, format: 'esm' | 'iife', html?, options, legacy?: true }`. A pure function over a directory listing plus the static option extractor. Legacy folder names map to the same `Entrypoint` type, so the rest of the builder sees one list.
- `manifest.ts`: `manifestFromEntrypoints(entrypoints, browser) → Partial<ManifestObject>`, merged **under** `generateManifest(config.manifest)`.
- `html.ts`: rewrites page script and style references to built outputs.

The builder replaces `discoverEntryPoints`, `discoverInjectedEntries`, CSUI discovery and `partitionEntriesForFormat` with one `Entrypoint[]`. `format` comes from `kind` (content, CSUI and injected are IIFE; the rest ESM). `buildContentScriptMap` is keyed by entry input, which fixes targeted HMR. HMR's `tryClassifyV3`, `BACKGROUND_PATTERNS` and `INJECTED_PATTERNS` classify by `Entrypoint.kind` instead of path substrings. `build.srcDir` and `build.outDir` are threaded through the builder, HMR and `dev --open` at the same time, since every one of those call sites is touched anyway.

## Phases

Each phase is a mergeable PR with tests. The old layout stays green throughout.

1. **Discovery core:** the `Entrypoint` model, the legacy adapter, and the builder switched to the single list with no behaviour change. Fix content-script map keying so targeted HMR works. Thread `srcDir`/`outDir` through.
2. **New layout plus manifest derivation:** `src/` discovery for background, popup, options, side panel and content scripts, `defineContentScript` with the static extractor, HTML rewriting, and config-overrides-discovery precedence.
3. **The rest of the MV3 surface:** devtools, URL overrides, offscreen, sandbox, unlisted pages and scripts, injected, and CSUI under the new layout.
4. **Dev experience:** HMR classification by kind, scaffold (`extforge init` writes the new layout), examples, e2e, `extforge migrate-layout`, the deprecation warning, the migration guide and the project-layout docs rewrite (removing the false claims).

## Testing

- Unit tests: discovery against in-memory and temporary trees, covering every row of the table, name collisions and the old/new conflict.
- Manifest derivation for each kind × browser, matching the existing manifest tests.
- Integration: real esbuild builds of a temporary project in each layout, comparing the produced manifest with a fixture.
- HMR: assert that a real-project dev build assigns script IDs (the regression above).
- E2E: one example migrated to the new layout, loaded in Chromium, with popup, content and devtools checks.

## Open questions

None blocking. Revisit after phase 2: whether `extforge init` should offer the legacy layout at all (proposed: no).
