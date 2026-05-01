# Design: Plugin API

**Date:** 2026-05-01 (deepened from outline)
**Status:** Approved for implementation planning
**Repo:** `Documents/practice/extforge`
**Track:** 3 of 5

## Problem

Every "make ExtForge also do X" request currently competes for room in core. The current `ExtForgePlugin` interface in `src/core/config.ts` is a stub — declared, accepted in config, but never invoked. Framework presets (React, Vue, Svelte, Solid), CSS strategies (Tailwind), and one-off transforms all live as conditional branches in `src/core/builder/index.ts` and `src/core/scaffold/index.ts`. This will not scale.

A small, typed plugin API lets first-party behavior get extracted as plugins (dogfooding) and lets users solve their own problems without forking. It also unblocks Track 4 (testing helpers — `chrome.*` API fakes can ship as a plugin), Track 5 (docs site auto-generates plugin API reference), and a future React Fast Refresh integration.

This track ships the API and proves it by routing the existing React/Tailwind support through one internal plugin (`presetReact()`). It deliberately does NOT restructure the repo into a workspace or publish separate `@extforge/preset-*` packages — that's a Track 6 follow-up if and when the API stabilizes.

## Goals

- A minimal, typed plugin shape with `name`, `apiVersion`, and `setup(ctx)`.
- A typed `PluginContext` that exposes: logger, paths, resolved config (read-only), and named hooks.
- Hook execution: in plugin-registration order; reduce-style chain for transformers; fail loud on plugin throws.
- One internal plugin (`presetReact()`) extracted out of `src/core/builder/index.ts` to prove the API works end-to-end.
- The existing thin `ExtForgePlugin` shape (with bare `setup(config)`, `buildStart`, `buildEnd`) keeps working via a compatibility shim — no user upgrade required.
- Plugins covered by tests: a fixture project loads a plugin, the plugin's hooks fire, the build output reflects the plugin's transforms.

## Non-goals

