---
"extforge": patch
---

hmr: fix watcher missed-unlink, port-exhaustion silent failure, and infinite client reconnect

- `createWatcher` previously misclassified the first delete after start as
  `change` (existence map defaulted to `false`, so `had=false && now=false`
  produced "change"). The HMR server treats `change` as a JS hot-swap, so
  a brand-new deletion of a previously-tracked file silently skipped the
  required full reload. The watcher now seeds the existence map by walking
  the watch root once at start.
- `createWatcher` also gains an `onUnsupported(reason)` callback. The dev
  server wires it up so a recursive-watch failure (path missing, Linux
  Node <20, kernel without inotify recursive support) surfaces a warning
  instead of silently returning a no-op watcher.
- `reservePort` used to log a warning and return `start` when every port
  in the candidate range was occupied. The subsequent `WebSocketServer`
  bind then crashed mid-`start()`, leaving the file watcher and esbuild
  context alive. Now throws `EXT_HMR_PORT_IN_USE` with a hint pointing at
  `--port`.
- The injected browser HMR client used to retry forever after the dev
  server shut down (advertised as "infinite reconnect"). Closed tabs
  hammered the dev box every 8 s until the user closed them. Capped at
  30 attempts; the badge then advises a manual refresh once the dev
  server is back.
