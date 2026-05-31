---
"extforge": minor
---

cli: migrate the CLI onto `@arshad-shah/clif`

The hand-rolled argument parser (`src/cli/parser.ts`) has been replaced with
[`@arshad-shah/clif`](https://www.npmjs.com/package/@arshad-shah/clif), a
tiny zero-dependency CLI framework. Every command — `init`, `dev`, `build`,
`validate`, `doctor`, `upgrade`, `package`, `icons` — keeps the same flags and
defaults; the command tree now lives in `src/cli/commands.ts`.

User-visible changes are cosmetic: `--help` output is rendered by clif, and an
unknown subcommand now produces a "did you mean…?" suggestion instead of
falling through to the top-level help. Error formatting, exit codes, and the
`extforge.config` contract are unchanged — thrown errors are still routed
through ExtForge's formatter (code, hint, docs link, exit 1).
