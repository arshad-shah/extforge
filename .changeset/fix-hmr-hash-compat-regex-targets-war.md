---
"extforge": patch
---

hmr + compat + builder + manifest: smaller follow-ups

- HMR v3 update envelopes now hash the rebuilt chunk's bytes (sha256
  → first 12 hex chars) instead of the rebuild timestamp. The runtime's
  hash-equality short-circuit in `apply()` was dead before — every
  update looked unique even when the bundled output was identical.
- The compat scanner's `stripStringsAndComments` now recognises regex
  literals (`/chrome\.tabGroups/`) and blanks out their bodies. A
  `chrome.*` token inside a RegExp body used to produce a false-positive
  compat warning.
- `ESBUILD_TARGETS` refreshed to chrome120/firefox128/safari17/edge120
  (was chrome110/firefox115/safari16, missing edge). MV3 floors are
  Chrome 88, Firefox 109, Safari 17; the new floors give us the widest
  install base without forcing legacy transforms.
- `applyInjectedDefaults` now narrows the auto-generated
  `web_accessible_resources.matches` to the union of declared
  contentScript matches rather than blanket `<all_urls>`. Falls back to
  `<all_urls>` only when no content_scripts are declared. Reduces store
  review friction for the common case of site-specific extensions.
