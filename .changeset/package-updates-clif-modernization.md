---
"extforge": minor
---

Modernize dependencies and the CLI on the latest `@arshad-shah/clif` (1.3.0).

- **Node baseline is now 22.12+.** This aligns `engines.node`, the docs, the
  `doctor` node-version check, and the CI matrix with what ExtForge's runtime
  dependencies (notably `@arshad-shah/clif`) already require. Node 20 is no
  longer supported.
- **Richer CLI errors.** Error output now uses clif's `style`/`link`, so the
  "Docs" line is a clickable OSC 8 hyperlink in capable terminals and degrades
  to `Docs → (url)` everywhere else.
- **`extforge init` gains a typed positional.** The project name is now a
  declared `name` positional — it shows up in `extforge init --help` and is
  parsed by clif.
- **Dependency refresh.** Bumped clif (1.3.0), zod (4), esbuild, and the dev
  toolchain (TypeScript 6, ESLint 10, Vitest 4, `@mdn/browser-compat-data` 8,
  React 19 for tests, and others) to their latest releases. The Zod 4 upgrade
  required adjusting the config schema (`z.record` now takes a key schema) and
  recovering rejected values from the merged config input for friendly
  validation errors.
