# Content Script IIFE — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route the `content/index` entry through the existing IIFE pass instead of the ESM pass, so content scripts compile as IIFE (the only format MV3 actually supports).

**Architecture:** Factor entry partitioning into a pure helper, call it from `build()`, send content + injected to the IIFE pass and everything else to the ESM pass.

**Tech Stack:** TypeScript (ESM), esbuild, Vitest. No new runtime dependencies.

**Spec reference:** `docs/superpowers/specs/2026-04-30-content-script-iife-design.md`

---

## File map

- Modify: `src/core/builder/index.ts` — add `partitionEntriesForFormat` helper, route content to IIFE pass
- Modify: `tests/builder.test.ts` — add 1 unit test for the partition helper

---

## Task 1: Add `partitionEntriesForFormat` helper with TDD

**Files:**
- Modify: `src/core/builder/index.ts`
- Modify: `tests/builder.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/builder.test.ts`, add this import to the top:

```typescript
import { partitionEntriesForFormat } from '../src/core/builder/index.js';
```

Then add a new describe block at the bottom of the file (outside the existing `discoverInjectedEntries` describe):

```typescript
describe('partitionEntriesForFormat', () => {
  it('routes content/index entry to IIFE bucket', () => {
    const allEntries = { 'background/index': '/p/bg.ts', 'content/index': '/p/content.ts' };
    const injectedEntries = { 'injected': '/p/injected.ts' };
    const { esmEntries, iifeEntries } = partitionEntriesForFormat(allEntries, injectedEntries);
    expect(esmEntries).toEqual({ 'background/index': '/p/bg.ts' });
    expect(iifeEntries).toEqual({ 'content/index': '/p/content.ts', 'injected': '/p/injected.ts' });
  });

  it('handles missing content/index gracefully', () => {
    const allEntries = { 'background/index': '/p/bg.ts', 'ui/popup/index': '/p/popup.ts' };
    const injectedEntries = { 'injected': '/p/injected.ts' };
    const { esmEntries, iifeEntries } = partitionEntriesForFormat(allEntries, injectedEntries);
    expect(esmEntries).toEqual({ 'background/index': '/p/bg.ts', 'ui/popup/index': '/p/popup.ts' });
    expect(iifeEntries).toEqual({ 'injected': '/p/injected.ts' });
  });

  it('handles empty injected map', () => {
    const allEntries = { 'content/index': '/p/content.ts', 'background/index': '/p/bg.ts' };
    const { esmEntries, iifeEntries } = partitionEntriesForFormat(allEntries, {});
    expect(esmEntries).toEqual({ 'background/index': '/p/bg.ts' });
    expect(iifeEntries).toEqual({ 'content/index': '/p/content.ts' });
  });

  it('does not mutate the input maps', () => {
    const allEntries = { 'content/index': '/p/content.ts', 'background/index': '/p/bg.ts' };
    const injectedEntries = { 'injected': '/p/injected.ts' };
    partitionEntriesForFormat(allEntries, injectedEntries);
    expect(allEntries).toEqual({ 'content/index': '/p/content.ts', 'background/index': '/p/bg.ts' });
    expect(injectedEntries).toEqual({ 'injected': '/p/injected.ts' });
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm test tests/builder.test.ts`
Expected: FAIL — `partitionEntriesForFormat` is not exported.

- [ ] **Step 3: Implement the helper**

In `src/core/builder/index.ts`, add this function right after `discoverInjectedEntries`:

```typescript
/**
 * Split discovered entries into ESM and IIFE buckets.
 * MV3 requires content scripts to be IIFE; injected scripts must be IIFE because
 * they're loaded into page context via a <script src> tag (no module semantics).
 * Background and UI entries remain ESM.
 *
 * Pure function — does not mutate inputs.
 */
export function partitionEntriesForFormat(
  allEntries: Record<string, string>,
  injectedEntries: Record<string, string>,
): { esmEntries: Record<string, string>; iifeEntries: Record<string, string> } {
  const esmEntries: Record<string, string> = { ...allEntries };
  const iifeEntries: Record<string, string> = { ...injectedEntries };

  if (esmEntries['content/index']) {
    iifeEntries['content/index'] = esmEntries['content/index'];
    delete esmEntries['content/index'];
  }

  return { esmEntries, iifeEntries };
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm test tests/builder.test.ts`
Expected: 4 new PASS plus the 7 existing.

- [ ] **Step 5: Commit**

`git add src/core/builder/index.ts tests/builder.test.ts`
`git commit -m "feat(builder): add partitionEntriesForFormat helper"`

No `Co-Authored-By` trailer.

---

## Task 2: Wire `partitionEntriesForFormat` into `build()`

**Files:**
- Modify: `src/core/builder/index.ts`

- [ ] **Step 1: Restructure the build pipeline**

Read `src/core/builder/index.ts`. In `build()`, locate the block that runs `discoverInjectedEntries` and the IIFE pass (added in the injected-script feature). Currently the structure is:

