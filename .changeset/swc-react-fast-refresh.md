---
"extforge": minor
---

True 0-reload UI updates via SWC + React Fast Refresh.

- New esbuild plugin `extforge/hmr/swc/refresh-plugin` runs `@swc/core` over `.tsx` / `.jsx` in dev mode with `react.refresh: true`. SWC chosen over Babel for ~20× faster transforms.
- `@swc/core` and `react-refresh` are **optional peer deps**. Install them to get RFR; without them dev mode falls back to esbuild's TS/JSX loader (current full-reload behavior) with a single warning.
- HMR protocol bumped to **v3**. v2 envelopes still emitted for non-hot-applicable changes (manifest / background / content scripts / CSS / assets). v3 envelopes (`{ v:3, type:'hmr-update', updates:[{id, hash, file}] }`) emitted for popup/options/sidepanel-only JS changes — client refetches `chrome-extension://<id>/<file>?t=<hash>` and the new module's RFR header calls `performReactRefresh()` to update the DOM in place with state preserved.
- New module registry runtime at `src/core/hmr/runtime.ts` with `accept` / `dispose` / `decline` primitives, attached to `globalThis.__EXTFORGE_HMR__`.
- Phase 6 scaffolding: `src/core/hmr/content-script.ts` generates a dev-only background snippet that registers content scripts dynamically via `chrome.scripting.registerContentScripts` and re-registers on HMR. Opt-in via `extforge.config.ts` `hmr.contentScripts: 'dynamic'`.
