# Design: Content Scripts as IIFE in ExtForge

**Date:** 2026-04-30
**Status:** Approved for implementation planning
**Repo:** `Documents/practice/extforge`
**Builds on:** `2026-04-30-injected-script-support-design.md`

## Goal

Build content-script entries (`src/content.ts` or `src/content/index.ts`) as IIFE bundles instead of ESM. MV3 does not support module-format content scripts; the current ESM output is non-functional for any consumer that runtime-loads a module syntax in a content-script context. This change reuses the IIFE pass already in place for injected scripts.

## Non-goals

- No new config field. The format choice is determined by the entry kind, not by user configuration.
- No change to background or UI entries — those continue to use ESM.
- No source-layout change. `src/content.ts` and `src/content/index.ts` remain the recognized locations.

## Architecture

A single change: route the existing `content/index` entry through the IIFE pass instead of the ESM pass. The infrastructure for the IIFE pass was added in the injected-script feature; content scripts join the same pass.

After the change, the main ESM `esbuild.build()` call processes only background and UI entries. The IIFE pass processes content + injected together.

## Implementation

### File: `src/core/builder/index.ts`

In `build()`, after `entries = discoverEntryPoints(srcDir)` returns, split the map:

- Pull `content/index` out of `entries` (if present) and into a new `iifeEntries` map.
- Merge `injectedEntries` (already discovered) into the same `iifeEntries` map.
- Pass the reduced `entries` map to the existing main pass (`makeBuildConfig`).
- Pass `iifeEntries` to the existing IIFE pass (replacing the current `injectedEntries`-only call).

Pseudocode shape:

```typescript
const allEntries = discoverEntryPoints(srcDir);
const injectedEntries = discoverInjectedEntries(srcDir, log);

// Route content scripts to the IIFE pass alongside injected
const iifeEntries: Record<string, string> = { ...injectedEntries };
if (allEntries['content/index']) {
  iifeEntries['content/index'] = allEntries['content/index'];
  delete allEntries['content/index'];
}

// Main ESM pass uses the reduced map (no content)
let result: esbuild.BuildResult;
try { result = await esbuild.build(makeBuildConfig(root, { ...opts, outDir }, allEntries)); }
catch (err) { /* unchanged */ }

// IIFE pass now covers content + injected
if (Object.keys(iifeEntries).length > 0) {
  try {
    await esbuild.build({
      ...makeSharedEsbuildOptions(root, { ...opts, outDir }),
      entryPoints: iifeEntries,
      outdir: outDir,
      format: 'iife',
      splitting: false,
    });
  } catch (err) { /* unchanged */ }
}
```

The `applyInjectedDefaults` call in the manifest block continues to receive only `injectedEntries` (not the merged `iifeEntries`) — content scripts are not added to `web_accessible_resources`.

### File: `src/core/manifest/generator.ts`

No change.

### File: `src/core/hmr/index.ts`

No change. Content-script HMR classification (`BACKGROUND_PATTERNS`-style match for `/content/`) is already in place via the existing classifier rules — content changes already fall into `js` updates that trigger rebuild. The format change is transparent to HMR because the rebuild call is the same `build()` function.

### File: `src/core/builder/constants.ts`

No change.

## Tests

### `tests/builder.test.ts`

Add one unit test:

```typescript
it('routes content/index entry to IIFE bucket', () => {
  // Helper exported for testability — see implementation
  const allEntries = { 'background/index': '/p/bg.ts', 'content/index': '/p/content.ts' };
  const { esmEntries, iifeEntries } = partitionEntriesForFormat(allEntries, { 'injected': '/p/injected.ts' });
  expect(esmEntries).toEqual({ 'background/index': '/p/bg.ts' });
  expect(iifeEntries).toEqual({ 'content/index': '/p/content.ts', 'injected': '/p/injected.ts' });
});
```

To make this testable, factor the partitioning logic into an exported helper `partitionEntriesForFormat(allEntries, injectedEntries)` that returns `{ esmEntries, iifeEntries }` instead of inlining it in `build()`. The helper takes already-discovered maps and is pure.

Then `build()` calls `partitionEntriesForFormat` once with the discovered maps and uses its result.

### Smoke test (manual, not committed)

After build of a fixture with `src/content.ts`, confirm:
- `dist/<browser>/content/index.js` exists.
- Its first non-blank token is `(()` or `(function`, indicating IIFE wrapping.
- It contains no top-level `export` statement.

## Risks

- **Existing users who depend on content-as-ESM behavior** — none expected; MV3 doesn't actually run that, so any working content script in the wild is either trivial enough that esbuild's IIFE wrapping won't change behavior, or already broken.
- **Future content-script needs that benefit from ESM** (tree-shaking across multiple files, dynamic import) — esbuild IIFE bundling already inlines all imports into the single output bundle, so the bundling story is identical. Dynamic `import()` won't work in either format inside MV3 content scripts, so no regression.

## Sequencing

This is a small change, intended to land before the Request Interceptor migration spec. One commit (or two — one for the partition helper + tests, one for the wiring change). The migration to ExtForge follows.
