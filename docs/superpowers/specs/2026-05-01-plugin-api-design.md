# Design: Plugin API

**Date:** 2026-05-01
**Status:** Outline — to be deepened before implementation
**Repo:** `Documents/practice/extforge`
**Track:** 3 of 5

## Problem

Every feature request that's "make ExtForge also do X" currently competes for room in core. Without a plugin surface, framework presets (React, Vue, Svelte, Solid), CSS strategies (Tailwind), and one-off transforms (auto-permission inference, manifest patches) all live in core or as undocumented config branches. This will not scale.

A small, stable plugin API lets us extract first-party behavior as plugins (dogfooding), and lets users solve their own problems without forking. Crucially, **shipping this enables the rest of the roadmap**: framework presets, codemods for `extforge upgrade`, and React Fast Refresh integration all sit on top.

## Goals

- A minimal, typed plugin shape that covers the lifecycle ExtForge already has.
- First-party React/Tailwind/Vue presets extracted to plugins, proving the API.
- Plugin authors get a typed context: logger, paths, `addEntry`, `emitFile`, `transformManifest`.
- Predictable ordering and a clear error when two plugins conflict.

## Non-goals

- Vite-style universal plugin compatibility. We are not promising Rollup/Vite plugins work.
- Runtime / browser-side plugin API. Plugins run in the build process only.
- A plugin marketplace or discovery service.

## Backwards compatibility

- `plugins: [...]` is a new optional field on `extforge.config.ts`. Absent = today's behavior.
- Existing built-in behaviors (React/Tailwind detection, manifest defaults) keep working unchanged. Internally they may be implemented as plugins, but the user-visible config doesn't change.
- Plugin API is versioned (`apiVersion: 1`). Future incompatible changes ship as `apiVersion: 2` with both supported for one minor version.

## Approach (sketch)

```ts
interface ExtForgePlugin {
  name: string;
  apiVersion: 1;
  setup(ctx: PluginContext): void | Promise<void>;
}

interface PluginContext {
  logger: Logger;
  paths: { root: string; src: string; dist: string };
  config: ExtForgeConfig;            // resolved, frozen
  hooks: {
    onConfigResolved(fn): void;
    onManifestTransform(fn: (m, browser) => m): void;
    onBuildStart(fn): void;
    onBuildEntry(fn: (entry) => entry | void): void;
    onBuildEnd(fn: (result) => void): void;
    onDevReload(fn: (event) => void): void;
  };
  addEntry(entry: EntryDescriptor): void;
  emitFile(rel: string, contents: string | Uint8Array): void;
}
```

Hooks are async-friendly and run in plugin-registration order. `onManifestTransform` returns the new manifest; the chain is reduce-style.

## Key decisions to make in the plan

- Should plugins be able to mutate the resolved config, or only react to it? **Lean:** read-only after resolution; mutation only via well-named hooks (`onManifestTransform`, `addEntry`).
- Plugin error policy: one plugin throws → fail the build (loud) vs. skip and warn. **Lean:** fail loud; users can wrap in try/catch in their plugin if they want fallback.
- Should hooks support cancellation? **Lean:** no, keep it simple in v1.

## Internal extraction plan

Order in which built-ins become plugins (each its own PR, no behavior change):

1. `@extforge/preset-react` — React + (optional) Tailwind, currently in `src/core/scaffold` and `src/core/builder`.
2. `@extforge/preset-vue`, `-svelte`, `-solid` — already partial; finish as plugins.
3. `@extforge/manifest-defaults` — the auto-injection of `web_accessible_resources` etc.

These ship as separate workspaces in this repo (monorepo via pnpm workspaces).

## Open questions

- Do plugins live in a `packages/` workspace or stay in `src/plugins/` for now? The first is cleaner for publishing; the second is faster to iterate. Likely `packages/` from day one.
- How do we test plugin ordering deterministically? Snapshot tests on hook invocation order.

## Success criteria

- A user can write `plugins: [myPlugin()]` in their config and observe its `setup` running.
- React preset is extracted and the existing scaffolded React project still builds, runs, and HMRs identically.
- Two ordering tests demonstrate `onManifestTransform` reduce-chaining works as documented.
- API reference is auto-generated from TS types (track 5 dependency, but the types ship in this track).
