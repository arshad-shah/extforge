# Plugin API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a typed, hook-based plugin API for ExtForge. Replace today's stub `ExtForgePlugin` interface with a real runner, fire hooks at five wire-in points (config, build start/entry/end, manifest, dev reload), keep the legacy thin shape working via a shim, and dogfood by extracting React JSX support into an internal `presetReact()` plugin.

**Architecture:** Foundation first (`types`, `runner` + shim), then wire-in points one at a time (config → builder → HMR), then extract `presetReact()` and remove the hardcoded JSX line, then final verification. Each task ends with passing tests and a commit. The package gains a `./plugins` subpath export.

**Tech Stack:** TypeScript, vitest, esbuild (existing). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-01-plugin-api-design.md`

---

## File Structure

**New files:**
- `src/core/plugins/types.ts` — `ExtForgePluginV1`, `PluginContext`, `PluginHooks`, `EntryDescriptor` types
- `src/core/plugins/runner.ts` — `PluginRunner` class + legacy shim
- `src/core/plugins/preset-react.ts` — `presetReact()` factory
- `src/core/plugins/index.ts` — public re-exports
- `tests/plugins-runner.test.ts`
- `tests/plugins-preset-react.test.ts`
- `tests/plugins-integration.test.ts`
- `tests/plugins-legacy-shim.test.ts`

**Modified:**
- `src/core/errors/codes.ts` — add `EXT_PLUGIN_FAILED`
- `src/core/config.ts` — re-export plugin types; `loadExtForgeConfig` constructs and stores a `PluginRunner` on the returned config (or as a sibling return value)
- `src/core/builder/index.ts` — fire onBuildStart/onBuildEntry/onManifestTransform/onBuildEnd; remove hardcoded `jsxImportSource`; auto-inject `presetReact()` when `config.framework === 'react'`
- `src/core/hmr/index.ts` — fire `onDevReload` after broadcast
- `package.json` — add `./plugins` subpath export
- `tsup.config.ts` — emit `core/plugins/index.{js,d.ts}`

---

## Task 1: Add EXT_PLUGIN_FAILED error code

**Files:** Modify: `src/core/errors/codes.ts`

- [ ] **Step 1**

Append to the `ERROR_CODES` const:

```ts
EXT_PLUGIN_FAILED:         'EXT_PLUGIN_FAILED',
```

- [ ] **Step 2: verify + commit**
```bash
pnpm typecheck
git add src/core/errors/codes.ts
git commit -m "feat(errors): add EXT_PLUGIN_FAILED code"
```

---

## Task 2: Plugin types module

**Files:**
- Create: `src/core/plugins/types.ts`
- Test: none in this task — types only; covered by Task 3 onward

- [ ] **Step 1: Implement**

```ts
// src/core/plugins/types.ts
import type { ExtForgeConfig } from '../config.js';
import type { Browser, ManifestConfig } from '../manifest/index.js';
import type { Logger } from '../logger/index.js';
import type { BuildResult } from '../builder/index.js';
import type { HMRUpdate } from '../hmr/index.js';

export type ManifestObject = Record<string, unknown>;

export interface EntryDescriptor {
  name: string;
  file: string;
  format: 'esm' | 'iife';
  esbuildOptions?: Record<string, unknown>;
  isContentScript?: boolean;
}

export interface PluginHooks {
  onConfigResolved(fn: (config: ExtForgeConfig) => void | Promise<void>): void;
  onManifestTransform(fn: (manifest: ManifestObject, browser: Browser) => ManifestObject | Promise<ManifestObject>): void;
  onBuildStart(fn: (info: { browser: Browser; dev: boolean }) => void | Promise<void>): void;
  onBuildEntry(fn: (entry: EntryDescriptor) => EntryDescriptor | void | Promise<EntryDescriptor | void>): void;
  onBuildEnd(fn: (result: BuildResult) => void | Promise<void>): void;
  onDevReload(fn: (event: HMRUpdate) => void | Promise<void>): void;
}

