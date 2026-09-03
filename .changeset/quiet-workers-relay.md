---
'extforge': patch
---

The dev HMR client no longer holds a WebSocket open from the MV3 service worker.

MV3 evicts an idle service worker after about 30 seconds, which closed the socket the worker was holding. `onclose` scheduled a reconnect, opening the socket woke the worker back up, it went idle, and it was evicted again — a connect/disconnect cycle every ~30s for the whole dev session with no file having changed. Backoff could not damp it: `swAttempts` reset to `0` on every successful open, so the delay never grew.

The worker holds no socket now. Extension pages and content scripts already have a live connection; when the dev server sends `full-reload` or `manifest` they relay the request to the worker with `chrome.runtime.sendMessage`, which is also what wakes the worker to serve it. The relay message is namespaced (`extforge:hmr-reload`) and other messages pass straight through to your own `onMessage` listeners. Only the first relay of a change acts, so several open tabs reloading at once still reload the extension once.

The client degrades one step at a time and says which step it took: an extension page calls `chrome.runtime.reload()` directly, a content script relays, and if nothing answers the relay — an extension with no background entrypoint, say — it warns with the underlying error and falls back to reloading the page rather than going quiet.

Also fixes a latent bug in the same path: the worker branch ran before the client's `var` constants were initialised, so `nextBackoff` read `BACKOFF` as `undefined` and threw on the first close.
