---
"extforge": patch
---

hmr: align the v3 update envelope shape between server and runtime

The dev server emits `{ id, hash, file }` per update (and the browser
HMR client template already reads `u.file`), but the in-runtime helper
`applyV3Update` in `src/core/hmr/runtime.ts` was reading `u.chunkUrl`,
which never existed in the wire format. The helper was dead code at
runtime — if ever invoked it would have crashed on `undefined`.

The runtime now reads `u.file`, matching the server. `HMRUpdateV3` in
`runtime.ts` documents the field. This is the public type imported by
test setups and any user of `applyV3Update`; the rename is a breaking
change at the type level for that helper only.