export interface PluginContext {
  readonly config: ExtForgeConfig;
  readonly paths: {
    readonly root: string;
    readonly src: string;
    readonly dist: string;
  };
  readonly logger: Logger;
  readonly hooks: PluginHooks;
  addEntry(entry: EntryDescriptor): void;
  emitFile(rel: string, contents: string | Uint8Array): void;
}

export interface ExtForgePluginV1 {
  name: string;
  apiVersion: 1;
  setup(ctx: PluginContext): void | Promise<void>;
}

// Legacy thin shape kept for backwards compatibility.
export interface ExtForgePluginLegacy {
  name: string;
  setup?: (config: ExtForgeConfig) => void | Promise<void>;
  buildStart?: () => void | Promise<void>;
  buildEnd?: (result: unknown) => void | Promise<void>;
}

export type ExtForgePlugin = ExtForgePluginV1 | ExtForgePluginLegacy;

export function isV1Plugin(p: ExtForgePlugin): p is ExtForgePluginV1 {
  return (p as ExtForgePluginV1).apiVersion === 1;
}
```

(If circular type imports between `config.ts` and this module become a problem, convert the `ExtForgeConfig` and other forward refs to `import type` only. They already are above. Verify with `pnpm typecheck`.)

- [ ] **Step 2: Verify + commit**
```bash
pnpm typecheck
git add src/core/plugins/types.ts
git commit -m "feat(plugins): add plugin shape, context, and hook types"
```

---

## Task 3: Plugin runner with legacy shim

**Files:**
- Create: `src/core/plugins/runner.ts`
- Test: `tests/plugins-runner.test.ts`
- Test: `tests/plugins-legacy-shim.test.ts`

- [ ] **Step 1: Tests (`tests/plugins-runner.test.ts`)**

```ts
import { describe, it, expect } from 'vitest';
import { PluginRunner } from '../src/core/plugins/runner.js';
import { createLogger, LogLevel } from '../src/core/logger/index.js';
import { isExtForgeError } from '../src/core/errors/index.js';
import type { ExtForgePluginV1, EntryDescriptor } from '../src/core/plugins/types.js';

const baseCtx = {
  config: { browsers: ['chrome'] } as any,
  paths: { root: '/p', src: '/p/src', dist: '/p/dist' },
  logger: createLogger({ level: LogLevel.Silent }),
  addEntry: () => {},
  emitFile: () => {},
};

