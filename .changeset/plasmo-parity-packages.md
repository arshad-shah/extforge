---
"extforge": minor
---

Add Plasmo-parity first-party packages.

- **`extforge/storage`** — typed `Storage` class wrapping `chrome.storage.{local,sync,session,managed}` with watch API, namespaces, and a transparent `localStorage` fallback for non-extension contexts.
- **`extforge/storage/react`** — `useStorage(key, defaultValue)` hook in its own subpath so the core stays React-free.
- **`extforge/messaging`** — typed RPC over `chrome.runtime`. `defineHandler` / `sendMessage` with full inference via the augmentable `MessageMap` interface. Plus `sendMessageToTab`, `openPort` / `onPort` for long-lived connections.
- **`extforge/csui`** — Content Script UI runtime. `defineCSUI(options, render)` declares a Shadow-DOM-mounted UI; auto-mounts on import in DOM contexts so `export default defineCSUI(...)` works without a separate call. Files matching `src/contents/*.csui.{ts,tsx}` are auto-discovered by the builder and added to the manifest's `content_scripts` from the statically-extracted `matches:` array.
- **`extforge/env`** — build-time `.env` loader with Vite-style precedence. Variables prefixed `EXTFORGE_PUBLIC_` are inlined into bundles via esbuild's `define`.

`react` is now an optional peer dep (used only by `extforge/storage/react`).
