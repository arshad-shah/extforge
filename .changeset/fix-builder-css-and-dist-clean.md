---
"extforge": patch
---

builder: close CSS shell-injection, skip `--minify` in dev, clean dist before prod builds

- `processCSS` used to build its `npx tailwindcss ...` command via a
  template literal. A project root with shell metacharacters in its
  absolute path (or anywhere `input`/`output` came from user-controlled
  config) could execute arbitrary commands. The probe and the tailwind
  call now use `spawnSync` with argv arrays (no shell).
- The same call hard-coded `--minify`, even in dev mode. Removed for
  dev builds; production keeps it.
- `build()` now wipes the per-browser `dist/<browser>` directory before
  every production build. Previously a renamed entry left the previous
  chunk on disk, and a mid-build failure could leave a half-written
  manifest from the prior attempt. Dev builds keep their outputs so
  HMR incremental work isn't trashed every rebuild.
