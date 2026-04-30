# Design: Injected (Page-Context) Script Support in ExtForge

**Date:** 2026-04-30
**Status:** Approved for implementation planning
**Repo:** `Documents/practice/extforge`

## Goal

Add first-class support for injected / page-context scripts to ExtForge. An injected script is a JavaScript bundle declared in `web_accessible_resources` and loaded into a page's realm (typically by a content script that creates a `<script src="...">` element). It is fundamentally different from a content script: it has no extension privileges, runs in the page's JS context, and must be bundled as IIFE so that no module semantics leak into the page.

The motivating consumer is the Request Interceptor extension, which uses an injected script to wrap `fetch`, `XMLHttpRequest`, and `WebSocket` in the page realm. Once this feature lands, that extension will migrate from Vite to ExtForge.

## Non-goals

- HMR for injected scripts (page-context scripts can't be HMR'd; rebuild + reload is enough).
- Multi-content-script support (separate concern; not blocking this work).
- Changes to existing entry-point handling (background, content, UI).
- Source-map handling beyond what esbuild already does inline.

---

## Public API surface

### Project layout

ExtForge discovers injected entries via convention, mirroring how it already handles `ui/popup`, `ui/sidepanel`, etc.:

| Layout | Behavior |
|---|---|
| `src/injected.ts` (or `.tsx`) | Single entry → output `dist/<browser>/injected.js` |
| `src/injected/*.ts` (or `.tsx`) | Multi-entry → outputs `dist/<browser>/injected/<name>.js` for each file |
| Both present | Multi-entry mode wins; ExtForge logs a warning and ignores the loose file |
| Neither present | No injected entries; `web_accessible_resources` defaults remain as the user configures them |

The multi-entry directory only scans direct children (no recursive scan), matching how UI directories work.

### Manifest generation

After build, the manifest generator inspects the discovered injected entries:

- **If the user's `extforge.config.ts` declares `manifest.webAccessibleResources`:** ExtForge respects it verbatim. The user owns that field.
- **If the user did NOT declare `webAccessibleResources` AND injected entries exist:** ExtForge auto-injects:
  ```
  web_accessible_resources: [
    { resources: ["injected.js", "..."], matches: ["<all_urls>"] }
  ]
  ```
- **If neither is true:** No `web_accessible_resources` block in the manifest.

This mirrors how ExtForge handles other defaults: opinionated for the common case, fully overridable for power users.

### Dev mode

A change to any file under `src/injected/` or to `src/injected.ts` triggers the same rebuild-and-extension-reload flow ExtForge already runs for background and content-script changes. No HMR client is injected into IIFE bundles (the injected bundle runs in page realm and has no way to receive HMR updates without leaking client globals into the page — explicitly avoided).

### Bundle format

Injected entries are built as **IIFE** (`format: 'iife'` in esbuild). All other ExtForge entries continue to be ESM. This is a hard requirement: when a content script does

```
const s = document.createElement('script');
s.src = chrome.runtime.getURL('injected.js');
document.head.appendChild(s);
```

the resulting `<script>` is *not* a module and module syntax (`export`, top-level `import`) will throw. IIFE wraps the bundle in a self-executing function with no exports.

---

## Implementation

### Files modified in `src/core/`

#### `builder/constants.ts`

Add an injected-entry constant alongside `ENTRY_SCANS`:

```
export const INJECTED_DIR = 'injected';
```

`ENTRY_SCANS` is unchanged.

#### `builder/index.ts`

Add discovery and a second esbuild pass.

**New helper** `discoverInjectedEntries(srcDir, log)`:

- If `<srcDir>/injected/` exists and is a directory:
  - If `<srcDir>/injected.ts` or `injected.tsx` also exists, log a warning and ignore the loose file.
  - For each direct-child `.ts`/`.tsx` file in the directory, add an entry keyed `injected/<stem>` with the absolute path as value. Return that map.
- Else if `<srcDir>/injected.ts` exists, return `{ injected: <path> }`.
- Else if `<srcDir>/injected.tsx` exists, return `{ injected: <path> }`.
- Else return `{}`.

**Second esbuild pass** in `build()`, after the main pass and before manifest writing:

- Skip if the discovery map is empty.
- Run a second `esbuild.build()` with `format: 'iife'`, the same `bundle`, `outdir`, `platform`, `target`, `sourcemap`, `minify`, `define`, `alias`, `loader`, `logLevel`, `metafile` options as the main pass.
- Catch errors and append to the same `errors` array; do not throw — the rest of the build continues so users see all build output.

