---
"extforge": patch
---

config: deep-merge nested objects so partial overrides keep default siblings

Previously a user config like `dev: { port: 9000 }` silently dropped
`host: 'localhost'`, `debounce: 150`, and `open: false` from the
defaults, because the loader shallow-merged top-level keys only. Same
problem applied to `build: { sourcemap: true }` and to programmatic
overrides passed to `loadExtForgeConfig`.

`loadConfigFile` and `loadExtForgeConfig` now share a single
`mergeConfig` helper that recurses into plain-object branches and
replaces arrays/primitives wholesale. List-shaped config keys
(`browsers`, `plugins`) keep their existing replace-not-concat
semantics.
