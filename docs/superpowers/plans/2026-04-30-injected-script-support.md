# Injected Script Support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class support for injected (page-context) scripts to ExtForge — convention-based discovery of `src/injected.ts` or `src/injected/*.ts`, IIFE-format compilation, automatic `web_accessible_resources` population in the generated manifest, and dev-mode reload triggers.

**Architecture:** New `discoverInjectedEntries` helper in `builder/` produces a map of injected entries. The main `build()` function runs a second `esbuild.build()` pass with `format: 'iife'` after the existing ESM pass, using the same loader/define/alias options. Manifest auto-population is a small pure function in `manifest/generator.ts` that runs only when the user has not declared their own `webAccessibleResources`. HMR's `classifyChange` gets a new path pattern so injected file changes trigger `full-reload`.

**Tech Stack:** TypeScript (ESM), esbuild, Vitest. No new runtime dependencies.

**Spec reference:** `docs/superpowers/specs/2026-04-30-injected-script-support-design.md`

---

## File map

- Modify: `src/core/builder/constants.ts` — add `INJECTED_DIR`
- Modify: `src/core/builder/index.ts` — add `discoverInjectedEntries`, second esbuild pass, call to manifest auto-populator
- Modify: `src/core/manifest/generator.ts` — add `applyInjectedDefaults` pure function
- Modify: `src/core/manifest/index.ts` — re-export `applyInjectedDefaults`
- Modify: `src/core/hmr/constants.ts` — add `INJECTED_PATTERNS`
- Modify: `src/core/hmr/index.ts` — `classifyChange` matches injected paths as `full-reload`
- Modify: `tests/manifest.test.ts` — add tests for `applyInjectedDefaults`
- Modify: `tests/hmr.test.ts` — add tests for injected-path classification
- Create: `tests/builder.test.ts` — new test file for `discoverInjectedEntries`

---

## Task 1: Add `INJECTED_DIR` constant

**Files:**
- Modify: `src/core/builder/constants.ts`

- [ ] **Step 1: Add the constant**

Append to `src/core/builder/constants.ts` (after `ICON_SIZES`):

```typescript
/** Directory under src/ for multi-entry injected (page-context) scripts */
export const INJECTED_DIR = 'injected';
```

- [ ] **Step 2: Type-check**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

Use `git add src/core/builder/constants.ts` and `git commit -m "feat(builder): add INJECTED_DIR constant for injected entry discovery"`. No Co-Authored-By trailer.

---

## Task 2: Implement and test `discoverInjectedEntries`

**Files:**
- Modify: `src/core/builder/index.ts`
- Create: `tests/builder.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/builder.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverInjectedEntries } from '../src/core/builder/index.js';
import { createLogger, LogLevel } from '../src/core/logger/index.js';

function makeTempSrc(): string {
  const dir = mkdtempSync(join(tmpdir(), 'extforge-builder-'));
  const src = join(dir, 'src');
  mkdirSync(src, { recursive: true });
  return src;
}

const silentLog = createLogger({ scope: 'test', level: LogLevel.Silent });

describe('discoverInjectedEntries', () => {
  let srcDir: string;

  beforeEach(() => { srcDir = makeTempSrc(); });
  afterEach(() => { rmSync(srcDir, { recursive: true, force: true }); });

  it('returns empty when neither src/injected.ts nor src/injected/ exists', () => {
    expect(discoverInjectedEntries(srcDir, silentLog)).toEqual({});
  });

  it('discovers a single src/injected.ts as { injected: <path> }', () => {
    const file = join(srcDir, 'injected.ts');
    writeFileSync(file, '// noop');
    const result = discoverInjectedEntries(srcDir, silentLog);
    expect(result).toEqual({ injected: file });
  });

  it('discovers a single src/injected.tsx as { injected: <path> }', () => {
    const file = join(srcDir, 'injected.tsx');
    writeFileSync(file, '// noop');
    const result = discoverInjectedEntries(srcDir, silentLog);
    expect(result).toEqual({ injected: file });
  });

  it('discovers all .ts/.tsx children of src/injected/', () => {
    const dir = join(srcDir, 'injected');
    mkdirSync(dir);
    const a = join(dir, 'a.ts');
    const b = join(dir, 'b.tsx');
    writeFileSync(a, '// a');
    writeFileSync(b, '// b');
    const result = discoverInjectedEntries(srcDir, silentLog);
    expect(result).toEqual({ 'injected/a': a, 'injected/b': b });
  });

  it('ignores non-ts files in src/injected/', () => {
    const dir = join(srcDir, 'injected');
    mkdirSync(dir);
    writeFileSync(join(dir, 'a.ts'), '// a');
    writeFileSync(join(dir, 'README.md'), 'docs');
    writeFileSync(join(dir, 'data.json'), '{}');
    const result = discoverInjectedEntries(srcDir, silentLog);
    expect(Object.keys(result)).toEqual(['injected/a']);
  });

  it('does not recurse into subdirectories of src/injected/', () => {
    const dir = join(srcDir, 'injected');
    mkdirSync(dir);
    mkdirSync(join(dir, 'sub'));
    writeFileSync(join(dir, 'a.ts'), '// a');
    writeFileSync(join(dir, 'sub', 'nested.ts'), '// nested');
    const result = discoverInjectedEntries(srcDir, silentLog);
    expect(Object.keys(result)).toEqual(['injected/a']);
  });

  it('prefers directory mode and warns when both layouts exist', () => {
    const dir = join(srcDir, 'injected');
    mkdirSync(dir);
    writeFileSync(join(dir, 'a.ts'), '// a');
    writeFileSync(join(srcDir, 'injected.ts'), '// loose');

    const log = createLogger({ scope: 'test', level: LogLevel.Silent });
    const warn = vi.spyOn(log, 'warn');

    const result = discoverInjectedEntries(srcDir, log);
    expect(Object.keys(result)).toEqual(['injected/a']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/both .*injected\/.*injected\.ts/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test tests/builder.test.ts`
