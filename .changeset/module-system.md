---
"extforge": minor
---

Add a module system: `extforge/modules` exports `defineModule()` and `ModuleContext`, and `extforge.config.ts` accepts a `modules: [...]` array alongside `plugins`.

A module is a superset of a plugin — it gets everything `ExtForgePluginV1` gets (`ctx.hooks`, `ctx.addEntry`, `ctx.emitFile`) plus four new capabilities:

- `ctx.addEntrypoint({ name, input })` — add a synthetic build entry.
- `ctx.extendManifest(patch)` — deep-merge a partial manifest (arrays concat + dedupe, objects merge, primitives overwrite).
- `ctx.addTypeDeclaration(dts)` — contribute `.d.ts` source, collected into a generated `.extforge/modules.d.ts`.
- `ctx.addRuntimeImport(name, from)` — register a named runtime re-export, collected into a generated `.extforge/modules.ts` barrel.

`modules: [...]` entries may be an already-imported module object, a bare package specifier (e.g. `'@extforge/module-analytics'`), or a local path (e.g. `'./modules/my-module'`, compiled the same way as `extforge.config.ts` so local modules may be TypeScript). Modules run in declared order, after built-in presets and before `plugins`; `extforge doctor` gained a `modules-active` check that lists every active module and what it contributed.

Existing plugins are unaffected — modules are adapted into plugins under the hood, so they flow through the same build-time wiring.