- **Vite-style universal plugin compatibility.** We are not promising Rollup/Vite plugins work. ExtForge plugins are ExtForge-specific.
- **Browser-side / runtime plugin API.** Plugins run in the build process. They cannot inject content-script behavior at runtime — that's what content scripts are for.
- **A monorepo / packages/ workspace.** Out of scope for this track. Plugins live in `src/core/plugins/` for v1; we move them to `packages/` only if and when we publish them separately.
- **Vue / Svelte / Solid presets.** Partial framework support today gets cleaned up *behind* the new API (i.e., the existing branches remain, but they're routed through `presetReact()`-style adapters in a follow-up). Only React is extracted in this track.
- **A plugin marketplace or discovery service.** Plugins are imported directly.

## Backwards-compatibility constraint

- `plugins?: ExtForgePlugin[]` is already in the schema. The thin shape (`setup(config)`, `buildStart`, `buildEnd`) keeps working unchanged via a compatibility shim that adapts old plugins to the new `setup(ctx)` shape internally.
- Existing built-in behaviors (React JSX, Tailwind, manifest defaults) keep working unchanged from the user's perspective. Internally they may be implemented as plugins; the user-visible config doesn't change.
- The plugin API itself is versioned: `apiVersion: 1`. Future incompatible changes ship as `apiVersion: 2` with both supported for one minor version.
- No new required config keys. Adding plugins is opt-in.

---

## API surface

### The plugin shape

```ts
export interface ExtForgePluginV1 {
  name: string;                  // unique-ish; used in logs and error messages
  apiVersion: 1;
  setup(ctx: PluginContext): void | Promise<void>;
}

// The legacy thin shape kept for backwards compat:
export interface ExtForgePluginLegacy {
  name: string;
  setup?: (config: ExtForgeConfig) => void | Promise<void>;
  buildStart?: () => void | Promise<void>;
  buildEnd?: (result: unknown) => void | Promise<void>;
}

// Public union — what users put in `plugins: [...]`:
export type ExtForgePlugin = ExtForgePluginV1 | ExtForgePluginLegacy;
```

A plugin is identified by `apiVersion: 1` (new shape) or its absence (legacy). The runner adapts legacy plugins into the new shape via a small shim that wires `setup(config)` → `setup({ config, ... })`, `buildStart` → `onBuildStart`, `buildEnd` → `onBuildEnd`.

### Plugin context

```ts
export interface PluginContext {
  // Resolved config (frozen). Plugins MAY read; plugins MUST NOT mutate.
  readonly config: ExtForgeConfig;

  // Project paths.
  readonly paths: {
    readonly root: string;       // project root (cwd)
    readonly src: string;        // resolved src dir
    readonly dist: string;       // resolved dist dir
  };

  // Logger scoped to the plugin's name.
  readonly logger: Logger;

  // Hook registration. Plugins call these *during setup()*.
  readonly hooks: PluginHooks;

  // Side-effect helpers.
  addEntry(entry: EntryDescriptor): void;
  emitFile(rel: string, contents: string | Uint8Array): void;
}

export interface PluginHooks {
  /** Called once after config resolution, before any build. */
  onConfigResolved(fn: (config: ExtForgeConfig) => void | Promise<void>): void;

  /**
   * Called once per browser, before bundling, with the manifest about to be
   * written. Plugins return a (possibly-modified) manifest. Hooks chain
   * reduce-style: each plugin sees the previous one's output.
   */
  onManifestTransform(
    fn: (manifest: ManifestObject, browser: Browser) => ManifestObject | Promise<ManifestObject>,
  ): void;

  /** Called once at the start of every build. */
  onBuildStart(fn: (info: { browser: Browser; dev: boolean }) => void | Promise<void>): void;

  /**
   * Called per resolved entry, before bundling. Plugins may return a modified
   * EntryDescriptor (or void to leave unchanged). Reduce-style.
   */
  onBuildEntry(fn: (entry: EntryDescriptor) => EntryDescriptor | void | Promise<EntryDescriptor | void>): void;

  /** Called once at the end of every build. */
  onBuildEnd(fn: (result: BuildResult) => void | Promise<void>): void;

  /** Called every time the dev server announces a reload. */
  onDevReload(fn: (event: HMRUpdate) => void | Promise<void>): void;
}

export interface EntryDescriptor {
  /** Logical name used to derive output filename. */
  name: string;
  /** Absolute path to the source file. */
  file: string;
  /** Output format. */
  format: 'esm' | 'iife';
  /** Per-entry esbuild overrides. */
  esbuildOptions?: Record<string, unknown>;
  /** True for content-script entries (gets the __EXTFORGE_SCRIPT_ID__ banner in dev). */
  isContentScript?: boolean;
}
```

`ManifestObject` is the resolved chrome MV3 manifest shape (it's what gets serialized to `manifest.json`). `BuildResult` is the existing type from `src/core/builder/index.ts`. `HMRUpdate` is the existing type from `src/core/hmr/index.ts`.

### Plugin runner

```ts
// src/core/plugins/runner.ts
export class PluginRunner {
  constructor(plugins: ExtForgePlugin[], ctx: Omit<PluginContext, 'hooks'>);

  /** Runs every plugin's setup() in registration order. Throws on plugin error. */
  async setup(): Promise<void>;

  /** Fires the named hook in registration order; returns aggregated result. */
  async fireConfigResolved(config: ExtForgeConfig): Promise<void>;
  async fireManifestTransform(manifest: ManifestObject, browser: Browser): Promise<ManifestObject>;
  async fireBuildStart(info: { browser: Browser; dev: boolean }): Promise<void>;
  async fireBuildEntry(entry: EntryDescriptor): Promise<EntryDescriptor>;
  async fireBuildEnd(result: BuildResult): Promise<void>;
  async fireDevReload(event: HMRUpdate): Promise<void>;

  /** Plugins discovered (post-shim, with legacy adapted). */
  readonly plugins: ReadonlyArray<ExtForgePluginV1>;
}
```

### Wire-in points in the existing code

| Site | Hook fired | When |
|---|---|---|
| `loadExtForgeConfig` (`src/core/config.ts`) | `onConfigResolved` | After Zod validation, before return |
| `buildAll` (`src/core/builder/index.ts`) start | `onBuildStart` | Once per browser, before entry resolution |
| Each entry, just before esbuild call | `onBuildEntry` | Reduce-style; plugins may modify the descriptor |
| `generateManifest` call site | `onManifestTransform` | Before writing `manifest.json` |
| `buildAll` end | `onBuildEnd` | Per browser, after all entries bundled |
| `broadcast` in `src/core/hmr/index.ts` | `onDevReload` | After every successful reload |

The runner instance is constructed once per `loadExtForgeConfig` call and threaded through `BuildOptions` (new optional field `_pluginRunner?: PluginRunner`) so the builder can fire hooks without re-instantiating.

---

## Internal extraction: `presetReact()`

Today, `src/core/builder/index.ts` line ~230 sets `jsxImportSource: 'react'` unconditionally and lines ~141–142 shell out to `tailwindcss` if certain markers exist. This track extracts the React part (Tailwind stays in the next track of presets — out of scope here).

```ts
// src/core/plugins/preset-react.ts
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
      hooks.onBuildEntry((entry) => {
        return {
          ...entry,
          esbuildOptions: {
            ...entry.esbuildOptions,
            jsx: runtime === 'automatic' ? 'automatic' : 'transform',
            jsxImportSource: importSource,
          },
        };
      });
      logger.debug('preset-react ready');
    },
  };
}
```

The builder loses its hardcoded `jsxImportSource: 'react'` line. Instead, when `config.framework === 'react'`, the runner auto-injects `presetReact()` at the start of the plugin list (so user-supplied plugins override it). When `config.framework` is something else or `'vanilla'`, no preset is injected.

User-facing equivalence:

```ts
// existing config (still works)
export default { framework: 'react', /* ... */ };

// equivalent post-track-3 explicit form
import { presetReact } from 'extforge/plugins';
export default { plugins: [presetReact()], /* ... */ };
```

This is the dogfooding gate. If it works for React, the API is fit for purpose.

---

## File layout

```
src/core/plugins/
  types.ts                       # NEW — ExtForgePluginV1, PluginContext, PluginHooks, EntryDescriptor
  runner.ts                      # NEW — PluginRunner class + legacy shim
  preset-react.ts                # NEW — first-party React preset
  index.ts                       # NEW — public re-exports
src/core/config.ts               # modified — invoke onConfigResolved; keep ExtForgePlugin re-export
src/core/builder/index.ts        # modified — fire onBuildStart/onBuildEntry/onManifestTransform/onBuildEnd; auto-inject presetReact when framework=react; remove hardcoded jsxImportSource
src/core/hmr/index.ts            # modified — fire onDevReload after broadcast
tests/
  plugins-runner.test.ts         # NEW — runner unit tests
  plugins-preset-react.test.ts   # NEW — preset-react unit tests
  plugins-integration.test.ts    # NEW — end-to-end: fixture + plugin + assertions on result
  plugins-legacy-shim.test.ts    # NEW — legacy plugin shape still works
```

The package `exports` map gains a `./plugins` entry pointing at `dist/core/plugins/index.js`.

## Testing

- **Runner unit tests:** registration order, hook firing order, reduce-style chain for transforms, throw-from-plugin behavior, legacy shim.
- **Preset-react unit tests:** plugin shape, that `onBuildEntry` returns the right esbuild options.
- **Integration test:** scaffold a fixture project with a JSX file, run `build()` against it with `presetReact()` in `plugins`, assert the bundled output is valid (does not throw on JSX) and contains the import-source string.
- **Legacy shim test:** a thin plugin (`{ name: 'x', setup(cfg) { /* ... */ } }`) is loaded and its hook fires.

---

## Key decisions

- **Plugins read-only on config.** Plugins receive `Object.freeze(config)`. Mutations require explicit hooks (`onManifestTransform`, `addEntry`). Reason: predictable, testable, no spooky action at a distance.
- **Reduce-style transforms.** `onManifestTransform` and `onBuildEntry` chain. Plugin order matters; document this and surface it in the runner's logs at `debug` level.
- **Fail loud on plugin throw.** A throwing plugin fails the build with `ExtForgeError(EXT_PLUGIN_FAILED)` carrying the plugin name, the hook, and the underlying error. Users wrap their own try/catch if they want fallbacks.
- **No cancellation.** Hooks run to completion. No abort signal in v1.
- **`apiVersion` is required on new plugins, optional on legacy.** Runtime checks `apiVersion === 1` to route to the new path; everything else goes through the shim.
- **`presetReact()` lives in `src/core/plugins/`, not a separate package.** Exported via the `extforge/plugins` subpath. We move to `packages/` only when we publish it separately.

## Open questions

- **Plugin error code:** `EXT_PLUGIN_FAILED` vs. `EXT_PLUGIN_<NAME>_FAILED`. Recommendation: single code, plugin name in the message, since the docs URL only needs to teach the general failure mode.
- **Async setup ordering:** the runner awaits each plugin's `setup()` sequentially. If plugins need parallel setup later (rare), that's a v2 change.
- **Hook visibility into other plugins' results:** `onBuildEntry`'s reduce-style means plugin B sees plugin A's output. That's intentional. Document it.
- **Order in which built-in presets are injected:** built-in `presetReact()` goes FIRST so user plugins can override its behavior. Document this. (User can also pass an explicit `presetReact({})` to control options.)

## Success criteria

- A user can write `import { presetReact } from 'extforge/plugins'; export default { plugins: [presetReact()] }` and observe identical behavior to today's `framework: 'react'` config.
- The existing legacy plugin shape (`{ name, setup(config) }`) still works without changes.
- The integration test builds a fixture with a JSX file via the plugin system, with no JSX-related hardcoded line remaining in `src/core/builder/index.ts`.
- All existing tests pass; new tests cover runner, preset-react, integration, and legacy shim.
- A plugin that throws fails the build with `ExtForgeError(EXT_PLUGIN_FAILED)` carrying the plugin name and hook.
- No breaking changes to `extforge.config.ts` or any public type.
