---
"extforge": patch
---

fix: Node 24 HMR watcher compatibility and `ws` advisory

- **Watcher (Node 24):** `createWatcher` now checks the root exists up front
  instead of relying on `fs.watch` to throw `ENOENT`. Node <23 threw
  synchronously for a missing path; Node 24 returns a watcher and stays silent,
  so the `onUnsupported` fallback never fired. The explicit existence check is
  deterministic across Node 20/22/24.
- **Supply chain:** bump `ws` to `^8.21.0` to clear the moderate
  `GHSA-58qx-3vcg-4xpx` (uninitialized memory disclosure) advisory, keeping
  `pnpm audit --prod` at zero vulnerabilities.