Expected: FAIL — `discoverInjectedEntries` is not exported from `../src/core/builder/index.js`.

- [ ] **Step 3: Implement `discoverInjectedEntries`**

In `src/core/builder/index.ts`, add `statSync` to the existing `node:fs` import line (currently imports `copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync`):

```typescript
import {
  copyFileSync, existsSync, mkdirSync, readdirSync, statSync,
  writeFileSync,
} from 'node:fs';
```

Add `INJECTED_DIR` to the existing imports from `./constants.js`:

```typescript
import { ESBUILD_TARGETS, ESBUILD_LOADERS, ENTRY_SCANS, HTML_DIRS, ICON_SIZES, INJECTED_DIR } from './constants.js';
```

Add the new function right after the existing `discoverEntryPoints` definition:

```typescript
export function discoverInjectedEntries(srcDir: string, log: Logger): Record<string, string> {
  const entries: Record<string, string> = {};
  const dir = join(srcDir, INJECTED_DIR);
  const looseTs  = join(srcDir, 'injected.ts');
  const looseTsx = join(srcDir, 'injected.tsx');

  if (existsSync(dir) && statSync(dir).isDirectory()) {
    if (existsSync(looseTs) || existsSync(looseTsx)) {
      log.warn('Both src/injected/ and src/injected.ts(x) exist; using directory mode and ignoring the loose file.');
    }
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isFile()) continue;
      const m = /^(.+)\.tsx?$/.exec(e.name);
      if (!m) continue;
      entries[`injected/${m[1]}`] = join(dir, e.name);
    }
    return entries;
  }

  if (existsSync(looseTs))  { entries['injected'] = looseTs;  return entries; }
  if (existsSync(looseTsx)) { entries['injected'] = looseTsx; return entries; }
  return entries;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/builder.test.ts`
Expected: 7 tests PASS.

- [ ] **Step 5: Run full test suite**

Run: `pnpm test`
Expected: all existing tests still pass plus 7 new ones.

- [ ] **Step 6: Commit**

`git add src/core/builder/index.ts tests/builder.test.ts`
`git commit -m "feat(builder): add discoverInjectedEntries for page-context script discovery"`

No Co-Authored-By trailer.

---

## Task 3: Add the second esbuild pass for injected scripts

**Files:**
- Modify: `src/core/builder/index.ts`

- [ ] **Step 1: Extract a shared esbuild options helper**

Add this helper just above the existing `makeBuildConfig` in `src/core/builder/index.ts`:

