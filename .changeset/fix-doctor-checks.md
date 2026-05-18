---
"extforge": patch
---

doctor: fix three checks that silently no-oped on real projects

- `permissions-known`: accept both the flat-array (`permissions: ['storage']`)
  and the scaffolded object (`permissions: { required, optional, host }`)
  shapes. Previously the object form threw, the catch swallowed it, and
  the check reported "Skipped (config invalid)" on every scaffolded project.
- `compat`: walk `src/` recursively instead of looking at a fixed list of
  top-level filenames (`src/background.ts`, etc.) that the current scaffold
  doesn't create. Previously the check always reported "no compat issues"
  because it never opened any of the user's source files.
- `port-free`: honour `dev.port` from `extforge.config` instead of
  hardcoding 35729, and bind to `0.0.0.0` so a process bound to any local
  interface is detected.
