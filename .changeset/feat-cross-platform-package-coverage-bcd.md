---
"extforge": minor
---

cli + ci: cross-platform `extforge package`, coverage floors, BCD freshness gate

- `extforge package` now falls back to a pure-Node ZIP writer when the
  system `zip` binary isn't available — typically Windows. The writer
  produces deterministic, byte-for-byte reproducible archives (fixed
  DOS timestamp, sorted entries, DEFLATE via `node:zlib`), strips
  `.DS_Store` and `.git` automatically, and round-trips through the
  standard `unzip` cleanly. No new prod dependency.
- The previous code path still runs first when `zip` is present (it's
  faster and more battle-tested); fallback is automatic on ENOENT.
  Tests can pin `impl: 'js'` to exercise the JS writer explicitly.
- Vitest gains coverage floors (lines/statements/branches 70 %,
  functions 75 %) just below today's measured baseline. CI will fail
  if a future change drops below; raise as coverage climbs.
- New `pnpm compat:check-freshness` script (wired into the unit job on
  Node 22) fails CI when `src/core/compat/data.json` hasn't been
  refreshed in the last 90 days. Uses the file's git-log timestamp
  rather than filesystem mtime so fresh clones don't false-positive.
