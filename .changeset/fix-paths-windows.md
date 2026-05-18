---
"extforge": patch
---

paths: use platform `node:path` for filesystem ops; keep wire/manifest paths POSIX

Sixteen files imported from `node:path/posix` and used the result for
real filesystem operations. On POSIX systems this happens to work, but on
Windows `posix.join("C:\\proj\\src", "background")` produces a broken
mixed path. Among the consequences listed in the audit:

- `relative(projectRoot, absoluteFile)` returned garbage in the HMR
  broadcast `files` array.
- `path.join` calls used to compute fs targets in the builder, validator,
  scaffold, config loader, and doctor checks all silently produced
  mixed-separator paths.

All `'node:path/posix'` imports under `src/` are now `'node:path'`. The
HMR server explicitly normalises paths to forward-slash before they go
on the wire or are compared against the source prefix (`toPosix`
helper). Manifest output paths are already POSIX-literal in the
emitter.

Locked in by a `classifyChange` test that exercises Windows-style
backslash paths.
