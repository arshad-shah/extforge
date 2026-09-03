---
'extforge': minor
---

Content scripts can now declare `allFrames`, `matchAboutBlank`, `excludeMatches` and `world` — in `manifest.contentScripts[]` and in the `defineCSUI` descriptor — emitted as `all_frames`, `match_about_blank`, `exclude_matches` and `world`. Anything that has to reach inside iframes (inspectors, overlays, measuring tools) no longer needs to hand-edit a manifest the build regenerates.

Only `run_at` still carries a default; every new key is omitted from the generated manifest when unset, so manifests for configs that don't use them are unchanged. Declaring `world` raises the Firefox build's `strict_min_version` to `128.0` — the first Firefox that honours the key — rather than emitting something older Firefox would silently ignore.
