---
"extforge": patch
---

ci: vitest serial mode, playwright retries on CI, lint scripts/

- `vitest.config.ts` runs test files serially (`fileParallelism: false`).
  Tests that bind ports (HMR server, port-free probe) would otherwise
  collide if parallel workers grabbed the same default. Coverage
  excludes scaffold templates, inlined compat data, and the one-shot
  build-data script — they're not executable surface.
- `tests-e2e/playwright.config.ts` retries failing specs once on CI
  (kept at 0 locally so flakiness is visible immediately). SW startup
  timing variance on cold CI hosts produces occasional spurious red
  builds that a single retry covers cleanly.
- `tests-e2e/package.json` pins `packageManager: pnpm@10.0.0` to match
  the workspace root.
- `eslint.config.js` now covers `scripts/`. The build/docs scripts
  used to be unlinted entirely, so a regression in one wouldn't surface
  until the docs failed to generate. Same correctness rules as `src/`
  with `no-console` allowed (these scripts log to stdout deliberately).
  `pnpm lint` was updated to include `scripts`.