```typescript
const entries = discoverEntryPoints(srcDir);
if (Object.keys(entries).length === 0) {
  errors.push('No entry points found in src/');
  log.error('No entry points discovered');
  return { browser: opts.browser, outDir, duration: 0, files: [], errors };
}

let result: esbuild.BuildResult;
try { result = await esbuild.build(makeBuildConfig(root, { ...opts, outDir }, entries)); }
catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  errors.push(msg); log.error(`Build failed: ${msg}`);
  return { browser: opts.browser, outDir, duration: performance.now() - start, files: [], errors };
}

// ─── Injected (page-context, IIFE) pass ────────────────────────────────────
const injectedEntries = discoverInjectedEntries(srcDir, log);
if (Object.keys(injectedEntries).length > 0) {
  try {
    await esbuild.build({
      ...makeSharedEsbuildOptions(root, { ...opts, outDir }),
      entryPoints: injectedEntries,
      outdir: outDir,
      format: 'iife',
      splitting: false,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Injected build failed: ${msg}`);
    log.error(`Injected build failed: ${msg}`);
  }
}
```

Replace this whole region with:

```typescript
const allEntries = discoverEntryPoints(srcDir);
const injectedEntries = discoverInjectedEntries(srcDir, log);
const { esmEntries, iifeEntries } = partitionEntriesForFormat(allEntries, injectedEntries);

if (Object.keys(esmEntries).length === 0 && Object.keys(iifeEntries).length === 0) {
  errors.push('No entry points found in src/');
  log.error('No entry points discovered');
  return { browser: opts.browser, outDir, duration: 0, files: [], errors };
}

// ─── Main ESM pass (background, UI) ────────────────────────────────────────
let result: esbuild.BuildResult | undefined;
if (Object.keys(esmEntries).length > 0) {
  try { result = await esbuild.build(makeBuildConfig(root, { ...opts, outDir }, esmEntries)); }
  catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg); log.error(`Build failed: ${msg}`);
    return { browser: opts.browser, outDir, duration: performance.now() - start, files: [], errors };
  }
}

// ─── IIFE pass (content + injected) ────────────────────────────────────────
if (Object.keys(iifeEntries).length > 0) {
  try {
    await esbuild.build({
      ...makeSharedEsbuildOptions(root, { ...opts, outDir }),
      entryPoints: iifeEntries,
      outdir: outDir,
      format: 'iife',
      splitting: false,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`IIFE build failed: ${msg}`);
    log.error(`IIFE build failed: ${msg}`);
  }
}
```

Key changes:
- `entries` renamed to `allEntries` to clarify it includes everything before partitioning.
- The "no entries" guard now checks both buckets.
- The main pass is gated on `esmEntries` being non-empty (a project that's only content + injected without background/UI is unusual but valid — e.g., a content-only utility extension).
- The IIFE log message is now generic ("IIFE build failed") since it covers both content and injected.
- `result` becomes optional; downstream `result.metafile` reads need to handle undefined.

If `result` is consumed later in the function for `files` aggregation:

```typescript
if (result.metafile) {
  for (const [p, m] of Object.entries(result.metafile.outputs)) files.push({ path: p, size: m.bytes });
}
```

Update to:

```typescript
if (result?.metafile) {
  for (const [p, m] of Object.entries(result.metafile.outputs)) files.push({ path: p, size: m.bytes });
}
```

(Read the file to confirm the exact location of the `result.metafile` consumer before editing.)

- [ ] **Step 2: Confirm `applyInjectedDefaults` still receives only injected map**

The `if (config.manifest)` block calls `applyInjectedDefaults(manifest, config.manifest, injectedEntries)`. `injectedEntries` (not `iifeEntries`) is the right argument — content scripts are not added to `web_accessible_resources`. Confirm the call still passes `injectedEntries` and not the merged map.

- [ ] **Step 3: Type-check**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Full test suite**

Run: `pnpm test`
Expected: all 138 tests pass (134 existing + 4 new from Task 1).

- [ ] **Step 5: Smoke check (optional, not committed)**

Create a temp project with `src/content.ts` and a minimal `extforge.config.ts`, build it, and confirm `dist/<browser>/content/index.js` is wrapped in `(()` or `(function` (IIFE).

- [ ] **Step 6: Commit**

`git add src/core/builder/index.ts`
`git commit -m "feat(builder): route content scripts through IIFE pass"`

No `Co-Authored-By` trailer.

---

## Task 3: Final verification

**Files:** none

- [ ] **Step 1: Run full suite**

`pnpm typecheck && pnpm test && pnpm build`
Expected: all pass.

- [ ] **Step 2: Confirm test counts**

Total tests: 138 (134 prior + 4 new for `partitionEntriesForFormat`).

- [ ] **Step 3: No commit**

Verification only. If any step fails, return to the offending task.
