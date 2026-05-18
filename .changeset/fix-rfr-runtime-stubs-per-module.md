---
'extforge': patch
---

Fix `TypeError: $RefreshReg$ is not a function` after the first React Fast Refresh module loads.

The RFR runtime header set `globalThis.$RefreshReg$` / `globalThis.$RefreshSig$` to their no-op stubs only inside the `__extforge_refresh_inited__` guard, but the footer unconditionally restored both globals to the saved `prev` values (which are `undefined` for the very first module). The second module's header then re-ran, found the init flag already true, skipped the no-op assignments, and its body immediately called `$RefreshReg$(...)` against `undefined`.

The stubs now live outside the init guard so every wrapped module re-installs them at its own top. `injectIntoGlobalHook` (which isn't idempotent) stays inside the guard.
