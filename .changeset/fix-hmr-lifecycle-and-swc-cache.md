---
"extforge": patch
---

hmr: tighter start/stop lifecycle + SWC cache can pick up mid-session installs

- `createHMRServer.start()` now races `'listening'` vs `'error'` after
  `new WebSocketServer(...)`. Previously a TOCTOU port grab — another
  process binding the port in the window between `reservePort` releasing
  it and the WebSocket server binding — resolved `start()` successfully
  with a non-functional server.
- `stop()` now terminates open client sockets and awaits `wss.close()`'s
  callback. Sockets used to linger after stop, keeping the event loop
  alive in tests and CI.
- `@swc/core` resolution had a permanent in-process negative cache:
  once "not installed" was decided, installing it mid-session never
  re-enabled React Fast Refresh until restart. The cache now expires
  after 60 s, and a successful re-probe surfaces a one-time
  "RFR enabled" info line.
