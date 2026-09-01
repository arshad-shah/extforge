---
"extforge": major
---

**ExtForge 1.0 — the API is now a stability contract.**

There are no breaking changes from `0.6.x`. No config field was renamed, no
export was removed, no CLI flag changed. What changes is the promise: the
surface documented in [API stability](https://extforge.arshadshah.com/reference/stability/)
is frozen for the life of v1, and breaking any of it now requires a major release.

- **Every export, command, flag and config field is assigned a tier** —
  Stable, Experimental, or Internal. Internal symbols carry an `@internal`
  JSDoc tag at their definition, so your editor warns you before you depend on
  one. `createBuildContext`, `classifyChange`, `generateHMRClientCode`,
  `writeManifest` and `PluginRunner` are tagged internal: they are exported
  because the CLI needs them across module boundaries, not as API.
- **`extforge/testing` and `extforge/testing/vitest` ship as experimental.**
  The Chrome API fakes mirror a surface MV3 itself keeps extending, so they
  need room to move in minor releases. Everything else in the package is stable.
- **The plugin API is stable.** It already carries an `apiVersion: 1`
  discriminator, so a future incompatible plugin API can ship as `apiVersion: 2`
  alongside it rather than breaking existing plugins.
- **HMR globals are split.** `globalThis.__EXTFORGE_HMR_QUIET__` is a public,
  documented opt-out and is stable. `globalThis.__EXTFORGE_HMR__` is the
  binding target the dev-mode transform emits against — internal, and it moves
  with the wire protocol.
- **Node policy is written down.** ExtForge requires Node >= 22.12 and supports
  releases while they are in Active or Maintenance LTS. Dropping an
  end-of-life Node major is a *minor* release: holding the floor down until the
  next major would mean shipping against an unpatched runtime.

Also in this release:

- **Cross-browser build gate in CI.** A new `pnpm check:cross-browser` builds
  every example for Chrome, Firefox, Edge and Safari and asserts each emitted
  manifest carries that browser's shape. Live-browser e2e remains Chromium-only.
- **New docs**: [API stability](https://extforge.arshadshah.com/reference/stability/)
  and [Upgrading to v1](https://extforge.arshadshah.com/guides/migration-v1/).
- **`CHANGELOG.md` no longer carries a stale `[Unreleased]` section.** Its
  contents (HMR v3, SWC + React Fast Refresh, content-script HMR scaffolding,
  centralized logging) all shipped in `0.3.0` and `0.4.0`.
