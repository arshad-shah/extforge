---
"extforge": patch
---

doctor + builder + compat + csui: medium-severity polish

- `dist-gitignored` doctor check now recognises every common gitignore
  spelling of "dist" (`/dist`, `/dist/`, `**/dist`, `dist/*`, `dist/**`,
  …), strips inline `#` comments, and ignores `!` negations and a
  leading UTF-8 BOM. Previously only three exact forms were matched.
- `validateManifestConfig` and `generateManifest` guard against a
  missing `permissions` object. JS callers that omit the key used to
  hit `TypeError: Cannot read properties of undefined (reading
  'required')`. Validation now surfaces a clear error; generation
  treats missing arrays as empty.
- Builder error wrapping (`throwAsBuildError`) now includes every
  esbuild error in the thrown `ExtForgeError.message`. The first
  error still populates `file`/`line`/`column` for editor jump-to.
  Previously only the first error was surfaced; the rest were dropped.
- Compat scanner regex matches optional-chained `chrome?.foo.bar`
  access too. Previously dotted-only chains were detected.
- CSUI `defineCSUI` auto-mount failures now log the underlying error
  object instead of a generic "auto-mount failed" string, so users
  can actually debug.
