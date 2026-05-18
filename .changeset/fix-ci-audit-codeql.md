---
"extforge": patch
---

ci: clear the audit + CodeQL findings flagged on PR #34

- **`pnpm audit --prod`**: pin `devalue >=5.8.1` via the workspace
  `pnpm.overrides`. Astro 6.2.2 pulled in `devalue@5.8.0` which has a
  high-severity DoS via sparse-array deserialisation
  ([GHSA-77vg-94rm-hx3p](https://github.com/advisories/GHSA-77vg-94rm-hx3p)).
  Only docs-site is affected, but the audit job runs on the whole
  workspace.
- **Docs `build` gate**: `gen-config-reference.ts` re-emits the index
  page on every run, which clobbered the hand-edited "Merging behavior"
  section. Moved that prose into the generator so it survives `pnpm
  docs:gen` (and the CI drift check stays green).
- **CodeQL — uncontrolled shell command**: `scripts/check-bcd-freshness.ts`
  now uses `spawnSync` with an argv array (no shell) instead of an
  `execSync` template literal. The path was always derived from
  `__dirname`, but CodeQL can't see that.
- **CodeQL — polynomial regex**: `deriveFirefoxId` and the scaffold
  name-normaliser shared a `^-+|-+$` / `-{2,}` chain that CodeQL flags
  for backtracking on pathological dash-heavy input. Replaced both
  call sites with a new `core/util/slug.ts` helper that walks the
  string once. Locked in by a slug.test.ts that exercises a 100 K dash
  prefix and finishes under 500 ms.
- **CodeQL — insecure tmp file usage**: tests/validator + tests/scaffold
  switched from `join(tmpdir(), \`name-${Date.now()}-${random}\`)` to
  `mkdtempSync(...)` which is atomic and owner-only.
- **CodeQL — unused import**: removed `mkdirSync` from
  tests/hmr-watcher.test.ts.