```typescript
function makeSharedEsbuildOptions(root: string, opts: BuildOptions): Pick<esbuild.BuildOptions,
  'bundle' | 'platform' | 'target' | 'sourcemap' | 'minify' | 'define' | 'alias' | 'loader' | 'jsx' | 'jsxImportSource' | 'logLevel' | 'metafile'
> {
  return {
    bundle: true,
    platform: 'browser',
    target: ESBUILD_TARGETS,
    sourcemap: opts.sourcemap ?? (opts.dev ? 'inline' : false),
    minify: opts.minify ?? !opts.dev,
    define: {
      'process.env.NODE_ENV': opts.dev ? '"development"' : '"production"',
      'process.env.BROWSER': `"${opts.browser}"`,
      '__DEV__': String(opts.dev),
      '__BROWSER__': `"${opts.browser}"`,
    },
    alias: { '@': resolve(root, 'src') },
    loader: ESBUILD_LOADERS as Record<string, esbuild.Loader>,
    jsx: 'automatic',
    jsxImportSource: 'react',
    logLevel: opts.dev ? 'warning' : 'error',
    metafile: true,
  };
}
```

Refactor `makeBuildConfig` to use it. Replace the existing function body:

```typescript
function makeBuildConfig(root: string, opts: BuildOptions, entries: Record<string, string>): esbuild.BuildOptions {
  const outDir = opts.outDir ?? join(root, 'dist', opts.browser);
  return {
    ...makeSharedEsbuildOptions(root, opts),
    entryPoints: entries,
    outdir: outDir,
    format: 'esm',
    splitting: false,
  };
}
```

- [ ] **Step 2: Add the second esbuild pass in `build()`**

Inside `build()`, find the block that runs the main `esbuild.build(makeBuildConfig(...))`. Immediately AFTER its try/catch and BEFORE the `processCSS` calls, add:

