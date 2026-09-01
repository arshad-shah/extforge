---
'extforge': minor
---

`build.esbuild` now reaches the builder. The option was accepted by the config schema and published in the generated config reference — described as "pass-through esbuild options merged into every entry build" — but nothing read it, so every override was silently discarded.

Options declared there are now merged into every entry build (ESM, IIFE content scripts, injected scripts, and the dev watch context):

- `define`, `loader` and `alias` merge key-by-key, so adding one entry keeps the built-ins. `loader: { '.css': 'text' }` now switches just that extension and leaves ExtForge's other loaders in place.
- `plugins` is appended after ExtForge's own plugins.
- Every other option replaces the built-in value.

Options the builder owns — `entryPoints`, `outdir`, `outfile`, `format`, `splitting`, `metafile`, `write` and `banner` — are ignored with a warning naming them. Honouring `format` would emit an ESM content script no browser will inject, and `metafile: false` would strip the data the build report reads.