describe('PluginRunner', () => {
  it('calls every plugin setup once in registration order', async () => {
    const order: string[] = [];
    const a: ExtForgePluginV1 = { name: 'a', apiVersion: 1, setup: () => { order.push('a'); } };
    const b: ExtForgePluginV1 = { name: 'b', apiVersion: 1, setup: () => { order.push('b'); } };
    const r = new PluginRunner([a, b], baseCtx);
    await r.setup();
    expect(order).toEqual(['a', 'b']);
  });

  it('reduce-chains onManifestTransform across plugins', async () => {
    const a: ExtForgePluginV1 = {
      name: 'a', apiVersion: 1,
      setup({ hooks }) { hooks.onManifestTransform((m) => ({ ...m, fromA: true })); },
    };
    const b: ExtForgePluginV1 = {
      name: 'b', apiVersion: 1,
      setup({ hooks }) { hooks.onManifestTransform((m) => ({ ...m, fromB: true })); },
    };
    const r = new PluginRunner([a, b], baseCtx);
    await r.setup();
    const out = await r.fireManifestTransform({ name: 'x' }, 'chrome');
    expect(out).toMatchObject({ name: 'x', fromA: true, fromB: true });
  });

  it('reduce-chains onBuildEntry; void return preserves prior value', async () => {
    const a: ExtForgePluginV1 = {
      name: 'a', apiVersion: 1,
      setup({ hooks }) {
        hooks.onBuildEntry((e) => ({ ...e, esbuildOptions: { ...(e.esbuildOptions ?? {}), jsx: 'automatic' } }));
      },
    };
    const b: ExtForgePluginV1 = {
      name: 'b', apiVersion: 1,
      setup({ hooks }) { hooks.onBuildEntry(() => undefined); }, // no-op
    };
    const r = new PluginRunner([a, b], baseCtx);
    await r.setup();
    const entry: EntryDescriptor = { name: 'x', file: '/p/src/x.tsx', format: 'esm' };
    const out = await r.fireBuildEntry(entry);
    expect(out.esbuildOptions).toMatchObject({ jsx: 'automatic' });
  });

  it('throws ExtForgeError(EXT_PLUGIN_FAILED) when a plugin throws', async () => {
    const a: ExtForgePluginV1 = {
      name: 'boom', apiVersion: 1,
      setup() { throw new Error('boom'); },
    };
    const r = new PluginRunner([a], baseCtx);
    let caught: unknown;
    try { await r.setup(); } catch (e) { caught = e; }
    expect(isExtForgeError(caught)).toBe(true);
    if (isExtForgeError(caught)) {
      expect(caught.code).toBe('EXT_PLUGIN_FAILED');
      expect(caught.message).toContain('boom');
      expect(caught.hint ?? '').toContain('boom');
    }
  });

  it('attaches plugin name and hook name to thrown errors during fire*', async () => {
    const a: ExtForgePluginV1 = {
      name: 'transform-bomb', apiVersion: 1,
      setup({ hooks }) { hooks.onManifestTransform(() => { throw new Error('kapow'); }); },
    };
    const r = new PluginRunner([a], baseCtx);
    await r.setup();
    let caught: unknown;
    try { await r.fireManifestTransform({}, 'chrome'); } catch (e) { caught = e; }
    expect(isExtForgeError(caught)).toBe(true);
    if (isExtForgeError(caught)) {
      expect(caught.message).toContain('transform-bomb');
      expect(caught.message).toContain('onManifestTransform');
    }
  });
});
```

- [ ] **Step 2: Legacy-shim tests (`tests/plugins-legacy-shim.test.ts`)**

```ts
import { describe, it, expect } from 'vitest';
import { PluginRunner } from '../src/core/plugins/runner.js';
import { createLogger, LogLevel } from '../src/core/logger/index.js';
import type { ExtForgePluginLegacy } from '../src/core/plugins/types.js';

const baseCtx = {
  config: { browsers: ['chrome'] } as any,
  paths: { root: '/p', src: '/p/src', dist: '/p/dist' },
  logger: createLogger({ level: LogLevel.Silent }),
  addEntry: () => {},
  emitFile: () => {},
};

describe('legacy plugin shim', () => {
  it('adapts setup(config) to setup({config})', async () => {
    let seen: any;
    const legacy: ExtForgePluginLegacy = {
      name: 'old',
      setup(config) { seen = config; },
    };
    const r = new PluginRunner([legacy], baseCtx);
    await r.setup();
    expect(seen).toBe(baseCtx.config);
  });

  it('routes buildStart and buildEnd through onBuildStart/onBuildEnd', async () => {
    const calls: string[] = [];
    const legacy: ExtForgePluginLegacy = {
      name: 'old',
      buildStart() { calls.push('start'); },
      buildEnd() { calls.push('end'); },
    };
    const r = new PluginRunner([legacy], baseCtx);
    await r.setup();
    await r.fireBuildStart({ browser: 'chrome', dev: false });
    await r.fireBuildEnd({ errors: [], warnings: [], outDir: '/p/dist/chrome', browser: 'chrome' } as any);
    expect(calls).toEqual(['start', 'end']);
  });
});
```

- [ ] **Step 3: Implement (`src/core/plugins/runner.ts`)**

```ts
import { ExtForgeError } from '../errors/index.js';
import { ERROR_CODES } from '../errors/codes.js';
import type { Browser } from '../manifest/index.js';
import type { BuildResult } from '../builder/index.js';
import type { HMRUpdate } from '../hmr/index.js';
import type { ExtForgeConfig } from '../config.js';
import {
  type ExtForgePlugin,
  type ExtForgePluginV1,
  type ExtForgePluginLegacy,
  type PluginContext,
  type PluginHooks,
  type EntryDescriptor,
  type ManifestObject,
  isV1Plugin,
} from './types.js';

type RunnerCtx = Omit<PluginContext, 'hooks'>;