The injected pass produces `<outDir>/injected.js` for the single case and `<outDir>/injected/<name>.js` for the multi case. Files appear in `BuildResult.files` via the metafile, same as the main pass.

The `define`, `alias`, and `loader` options are duplicated rather than abstracted into a shared helper. If a third pass appears later, refactor at that point.

#### `manifest/generator.ts`

After the user's manifest config is normalized, apply injected defaults:

- If the discovery map is empty, do nothing.
- If the user's config already declares a non-empty `webAccessibleResources` array, do nothing.
- Else set `web_accessible_resources` on the generated manifest to a single entry with `resources` listing every output filename (`injected.js` or `injected/<name>.js`) and `matches: ["<all_urls>"]`.

The injected-entries map is computed in `builder/index.ts`; the simplest path is to call the new `applyInjectedDefaults` function from there after discovery and before writing the manifest, rather than threading the map through `generateManifest`'s signature.

#### `hmr/index.ts`

Extend the file classifier (`classifyChange`) so that paths matching `src/injected.ts`, `src/injected.tsx`, or `src/injected/**` are categorized as triggering an extension reload (same severity as content-script changes). No HMR client gets injected into IIFE bundles.

The exact change depends on `classifyChange`'s current shape; the contract is: when an injected source file changes, the dev server triggers the same flow as a content-script change.

---

## Tests

ExtForge uses Vitest. Add:

### `tests/builder.test.ts` (extend existing)

- **Discovers single `src/injected.ts`** — set up a fixture under `tests/fixtures/injected-single/` with `src/injected.ts` and minimal `extforge.config.ts`. After build, assert `dist/<browser>/injected.js` exists, contains the expected source identifiers, and contains no ESM `export` or top-level `import` statements (IIFE format check).
- **Discovers `src/injected/*.ts`** — fixture `tests/fixtures/injected-multi/` with two files. After build, assert both output files exist under `dist/<browser>/injected/`.
- **Both modes present** — fixture with both layout styles. Assert directory-mode wins, the loose file is skipped, and a warning was logged.
- **No injected entries** — fixture without injected files. Assert no `injected.*` output appears and no warning is logged.
- **Path alias works in injected scripts** — fixture's `src/injected.ts` imports `@/lib/foo`. Assert the bundle resolves it.

### `tests/manifest.test.ts` (extend existing)

- **Auto-populates `web_accessible_resources` for single injected** — fixture without `webAccessibleResources` in config. After generation, manifest contains the auto block listing `injected.js`.
- **Auto-populates for multi injected** — manifest contains all output filenames.
- **Respects user override** — user declares `webAccessibleResources` in config. Auto-injection does not overwrite it.
- **No block when no injected entries** — manifest has no `web_accessible_resources` key.

### Fixtures

Create under `tests/fixtures/`:

- `injected-single/` — `extforge.config.ts`, `src/injected.ts`, `package.json`, optionally a stub `src/background.ts` to satisfy any "no entry points" check.
- `injected-multi/` — same skeleton with `src/injected/` containing two files.
- `injected-conflict/` — both layouts.
- `injected-with-resources/` — single injected entry and a `webAccessibleResources` block in config.

Fixtures should be the minimum viable project shape; reuse one base and override per scenario.

### `tests/hmr.test.ts` (extend existing)

- **`src/injected.ts` change classifies as extension reload** — call `classifyChange` with the path; assert it returns the same category as a content-script change.
- **`src/injected/foo.ts` change classifies as extension reload.**

---

## Sequencing

1. Implement constants and discovery in `builder/`.
2. Add the second esbuild pass.
3. Wire manifest auto-population.
4. Extend HMR classifier.
5. Add fixtures and tests.
6. Run full suite, ensure no regressions in existing builder/manifest/hmr tests.

Each step is its own commit. The Request Interceptor migration is a separate spec built on top of the released feature.

---

## Risks

- **IIFE pass duplicates esbuild config.** If the existing main-pass config grows new options (e.g., a custom plugin), the injected pass may drift. Acceptable for now; revisit if a third pass appears.
- **Auto-populated `<all_urls>` is permissive.** Documented as opinionated default; users who want narrower matches must declare the block themselves.
- **`classifyChange` shape unknown without reading the file.** Implementer reads `src/core/hmr/index.ts` and applies the matching pattern; if the existing structure makes injected-classification awkward, raise a concern rather than force a refactor.
