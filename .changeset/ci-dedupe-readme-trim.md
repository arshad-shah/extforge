---
"extforge": patch
---

CI dedupe and README trim.

- `release.yml`: drop `typecheck`, `lint`, `test` from the in-line validate step. Those already ran on the PR (and on the changesets Version Packages PR) via `ci.yml`, against the exact same SHA. Keep `pnpm build` because `dist/` is required for the publish step.
- README: remove the "0 production CVEs, 32 prod packages" tagline, the OpenSSF Scorecard / Security-policy badges, and the Security & supply chain section. Security details belong in `SECURITY.md` and the supply-chain docs page, not in the front page README. Merged the two badge rows into one.