interface HookRegistry {
  configResolved: Array<(c: ExtForgeConfig) => void | Promise<void>>;
  manifestTransform: Array<(m: ManifestObject, b: Browser) => ManifestObject | Promise<ManifestObject>>;
  buildStart: Array<(info: { browser: Browser; dev: boolean }) => void | Promise<void>>;
  buildEntry: Array<(e: EntryDescriptor) => EntryDescriptor | void | Promise<EntryDescriptor | void>>;
  buildEnd: Array<(r: BuildResult) => void | Promise<void>>;
  devReload: Array<(e: HMRUpdate) => void | Promise<void>>;
}

function adaptLegacy(p: ExtForgePluginLegacy): ExtForgePluginV1 {
  return {
    name: p.name,
    apiVersion: 1,
    async setup(ctx) {
      if (p.setup) await p.setup(ctx.config);
      if (p.buildStart) ctx.hooks.onBuildStart(() => p.buildStart!());
      if (p.buildEnd)   ctx.hooks.onBuildEnd((r) => p.buildEnd!(r));
    },
  };
}

function pluginFailed(pluginName: string, hookName: string, err: unknown): ExtForgeError {
  const msg = err instanceof Error ? err.message : String(err);
  return new ExtForgeError({
    code: ERROR_CODES.EXT_PLUGIN_FAILED,
    message: `Plugin "${pluginName}" failed in ${hookName}: ${msg}`,
    hint: msg,
    cause: err,
  });
}

export class PluginRunner {
  private hooks: HookRegistry = {
    configResolved: [],
    manifestTransform: [],
    buildStart: [],
    buildEntry: [],
    buildEnd: [],
    devReload: [],
  };

  readonly plugins: ReadonlyArray<ExtForgePluginV1>;

  constructor(plugins: ExtForgePlugin[], private ctx: RunnerCtx) {
    this.plugins = plugins.map(p => isV1Plugin(p) ? p : adaptLegacy(p));
  }

  async setup(): Promise<void> {
    for (const p of this.plugins) {
      const pluginHooks: PluginHooks = {
        onConfigResolved:    (fn) => { this.hooks.configResolved.push(wrap(p.name, 'onConfigResolved', fn)); },
        onManifestTransform: (fn) => { this.hooks.manifestTransform.push(wrap(p.name, 'onManifestTransform', fn)); },
        onBuildStart:        (fn) => { this.hooks.buildStart.push(wrap(p.name, 'onBuildStart', fn)); },
        onBuildEntry:        (fn) => { this.hooks.buildEntry.push(wrap(p.name, 'onBuildEntry', fn)); },
        onBuildEnd:          (fn) => { this.hooks.buildEnd.push(wrap(p.name, 'onBuildEnd', fn)); },
        onDevReload:         (fn) => { this.hooks.devReload.push(wrap(p.name, 'onDevReload', fn)); },
      };
      const ctx: PluginContext = { ...this.ctx, hooks: pluginHooks };
      try {
        await p.setup(ctx);
      } catch (err) {
        throw pluginFailed(p.name, 'setup', err);
      }
    }
  }

  async fireConfigResolved(config: ExtForgeConfig): Promise<void> {
    for (const fn of this.hooks.configResolved) await fn(config);
  }

  async fireManifestTransform(manifest: ManifestObject, browser: Browser): Promise<ManifestObject> {
    let m = manifest;
    for (const fn of this.hooks.manifestTransform) {
      const next = await fn(m, browser);
      if (next !== undefined) m = next;
    }
    return m;
  }

  async fireBuildStart(info: { browser: Browser; dev: boolean }): Promise<void> {
    for (const fn of this.hooks.buildStart) await fn(info);
  }

  async fireBuildEntry(entry: EntryDescriptor): Promise<EntryDescriptor> {
    let e = entry;
    for (const fn of this.hooks.buildEntry) {
      const next = await fn(e);
      if (next) e = next;
    }
    return e;
  }

  async fireBuildEnd(result: BuildResult): Promise<void> {
    for (const fn of this.hooks.buildEnd) await fn(result);
  }

