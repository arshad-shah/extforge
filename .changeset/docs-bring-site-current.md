---
"extforge": patch
---

docs: bring the docs site current with the audit-fix work

- `index.mdx` and `guides/hmr.mdx` document the new dev error overlay
  (Shadow-DOM-isolated, source frame with caret, hint, docs link,
  collapsible stack) and the `build-error` / `build-ok` HMR envelopes.
- `reference/runtime/csui.mdx` documents the new `remountOn` option
  (navigation / mutation / custom subscriber) for SPA hosts that swap
  the DOM.
- `reference/runtime/storage.mdx` documents `StorageQuotaExceededError`
  and clarifies the round-trip semantics in the localStorage fallback.
- `reference/runtime/messaging.mdx` documents the `PortChannel`
  surface, including the new `onDisconnect(reason?)` hook and the
  auto-cleanup of message listeners.
- `reference/cli/commands.mdx` documents the cross-platform packager
  (system `zip` preferred, pure-Node fallback) and the archive name
  sanitisation.
- `reference/cli/flags.mdx` documents the parser change that rejects
  leading-dash values for string flags.
- `reference/config/index.mdx` documents deep-merge semantics for
  nested object keys and the `EXTFORGE_STRICT_CONFIG` escape hatch.
- `guides/cross-browser.mdx` documents the recursive-walk compat
  scanner, optional-chaining support, regex-literal ignoring, and the
  expanded `browserOverrides` surface.
