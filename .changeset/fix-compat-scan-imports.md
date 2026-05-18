---
"extforge": patch
---

compat: scan imported helpers, not just top-level entry files

The pre-build cross-browser compat scan used to read only the files
referenced by `entryPoints` — so `chrome.tabGroups.query()` in a helper
module imported by `src/background/index.ts` was invisible. Anyone with a
normal modular project layout got vacuous "no compat issues" reports.

The scan now walks the configured `build.srcDir` (defaulting to `src/`),
inspects every TS/JS source up to a 2000-file cap, and skips the usual
non-source directories (`node_modules`, `dist`, `.git`, `coverage`,
`.cache`). The doctor's compat check uses the same walk.
