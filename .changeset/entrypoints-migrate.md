---
"extforge": minor
---

Named layout by default, plus a way to move existing projects (#96 phase 4b).

- **`extforge init`** now scaffolds the named layout: `src/background.ts`, `src/popup/index.html`, `src/content.ts` with `defineContentScript()`, and no entry paths in the config. Options and side-panel pages now get their script; before, their HTML loaded an `index.js` that was never written.
- **`extforge migrate-layout [--write]`** moves `src/ui/<page>/` and `src/content/index.ts`, rewrites relative paths that cross the moved folders, adds `defineContentScript()` with the configured options, and removes the entry keys from the config (verified by reloading it). It changes nothing when a step can't be done safely.
- **Deprecation:** legacy-layout builds print one warning naming what keeps the project there. The legacy layout keeps working for all of 1.x.
- **Pages:** relative `<link href>` paths into `src/` are rewritten when a page is written to the output root, so stylesheets keep loading.
- **New example and guide:** `examples/named-layout` with an E2E spec, and a "Moving to the named layout" guide.
