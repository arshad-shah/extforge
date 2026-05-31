---
"extforge": minor
---

config: load `extforge.config` via `@arshad-shah/config-kit`

`loadExtForgeConfig` now uses [`@arshad-shah/config-kit`](https://www.npmjs.com/package/@arshad-shah/config-kit)
v2 for config-file discovery, deep-merge (defaults < file < overrides), and
strict/warn validation. ExtForge supplies the schema, the strict-by-default
policy (`EXTFORGE_STRICT_CONFIG=0` still downgrades to a warning), and a
TypeScript-aware module loader (esbuild) as config-kit's `configFileSource`
`load` callback.

No change to the public surface: `loadExtForgeConfig`, `defineConfig`,
`DEFAULT_CONFIG`, the supported `extforge.config.{ts,mts,cts,mjs,js,cjs,json}`
file set, deep-merge semantics, and the `EXT_CONFIG_INVALID` error are all
unchanged. The internal `loadConfigFile`/`mergeConfig` helpers (never exported)
were removed in favour of config-kit's pipeline.
