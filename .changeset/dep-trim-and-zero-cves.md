---
"extforge": patch
---

Production dependency tree: 130 → 32 packages (–75%). All vulnerabilities resolved.

- `pnpm audit --prod` reports **0 vulnerabilities** (previously 8 — 6 high tar CVEs via the c12 → giget → tar 6.2.1 chain plus 2 moderate esbuild advisories).
- Replaced `c12` with first-party `src/core/config/loader.ts` (~200 LOC). Kills the entire vulnerable tar chain and drops ~25 transitive packages. No public API change — `loadExtForgeConfig()` signature is unchanged.
- Replaced `pathe` with `node:path/posix` directly. Identical semantics on Node 20+.
- Replaced `picocolors` with `src/core/logger/ansi.ts` (~50 LOC). Brand-aware, NO_COLOR / FORCE_COLOR / TERM=dumb / isTTY all honored.
- Replaced `citty` with `src/cli/parser.ts` (~250 LOC). Same `defineCommand` / `runMain` API surface so `src/cli/index.ts` only changed its import line.
- Replaced `chokidar` with `src/core/hmr/watcher.ts` (~150 LOC) on top of `node:fs.watch({ recursive: true })`. add/change/unlink event synthesis from existence tracking, awaitWriteFinish-style stat-stable polling, glob-string ignore patterns.
- Replaced `prompts` with `src/core/scaffold/prompter.ts` (~250 LOC) using `node:readline` raw mode. Non-TTY mode resolves prompts to defaults (CI-safe).
- Removed declared-but-unused `fast-glob`, `glob`, `pkg-types`, `defu`.
- Bumped `esbuild` to `^0.28.0` (closes [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)).

ESLint `no-console: error` now enforced across `src/`. Library code routes through Logger (server-side) or `runtimeLog` (in-browser HMR). New `Logger.raw()` method for unstructured UX text (scaffold banners).
