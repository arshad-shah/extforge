---
"extforge": patch
---

manifest: `browserOverrides` now applies to every top-level key, not just name/version/description

Previously only `name`, `version`, and `description` were threaded through
the per-browser override, so a config like
`browserOverrides: { firefox: { permissions: {...}, background: {...} } }`
silently dropped the override and produced the base manifest. The type
signature said `Partial<ManifestConfig>` but the generator never read those
fields.

Per-browser overrides are now applied via a shallow merge: nested objects
(`permissions`, `action`, `background`, `sidePanel`, `commands`) are merged
key-by-key so a partial override doesn't blow away unrelated fields; arrays
(`contentScripts`, `webAccessibleResources`) and primitives are replaced
wholesale.
