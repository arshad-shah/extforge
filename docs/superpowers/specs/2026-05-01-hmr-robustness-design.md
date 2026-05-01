# Design: HMR Robustness

**Date:** 2026-05-01
**Status:** Outline — to be deepened before implementation
**Repo:** `Documents/practice/extforge`
**Track:** 2 of 5

## Problem

Browser-extension HMR is the feature users compare tools on, and also the feature that breaks in subtle ways. Today ExtForge rebuilds on change and signals the dev client over WebSocket, but: content-script reloads can leave orphaned listeners; CSS swaps are partially formalized; reconnect after a dev-server restart is flaky; and the user has no clear log of "what reloaded and why." A content-script edit that requires a tab reload looks identical in the terminal to one that did a hot CSS swap.

This track makes HMR predictable, observable, and resilient — without adding any new public config surface that existing extensions need to adopt.

## Goals

- Per-entry-point reload strategy is documented and consistent.
- CSS edits never trigger a JS reload when avoidable.
- Content-script JS edits do a clean tab reload (no listener leaks) by default, with an opt-in path for advanced users to keep state.
- WebSocket client survives dev-server restarts (exponential backoff, capped, with a visible status).
- Every reload prints one line: `[hmr] reloaded background.js (manifest unchanged) — 38ms`.
- Reload protocol is versioned so future changes don't silently desync clients.

## Non-goals

- React Fast Refresh / Vue HMR for component-level state preservation. That's a track-3 plugin once the plugin API exists.
- HMR for injected (page-realm) scripts. Already explicitly excluded; not changing.
- A general-purpose HMR runtime usable outside ExtForge.

## Backwards compatibility

- No config changes required for existing projects.
- Old dev clients (from a project on an older ExtForge) reconnecting to a new server: the server detects protocol version mismatch and prints a clear "rebuild your dev client / restart `extforge dev`" message instead of misbehaving.
- New behavior is opt-in via existing config keys we extend (e.g., `dev.reload`), never via a required new key.

## Approach (sketch — to deepen)

1. **Reload strategy matrix** — formalize as a table per entry-point type: background, popup, side panel, content, injected, manifest, icons, CSS. Source-of-truth lives in `src/core/hmr/strategy.ts`.
2. **Protocol versioning** — bump message envelope to `{ v: 2, type, payload }`. Server rejects mismatched clients with a typed error.
3. **CSS hot swap** — already partial; finish so any `*.css` edit reaches the page via DOM `<link>` swap with cache-busting query, no JS reload.
4. **Content-script reload** — rebuild → tell background to `chrome.tabs.reload(tabId)` for matched URLs. Document the listener-leak issue and the rationale for full tab reload as default.
5. **Reconnect** — exponential backoff (250ms → 8s, capped), visible status in the badge / dev overlay. Reconnect is silent on success.
6. **Observability** — single one-line log per reload, with reason. Verbose mode (`extforge dev --verbose`) prints the change set.

## Key decisions to make in the plan

- Whether to add a thin in-page dev overlay (HUD) or stick to terminal-only logs.
- Whether to expose a reload-cause API for plugins (track 3 dependency).
- Whether CSS-in-JS files (e.g., emitted by Tailwind) count as CSS or JS for reload purposes.

## Open questions

- Do we want a `--once` mode that does a single rebuild + reload then exits, useful for CI smoke tests? Probably yes; cheap.
- How do we surface reload protocol mismatch to users without being noisy on legitimate reconnects?

## Success criteria

- Editing a content-script CSS file results in styles changing in the page within 200ms with no tab reload.
- Editing a content-script JS file reloads only matched tabs, leaving unrelated tabs untouched.
- Killing and restarting `extforge dev` reconnects open dev clients within 10 seconds with no manual page reload.
- Every reload event has a single, actionable log line.
- Existing extensions upgrade with no config change and observe equal-or-better behavior.