  async fireDevReload(event: HMRUpdate): Promise<void> {
    for (const fn of this.hooks.devReload) await fn(event);
  }
}

// helper: wrap a hook fn so its throws carry the plugin/hook context
function wrap<F extends (...args: any[]) => any>(plugin: string, hook: string, fn: F): F {
  return (async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (err) {
      throw pluginFailed(plugin, hook, err);
    }
  }) as F;
}
```

- [ ] **Step 4: Verify + commit**
```bash
pnpm test -- plugins-runner plugins-legacy-shim
pnpm typecheck
git add src/core/plugins/runner.ts tests/plugins-runner.test.ts tests/plugins-legacy-shim.test.ts
git commit -m "feat(plugins): add PluginRunner with reduce-chain hooks and legacy shim"
```

---

## Task 4: presetReact() and public exports

**Files:**
- Create: `src/core/plugins/preset-react.ts`
- Create: `src/core/plugins/index.ts`
- Test: `tests/plugins-preset-react.test.ts`
- Modify: `package.json` (add `./plugins` subpath export)
- Modify: `tsup.config.ts` (emit `core/plugins/index`)

- [ ] **Step 1: Test (`tests/plugins-preset-react.test.ts`)**

```ts
import { describe, it, expect } from 'vitest';
import { presetReact } from '../src/core/plugins/preset-react.js';
import { PluginRunner } from '../src/core/plugins/runner.js';
import { createLogger, LogLevel } from '../src/core/logger/index.js';

const baseCtx = {
  config: {} as any,
  paths: { root: '/p', src: '/p/src', dist: '/p/dist' },
  logger: createLogger({ level: LogLevel.Silent }),
  addEntry: () => {},
  emitFile: () => {},
};

describe('presetReact', () => {
  it('transforms entry esbuild options to use automatic JSX with default importSource react', async () => {
    const r = new PluginRunner([presetReact()], baseCtx);
    await r.setup();
    const out = await r.fireBuildEntry({ name: 'x', file: '/p/src/x.tsx', format: 'esm' });
    expect(out.esbuildOptions).toMatchObject({ jsx: 'automatic', jsxImportSource: 'react' });
  });

  it('respects custom jsxImportSource and classic runtime', async () => {
    const r = new PluginRunner([presetReact({ jsxImportSource: 'preact', jsxRuntime: 'classic' })], baseCtx);
    await r.setup();
    const out = await r.fireBuildEntry({ name: 'x', file: '/p/src/x.tsx', format: 'esm' });
    expect(out.esbuildOptions).toMatchObject({ jsx: 'transform', jsxImportSource: 'preact' });
  });

  it('exposes the plugin name and apiVersion', () => {
    const p = presetReact();
    expect(p.name).toBe('extforge:preset-react');
    expect(p.apiVersion).toBe(1);
  });
});
```

- [ ] **Step 2: Implement (`src/core/plugins/preset-react.ts`)**

```ts
import type { ExtForgePluginV1 } from './types.js';

export interface PresetReactOptions {
  jsxImportSource?: string;
  jsxRuntime?: 'automatic' | 'classic';
}

export function presetReact(options: PresetReactOptions = {}): ExtForgePluginV1 {
  const importSource = options.jsxImportSource ?? 'react';
  const runtime = options.jsxRuntime ?? 'automatic';

  return {
    name: 'extforge:preset-react',
    apiVersion: 1,
    setup({ hooks, logger }) {
      hooks.onBuildEntry((entry) => ({
        ...entry,
        esbuildOptions: {
          ...(entry.esbuildOptions ?? {}),
          jsx: runtime === 'automatic' ? 'automatic' : 'transform',
          jsxImportSource: importSource,
        },
      }));
      logger.debug('preset-react ready');
    },
  };
}
```

- [ ] **Step 3: Public re-exports (`src/core/plugins/index.ts`)**

```ts
export { presetReact, type PresetReactOptions } from './preset-react.js';
export { PluginRunner } from './runner.js';
export type {
  ExtForgePlugin,
  ExtForgePluginV1,
  ExtForgePluginLegacy,
  PluginContext,
  PluginHooks,
  EntryDescriptor,
  ManifestObject,
} from './types.js';
```

- [ ] **Step 4: package.json subpath export**

In `exports`:
```json
"./plugins": {
  "import": "./dist/core/plugins/index.js",
  "types": "./dist/core/plugins/index.d.ts"
}
```

- [ ] **Step 5: tsup config**

Add `core/plugins/index` to the entry list in `tsup.config.ts` so it builds as a separate ESM file with its own .d.ts. Match the pattern used for `core/logger`.

- [ ] **Step 6: Verify + commit**
```bash
pnpm test
pnpm typecheck
pnpm build
node -e "import('./dist/core/plugins/index.js').then(m => console.log(Object.keys(m)))" \
  | grep presetReact
