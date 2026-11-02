---
"extforge": minor
---

Named entrypoints in `src/` with a generated manifest (#96 phase 2, #97).

- **New layout:** put `background.ts`, `popup.html`, `options.html`, `sidepanel.html`, `content.ts`, `<name>.content.ts` or `<name>.content/index.ts` directly in `src/`. ExtForge builds them to flat outputs (`background.js`, `popup.html`, `content-scripts/<name>.js`) and fills `background`, `action.default_popup`, `options_page`/`options_ui`, `side_panel`/`sidebar_action` and `content_scripts` into the manifest, using the existing per-browser rules.
- **`defineContentScript`** from the new `extforge/entrypoints` export declares `matches`, `runAt`, `excludeMatches`, `allFrames`, `matchAboutBlank` and `world` in the content script itself. The build reads these statically and calls `main()` on injection.
- **Pages:** each `<script type="module" src>` a page loads is bundled, and the tag is rewritten to the built file.
- **Existing projects are unchanged.** A config that writes entry paths, or a project with `src/ui/` or `src/content/`, builds exactly as before.
- **Validator:** `NO_ENTRYPOINTS` now recognises named entrypoints.
