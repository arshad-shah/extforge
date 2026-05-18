---
"extforge": patch
---

plugins + messaging + cli: small but user-facing fixes

- `PluginRunner.fireManifestTransform` no longer accepts `null`/non-object
  returns from `onManifestTransform`. The hook signature type forbids it,
  but a misbehaving plugin returning `null` used to overwrite the manifest
  and crash every downstream plugin on its first property access.
- `PortChannel` gains an `onDisconnect(reason?)` method and the wrapper
  auto-removes all `onMessage` listeners when the underlying Port
  disconnects. `chrome.runtime.lastError` is read at the disconnect
  boundary to suppress Chrome's console spam.
- The CLI parser used to accept `--port -X` as `port="-X"`, producing
  `NaN` once the value was parsed as an integer. Any leading-dash token
  is now rejected; use `--port=-X` to pass a literal leading-dash value.
- The interactive scaffold prompter registers a one-shot `process.exit`
  listener that restores cooked terminal mode. Without this an
  uncaught exception or SIGTERM during a prompt left the user's shell
  in raw mode.