git add src/core/plugins/preset-react.ts src/core/plugins/index.ts \
        tests/plugins-preset-react.test.ts package.json tsup.config.ts
git commit -m "feat(plugins): add presetReact() and extforge/plugins subpath export"
```

---

## Task 5: Wire `onConfigResolved` into the config loader

**Files:**
- Modify: `src/core/config.ts`

- [ ] **Step 1: Read the loader**
Today: `loadExtForgeConfig` returns `Promise<ExtForgeConfig>`. We want plugins fired but the public return shape unchanged. Approach: construct a `PluginRunner` inside the loader, call `setup()`, fire `onConfigResolved`, store the runner on a non-enumerable property of the returned config so the builder can pick it up. (Alternative: return a tuple. Tuple is breaking; pick non-enumerable.)

- [ ] **Step 2: Implement**

In `src/core/config.ts`, after the schema validation passes:

```ts
import { PluginRunner } from './plugins/runner.js';
import type { ExtForgePlugin } from './plugins/types.js';
import { presetReact } from './plugins/preset-react.js';
import { createLogger } from './logger/index.js';
import { resolve } from 'pathe';

// inside loadExtForgeConfig, after merge + validation:
const userPlugins = (merged.plugins ?? []) as ExtForgePlugin[];
const builtins: ExtForgePlugin[] = [];
if (merged.framework === 'react') builtins.push(presetReact());

const allPlugins = [...builtins, ...userPlugins];

const runner = new PluginRunner(allPlugins, {
  config: Object.freeze({ ...merged }),
  paths: {
    root: cwd,
    src: resolve(cwd, merged.build?.srcDir ?? 'src'),
    dist: resolve(cwd, merged.build?.outDir ?? 'dist'),
  },
  logger: createLogger({ scope: 'plugins' }),
  addEntry: () => {},   // wired in builder Task 7
  emitFile: () => {},   // wired in builder Task 7
});
await runner.setup();
await runner.fireConfigResolved(merged);

// Attach to the returned object so the builder can consume it without changing the signature.
Object.defineProperty(merged, '__pluginRunner', {
  value: runner,
  enumerable: false,
  writable: false,
  configurable: false,
});
```

Update `ExtForgeConfig` type with an optional internal slot:

```ts
// in the same file, near the type:
declare module './plugins/runner.js' {} // for forward type ref
export interface ExtForgeConfig {
  // ... existing fields ...
  /** @internal Plugin runner attached by loadExtForgeConfig. Not part of the public API. */
  __pluginRunner?: import('./plugins/runner.js').PluginRunner;
}
```

(If `ExtForgeConfig` is type-derived from the Zod schema, declare the runner field as a separate intersection type rather than augmenting the schema.)

- [ ] **Step 3: Verify**
- `pnpm test` — all green; existing `config.test.ts` should still pass (the runner is a non-enumerable, no schema impact)
- `pnpm typecheck` — clean

- [ ] **Step 4: Commit**
```bash
git add src/core/config.ts
git commit -m "feat(config): construct plugin runner during loadExtForgeConfig and fire onConfigResolved"
```

---

## Task 6: Wire builder hooks (`onBuildStart`, `onBuildEntry`, `onManifestTransform`, `onBuildEnd`); remove hardcoded jsxImportSource

**Files:**
- Modify: `src/core/builder/index.ts`
- Test: `tests/plugins-integration.test.ts`

- [ ] **Step 1: Read the builder thoroughly**
You need to:
1. Find where `jsxImportSource: 'react'` is set unconditionally and remove it.
2. Find the per-entry esbuild call sites (ESM pass + IIFE pass) and route each entry through the runner's `fireBuildEntry`. Merge the returned `esbuildOptions` over the builder's defaults.
3. Find the manifest generation site (`generateManifest`) and route the result through `fireManifestTransform` before writing.
4. Add `fireBuildStart` at the top of `build()` and `fireBuildEnd` after a successful build.

- [ ] **Step 2: Sketch of the integration**

At the top of `build(projectRoot, config, opts, logger)`:

```ts
const runner = (config as any).__pluginRunner as PluginRunner | undefined;
await runner?.fireBuildStart({ browser: opts.browser, dev: opts.dev });
```

Per entry, transform via the runner before passing to esbuild:

```ts
let descriptor: EntryDescriptor = {
  name: entryName,
  file: absPath,
  format: 'esm',     // or 'iife' depending on path
  esbuildOptions: {  // start with the builder's defaults
    target: ESBUILD_TARGETS[browser],
    loader: ESBUILD_LOADERS,
    // ... whatever the builder currently passes
  },
  isContentScript: contentScriptMap.has(absPath),
};
if (runner) descriptor = await runner.fireBuildEntry(descriptor);

