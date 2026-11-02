---
"extforge": minor
---

The named layout now covers the rest of the MV3 surface (#96 phase 3).

- **Pages:** `devtools.html` (`devtools_page`), `newtab.html`/`history.html`/`bookmarks.html` (`chrome_url_overrides`), `offscreen.html` and `<x>.offscreen.html` (offscreen documents), `<x>.sandbox.html` (`sandbox.pages`), and any other HTML directly in `src/` as an unlisted page.
- **Scripts:** `<x>.csui.tsx` (CSUI), `<x>.injected.ts` (main-world, web-accessible) and `<x>.unlisted.ts` (classic script with no manifest key) directly in `src/`.
- **Manifest config:** new `devtoolsPage`, `chromeUrlOverrides` and `sandbox` fields, usable from hand-written configs too. Overrides are filtered per browser (Firefox and Safari: `newtab` only), and sandbox is emitted on Chrome and Edge only.
- **Warnings and errors:** entries a browser can't use are left out of its manifest with a warning. Two URL overrides, or two entries writing the same file, fail the build.