```typescript
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

- [ ] **Step 3: Type-check**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Run full test suite**

Run: `pnpm test`
Expected: all tests still pass.

- [ ] **Step 5: Commit**

`git add src/core/builder/index.ts`
`git commit -m "feat(builder): compile injected scripts as IIFE in a second esbuild pass"`

No Co-Authored-By trailer.

(End-to-end verification of the IIFE output is deferred to Task 7, where it's exercised against the manifest auto-population.)

---

## Task 4: Implement and test `applyInjectedDefaults`

**Files:**
- Modify: `src/core/manifest/generator.ts`
- Modify: `src/core/manifest/index.ts`
- Modify: `src/core/index.ts`
- Modify: `tests/manifest.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/manifest.test.ts`, add `applyInjectedDefaults` to the import block at the top of the file:

```typescript
import {
  generateManifest,
  validateManifestConfig,
  applyInjectedDefaults,
  ALL_BROWSERS,
  PERMISSION_GROUPS,
  type ManifestConfig,
  type Browser,
} from '../src/core/manifest/index.js';
```

Just BEFORE the closing brace of `describe('Manifest Engine', ...)`, add:

```typescript
  describe('applyInjectedDefaults', () => {
    it('does nothing when no injected entries exist', () => {
      const manifest: Record<string, unknown> = {};
      applyInjectedDefaults(manifest, validConfig, {});
      expect(manifest.web_accessible_resources).toBeUndefined();
    });

    it('does nothing when user already declared webAccessibleResources', () => {
      const manifest: Record<string, unknown> = {
        web_accessible_resources: [{ resources: ['user.js'], matches: ['https://example.com/*'] }],
      };
      const userConfig = {
        ...validConfig,
        webAccessibleResources: [{ resources: ['user.js'], matches: ['https://example.com/*'] }],
      };
      applyInjectedDefaults(manifest, userConfig, { injected: '/path/injected.ts' });
      expect(manifest.web_accessible_resources).toEqual([
        { resources: ['user.js'], matches: ['https://example.com/*'] },
      ]);
    });

    it('auto-populates with injected.js for single-entry mode', () => {
      const manifest: Record<string, unknown> = {};
      applyInjectedDefaults(manifest, validConfig, { injected: '/path/injected.ts' });
      expect(manifest.web_accessible_resources).toEqual([
        { resources: ['injected.js'], matches: ['<all_urls>'] },
      ]);
    });

    it('auto-populates with injected/<name>.js for multi-entry mode', () => {
      const manifest: Record<string, unknown> = {};
      applyInjectedDefaults(manifest, validConfig, {
        'injected/a': '/path/injected/a.ts',
        'injected/b': '/path/injected/b.tsx',
      });
      expect(manifest.web_accessible_resources).toEqual([
        { resources: ['injected/a.js', 'injected/b.js'], matches: ['<all_urls>'] },
      ]);
    });

    it('treats an empty webAccessibleResources array as "not declared"', () => {
      const manifest: Record<string, unknown> = {};
      const userConfig = { ...validConfig, webAccessibleResources: [] };
      applyInjectedDefaults(manifest, userConfig, { injected: '/path/injected.ts' });
      expect(manifest.web_accessible_resources).toEqual([
        { resources: ['injected.js'], matches: ['<all_urls>'] },
      ]);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test tests/manifest.test.ts`
Expected: FAIL — `applyInjectedDefaults` is not exported.

- [ ] **Step 3: Implement `applyInjectedDefaults`**

In `src/core/manifest/generator.ts`, append after the `generateManifest` function:

```typescript
// ─── Injected defaults ───────────────────────────────────────────────────────

/**
 * Auto-populate `web_accessible_resources` for injected (page-context) scripts.
 * No-ops if the user already declared a non-empty `webAccessibleResources` array
 * or if no injected entries exist.
 */
export function applyInjectedDefaults(
  manifest: Record<string, unknown>,
  userConfig: ManifestConfig,
  injectedEntries: Record<string, string>,
): void {
  if (Object.keys(injectedEntries).length === 0) return;
  if (userConfig.webAccessibleResources && userConfig.webAccessibleResources.length > 0) return;

  const resources = Object.keys(injectedEntries).map(key =>
    key === 'injected' ? 'injected.js' : `${key}.js`,
  );
  manifest.web_accessible_resources = [{ resources, matches: ['<all_urls>'] }];
}
```

- [ ] **Step 4: Re-export from manifest index**

Read `src/core/manifest/index.ts` first to see the existing export shape, then add `applyInjectedDefaults` to the line that re-exports `generateManifest, writeManifest, validateManifestConfig`.

- [ ] **Step 5: Re-export from core index**

Read `src/core/index.ts`. Find the line:

```typescript
export { generateManifest, writeManifest, validateManifestConfig, ALL_BROWSERS, AVAILABLE_PERMISSIONS, PERMISSION_GROUPS } from './manifest/index.js';
```

Add `applyInjectedDefaults` so it becomes:

```typescript
export { generateManifest, writeManifest, validateManifestConfig, applyInjectedDefaults, ALL_BROWSERS, AVAILABLE_PERMISSIONS, PERMISSION_GROUPS } from './manifest/index.js';
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm test tests/manifest.test.ts`
Expected: 5 new tests PASS plus all existing manifest tests.

- [ ] **Step 7: Run full suite**

Run: `pnpm test && pnpm typecheck`
Expected: all green.

- [ ] **Step 8: Commit**

`git add src/core/manifest/generator.ts src/core/manifest/index.ts src/core/index.ts tests/manifest.test.ts`
`git commit -m "feat(manifest): auto-populate web_accessible_resources for injected scripts"`

No Co-Authored-By trailer.

---

## Task 5: Wire `applyInjectedDefaults` into `build()`

**Files:**
- Modify: `src/core/builder/index.ts`

- [ ] **Step 1: Add the import**

In `src/core/builder/index.ts`, find the existing import from `../manifest/index.js`:

```typescript
import { type Browser, ALL_BROWSERS, generateManifest } from '../manifest/index.js';
```

Update to:

```typescript
import { type Browser, ALL_BROWSERS, generateManifest, applyInjectedDefaults } from '../manifest/index.js';
```

- [ ] **Step 2: Call `applyInjectedDefaults` before writing the manifest**

In `src/core/builder/index.ts`, find the `if (config.manifest)` block in `build()`. Currently:

```typescript
if (config.manifest) {
  const manifest = generateManifest(config.manifest, opts.browser);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
}
```

Replace with:

```typescript
if (config.manifest) {
  const manifest = generateManifest(config.manifest, opts.browser);
  applyInjectedDefaults(manifest, config.manifest, injectedEntries);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
}
```

`injectedEntries` is in scope from Task 3 (`const injectedEntries = discoverInjectedEntries(srcDir, log);`). Confirm by reading the function before editing.

- [ ] **Step 3: Type-check and test**

Run: `pnpm typecheck && pnpm test`
Expected: all pass.

- [ ] **Step 4: Commit**

`git add src/core/builder/index.ts`
`git commit -m "feat(builder): apply injected manifest defaults during build"`

No Co-Authored-By trailer.

---

## Task 6: HMR — classify injected paths as `full-reload`

**Files:**
- Modify: `src/core/hmr/constants.ts`
- Modify: `src/core/hmr/index.ts`
- Modify: `tests/hmr.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/hmr.test.ts`, add a new nested `describe` inside the existing `describe('Change Classification', ...)` block, right after the "Given a background script change" block:

```typescript
    describe('Given an injected script change', () => {
      it('should classify src/injected.ts as full-reload', () => {
        expect(classifyChange('src/injected.ts')).toBe('full-reload');
      });
      it('should classify src/injected.tsx as full-reload', () => {
        expect(classifyChange('src/injected.tsx')).toBe('full-reload');
      });
      it('should classify src/injected/foo.ts as full-reload', () => {
        expect(classifyChange('src/injected/foo.ts')).toBe('full-reload');
      });
      it('should classify nested src/injected/sub/bar.ts as full-reload', () => {
        // discoverInjectedEntries does not recurse, but watcher events for
        // nested files should still trigger the same reload class.
        expect(classifyChange('src/injected/sub/bar.ts')).toBe('full-reload');
      });
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test tests/hmr.test.ts`
Expected: FAIL — current classifier returns `'js'` for these paths.

- [ ] **Step 3: Add `INJECTED_PATTERNS` constant**

In `src/core/hmr/constants.ts`, add after `BACKGROUND_PATTERNS`:

```typescript
/** Path fragments that indicate an injected (page-context) script change (requires full reload) */
export const INJECTED_PATTERNS = ['/injected/', '/injected.'] as const;
```

- [ ] **Step 4: Update the classifier**

In `src/core/hmr/index.ts`, add `INJECTED_PATTERNS` to the existing imports from `./constants.js`. The current line:

```typescript
import {
  CSS_EXTENSIONS, ASSET_EXTENSIONS, BACKGROUND_PATTERNS,
  MANIFEST_PATTERNS, DEBOUNCE_MS, DEFAULT_HMR_PORT, WATCH_IGNORED,
} from './constants.js';
```

becomes:

```typescript
import {
  CSS_EXTENSIONS, ASSET_EXTENSIONS, BACKGROUND_PATTERNS, INJECTED_PATTERNS,
  MANIFEST_PATTERNS, DEBOUNCE_MS, DEFAULT_HMR_PORT, WATCH_IGNORED,
} from './constants.js';
```

Update `classifyChange`. Current:

```typescript
export function classifyChange(filePath: string): HMRUpdateType {
  const ext = extname(filePath);
  const normalized = filePath.replace(/\\/g, '/');

  if (MANIFEST_PATTERNS.some(p => normalized.includes(p)))   return 'manifest';
  if (BACKGROUND_PATTERNS.some(p => normalized.includes(p))) return 'full-reload';
  if (CSS_EXTENSIONS.has(ext))                                return 'css';
  if (ASSET_EXTENSIONS.has(ext))                              return 'assets';
  return 'js';
}
```

becomes:

```typescript
export function classifyChange(filePath: string): HMRUpdateType {
  const ext = extname(filePath);
  const normalized = filePath.replace(/\\/g, '/');

  if (MANIFEST_PATTERNS.some(p => normalized.includes(p)))   return 'manifest';
  if (BACKGROUND_PATTERNS.some(p => normalized.includes(p))) return 'full-reload';
  if (INJECTED_PATTERNS.some(p => normalized.includes(p)))   return 'full-reload';
  if (CSS_EXTENSIONS.has(ext))                                return 'css';
  if (ASSET_EXTENSIONS.has(ext))                              return 'assets';
  return 'js';
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test tests/hmr.test.ts`
Expected: 4 new tests PASS.

- [ ] **Step 6: Run full suite**

Run: `pnpm test && pnpm typecheck`
Expected: all green.

- [ ] **Step 7: Commit**

`git add src/core/hmr/constants.ts src/core/hmr/index.ts tests/hmr.test.ts`
`git commit -m "feat(hmr): classify injected script changes as full-reload"`

No Co-Authored-By trailer.

---

## Task 7: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full suite**

Run each, in order:

- `pnpm typecheck`
- `pnpm test`
- `pnpm lint`
- `pnpm build`

Expected: all pass with zero errors.

- [ ] **Step 2: Confirm test counts**

Inspect the test output. Expected new tests:
- `tests/builder.test.ts` — 7 tests for `discoverInjectedEntries`
- `tests/manifest.test.ts` — 5 new tests under `applyInjectedDefaults`
- `tests/hmr.test.ts` — 4 new tests under "Given an injected script change"

Total new tests: 16. All pre-existing tests must still pass.

- [ ] **Step 3: Confirm public API is exported**

Run `pnpm typecheck` again after a hypothetical consumer file would import `applyInjectedDefaults` from `extforge`. Check `src/core/index.ts` includes it in the manifest re-export. No commit needed — this is a read-only check.

- [ ] **Step 4: No commit needed**

This task is verification only. If any check fails, return to the offending task.