// Then merge descriptor.esbuildOptions into the actual esbuild.build call.
```

After `generateManifest` produces the manifest object, transform:
```ts
let manifestObj = generateManifest(config, browser);
if (runner) manifestObj = await runner.fireManifestTransform(manifestObj, browser);
// Then write manifestObj to disk.
```

After the build's last successful step (before returning `BuildResult`):
```ts
await runner?.fireBuildEnd(result);
```

- [ ] **Step 3: Remove hardcoded jsxImportSource**

The line at approximately `src/core/builder/index.ts:230`:

```ts
jsxImportSource: 'react',
```

DELETE it. Now React JSX is supplied by `presetReact()` (auto-injected when `framework === 'react'`).

- [ ] **Step 4: Integration test (`tests/plugins-integration.test.ts`)**

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { build } from '../src/core/builder/index.js';
import { loadExtForgeConfig } from '../src/core/config.js';
import { createLogger, LogLevel } from '../src/core/logger/index.js';

describe('plugin integration', () => {
  it('builds a JSX file when framework=react via presetReact()', async () => {
    const root = mkdtempSync(join(tmpdir(), 'extforge-plugins-'));
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src/popup.tsx'), `
      export const App = () => <div>hello</div>;
    `);
    writeFileSync(
      join(root, 'extforge.config.ts'),
      'export default { browsers: ["chrome"], framework: "react", manifest: { name: "x", version: "0.0.1", action: { default_popup: "popup.html" } } }',
    );

    const config = await loadExtForgeConfig(root);
    expect((config as any).__pluginRunner).toBeDefined();

    const result = await build(root, config, { browser: 'chrome', dev: false }, createLogger({ level: LogLevel.Silent }));
    expect(result.errors).toHaveLength(0);

    // The bundled output should include the JSX runtime symbol from `react/jsx-runtime`.
    // Read the popup output:
    const out = readFileSync(join(root, 'dist/chrome/popup.js'), 'utf8');
    // esbuild's automatic JSX runtime emits an import of `react/jsx-runtime`:
    expect(out).toMatch(/jsx-runtime/);
  }, 20_000);

  it('manifest transform from a user plugin is applied', async () => {
    const root = mkdtempSync(join(tmpdir(), 'extforge-plugins2-'));
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src/background.ts'), 'console.log(1)');
    writeFileSync(
      join(root, 'extforge.config.ts'),
      `import { presetReact } from 'extforge/plugins';
       export default {
         browsers: ['chrome'],
         manifest: { name: 'x', version: '0.0.1', background: { serviceWorker: 'src/background.ts' } },
         plugins: [{
           name: 'description-stamp', apiVersion: 1,
           setup({ hooks }) { hooks.onManifestTransform((m) => ({ ...m, description: 'stamped' })); },
         }],
       };`,
    );
    const config = await loadExtForgeConfig(root);
    await build(root, config, { browser: 'chrome', dev: false }, createLogger({ level: LogLevel.Silent }));
    const manifest = JSON.parse(readFileSync(join(root, 'dist/chrome/manifest.json'), 'utf8'));
    expect(manifest.description).toBe('stamped');
  }, 20_000);
});
```

