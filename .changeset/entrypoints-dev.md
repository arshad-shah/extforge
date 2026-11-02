---
"extforge": minor
---

`extforge dev` in the named layout (#96 phase 4a).

- **React Fast Refresh** works for named-layout pages. Edits to a page's own script, or to anything inside its folder (`src/options/` for `src/options/index.html`), hot-swap without a reload. Shared code rebuilds and reloads everything.
- **Content-script reloads are targeted:** each named-layout content script and CSUI gets its own id, so editing one reloads only that one.
