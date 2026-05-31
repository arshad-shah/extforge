---
"extforge": minor
---

config + plugins: land two previously-deferred behaviors for v1

- **Strict config validation is now the default.** An invalid `extforge.config`
  throws `extforge.config is invalid` instead of warning and continuing. This
  is a behavior change: set `EXTFORGE_STRICT_CONFIG=0` to downgrade validation
  failures to a warning while migrating. (`EXTFORGE_STRICT_CONFIG=1` is no
  longer needed — strict is the default.)

- **`ctx.addEntry()` and `ctx.emitFile()` are implemented.** They previously
  threw "not yet implemented". Plugins can now register a synthetic entry point
  (`addEntry({ name, file, format })`, bundled into every build and routed to
  the ESM or IIFE pass by `format`) and write files into each browser's output
  directory (`emitFile(rel, contents)`). Repeated calls de-duplicate by entry
  name / output path, and `emitFile` paths that escape the output directory are
  rejected.