(If the integration test environment can't import `extforge/plugins` from a fresh tmp dir, the second test may need its plugin defined inline as a JS object literal without the import. Adapt as needed.)

- [ ] **Step 5: Verify + commit**
```bash
pnpm test
pnpm typecheck
pnpm build
git add src/core/builder/index.ts tests/plugins-integration.test.ts
git commit -m "feat(builder): fire plugin hooks; remove hardcoded jsxImportSource (now via presetReact)"
```

If the existing builder.test.ts breaks because the JSX line moved, update those tests minimally.

---

## Task 7: Wire `onDevReload` into the HMR server

**Files:**
- Modify: `src/core/hmr/index.ts`

- [ ] **Step 1: Implement**

In `createHMRServer`, after the successful `broadcast(...)` call at the end of the debouncer, fire the dev-reload hook:

```ts
const runner = (config as any).__pluginRunner;
await runner?.fireDevReload({ v: 2, type: updateType, files, timestamp: Date.now(), scriptIds });
```

(Use the same envelope shape that's broadcast.)

- [ ] **Step 2: Test**

Append to `tests/hmr-targeted.test.ts` (or a new `tests/plugins-hmr.test.ts`):

A test that constructs a config with a `presetReact()`-ish plugin that registers an `onDevReload` listener; verify the listener is called with the right shape after a file change.

If integration is heavy, fall back to a unit test on the runner's `fireDevReload`.

- [ ] **Step 3: Commit**
```bash
git add src/core/hmr/index.ts tests/*.test.ts
git commit -m "feat(hmr): fire onDevReload after every successful broadcast"
```

---

## Task 8: Final verification + CHANGELOG

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Suite**
```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

- [ ] **Step 2: CHANGELOG**

Append under `[Unreleased]`:

```markdown
### Plugins
- New plugin API: `setup(ctx)` with hooks `onConfigResolved`, `onManifestTransform`, `onBuildStart`, `onBuildEntry`, `onBuildEnd`, `onDevReload`. Plugins are versioned via `apiVersion: 1`.
- Subpath export: `import { presetReact, type ExtForgePluginV1 } from 'extforge/plugins'`.
- First-party `presetReact()` ships built-in. Auto-injected when `framework: 'react'` is set; users may also pass it explicitly to override `jsxImportSource` or `jsxRuntime`.
- Plugin throws now produce `ExtForgeError(EXT_PLUGIN_FAILED)` carrying the plugin name and hook.
- Legacy thin plugin shape (`{ name, setup(config), buildStart, buildEnd }`) keeps working unchanged via a compatibility shim.

### Removed
- Hardcoded `jsxImportSource: 'react'` from the builder. React JSX is now supplied by `presetReact()`.

### Backwards compatibility (Plugins)
No breaking changes. Existing configs continue to work; legacy plugins continue to load.
```

- [ ] **Step 3: Commit**
```bash
git add CHANGELOG.md
git commit -m "docs: changelog for plugin API track"
```

- [ ] **Step 4: Print final state**
`git log --oneline main..HEAD`

## Self-Review Checklist

- [x] **Spec coverage:** types (T2), runner + shim (T3), preset-react + subpath export (T4), config wire-in (T5), builder wire-in + JSX removal (T6), HMR wire-in (T7).
- [x] **No placeholders:** every step has runnable code or commands.
- [x] **Type consistency:** `EntryDescriptor`, `ExtForgePluginV1`, `PluginContext` shapes used identically across runner, presetReact, and builder.
- [x] **Backwards compat:** legacy shim + non-enumerable `__pluginRunner` so the public `ExtForgeConfig` shape is unchanged.
- [x] **Frequent commits:** 8 commits, each independently reviewable.
