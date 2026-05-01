# Design: HMR Robustness

**Date:** 2026-05-01 (deepened from outline 2026-05-01)
**Status:** Approved for implementation planning
**Repo:** `Documents/practice/extforge`
**Track:** 2 of 5

## Problem

Today's HMR works but rough-edges trip users:

1. **Every JS edit reloads every tab.** A content-script change forces every browser tab to refresh, even tabs the script doesn't match.
2. **No protocol version.** A new dev server with an old in-page client (or vice versa, after `pnpm install`) silently sends/receives messages the other side doesn't understand.
3. **Reconnect is brittle.** After ten attempts the client gives up and prints to console. Restarting `extforge dev` requires a manual page reload.
4. **No single source of truth for what reloaded and why.** Logs are split between server (terminal) and client (devtools console). Neither side prints a clean `[hmr] reloaded background.js — manifest unchanged — 38ms` summary.
5. **Stability matrix lives in heads, not docs.** Which entry-point gets which reload strategy is in `classifyChange`, but there's no user-facing reference.

This track makes HMR predictable, observable, and resilient — without changing any public config the user has to adopt.

## Goals

- Per-entry-point reload strategy is documented and consistent.
- Content-script JS edits reload only matched tabs.
- Protocol envelope is versioned; mismatch produces a clear, single message.
- Reconnect runs forever in dev with capped exponential backoff; visible status during reconnect.
- Every reload event prints exactly one line on each side, including reason and duration.
- Every change above is covered by tests where reasonable (server-side; the in-page client is harder to unit-test, see test strategy below).

## Non-goals

- React Fast Refresh / Vue HMR for component-level state preservation. That sits on top of the plugin API (Track 3).
- HMR for injected (page-realm) scripts. Excluded by design — the runtime can't update IIFE bundles in-place, and we don't leak a client into page realm.
- A general-purpose HMR runtime usable outside ExtForge.
- Replacing chokidar or `ws`.

## Backwards-compatibility constraint

- No required config changes. Existing `extforge.config.ts` keeps working.
- Behavior changes default to "additive": the new tab-matching is enabled automatically; users with no `content_scripts.matches` declared continue to get full-tab reloads (today's behavior). No existing project's `extforge dev` should produce *more* tab reloads than before.
- Old HMR clients (from a project on an older ExtForge that hasn't run `extforge build` since the bump) reconnect to a new server: server detects `v: undefined` envelope, prints once: `[hmr] dev client is from an older extforge build — restart \`extforge dev\` after the next build`. Server keeps the connection alive sending only legacy-shaped messages so the user is not stuck.
- Configuration *additions* in the schema are passthrough-tolerant. Any new `dev.hmr.*` key is optional.

---

## Pieces

### 1. Versioned protocol envelope

Today the server sends:

```json
{ "type": "css", "files": [...], "timestamp": 1719... }
```

Bump to:

```json
{ "v": 2, "type": "css", "files": [...], "timestamp": 1719... }
```

The server emits `v: 2` going forward. The client tolerates both (`v` undefined → treat as v1). On mismatch in either direction (e.g., a future v3 server talks to v2 client), the side that sees an unknown shape sends one `protocol-mismatch` notice and continues with no-ops. Server logs once per connection: `[hmr] client v=<n> incompatible with server v=2 — restart \`extforge dev\` after rebuild`.

The protocol version is a constant in `src/core/hmr/constants.ts`:

```ts
export const HMR_PROTOCOL_VERSION = 2 as const;
```

### 2. Targeted content-script reloads

Currently `handleJSUpdate` in `hmr-client.js.tpl` calls `location.reload()` unconditionally. Result: every tab reloads when any content-script JS changes — including tabs that don't match the changed script's `matches`.

**New flow:**
- Server side: when a `js` update fires, the server inspects the changed file paths against the user's manifest content-script entries and emits `{ type: 'js', files, scriptIds: [...] }`. `scriptId` is the index of the matching `content_scripts` entry in the resolved manifest (stable per build).
- The HMR client running in the page knows its own `scriptId` (injected at build time as a banner constant). When it receives a `js` update, it reloads ONLY if its `scriptId` is in `update.scriptIds`. Otherwise: ignore.
- For background/popup/sidepanel updates: the existing `full-reload` path is unchanged.
- For projects with no `content_scripts` declared, behavior is identical to today.

**Edge cases:**
- Multiple content scripts changed at once → all matched scripts in the union.
- A non-content-script JS file changes (shared util) → no `scriptIds` field → all clients reload (today's behavior preserved).
- A content script's `matches` glob is broad (`<all_urls>`) → effectively all tabs reload, same as today. We don't try to be clever.

### 3. Robust reconnect

Today's client: `MAX_RECONNECT = 10`, linear-ish delay capped at 5×. Result: after 10s of no server, the client gives up. User has to refresh.

**New behavior:**
- Backoff: 250ms → 500ms → 1000ms → 2000ms → 4000ms → 8000ms (cap). Reset on successful open.
- No max in dev mode. The client tries forever.
- Visible status: a 4×4 corner badge added to the page only when reconnecting (`<div data-extforge-hmr-status>...</div>`). It says "ExtForge HMR reconnecting…" with the attempt counter. Removed on connection. Light-DOM, dim styling, dismissible. Skipped for service-worker clients (no DOM).
- Console logs: one line per state change, no spam: `[hmr] disconnected — reconnecting in 1s (#3)`.

For service workers (`setupServiceWorkerHMR`), the same backoff applies, but no badge.

### 4. One-line observability

Server-side, every reload event ends with:

```
[hmr] reloaded background.js — manifest unchanged — 38ms (3 clients)
[hmr] reloaded content.css — css hot swap — 12ms (1 tab)
[hmr] reloaded sidepanel.html — full-reload — 41ms (1 client)
```

Format: `[hmr] reloaded <files> — <reason> — <duration>ms (<targets>)`

`<reason>` enum: `js`, `css hot swap`, `manifest`, `full-reload`, `assets`, `protocol-mismatch`. Reason is determined by the dispatch path, not re-derived in the logger.

Client-side, on every received update, one `console.log` line in the same format, prefixed `[ExtForge HMR]`. The verbose mode (`extforge dev --verbose`) adds a second line per change with the file paths.

### 5. Stability matrix as a constant

Move the per-entry-point reload strategy out of code branches and into one named constant:

```ts
// src/core/hmr/strategy.ts
export const HMR_STRATEGY = {
  background:  'extension-reload',
  popup:       'full-reload',
  sidepanel:   'full-reload',
  options:     'full-reload',
  content:     'tab-reload-targeted',
  injected:    'extension-reload', // page-realm cannot HMR
  manifest:    'extension-reload',
  css:         'css-swap',
  assets:      'extension-reload',
} as const;
```

`classifyChange` consumes this constant. Tests assert each entry resolves to the expected strategy. Documentation (Track 5) consumes the same constant via the docs generator.

### 6. `--once` mode (small, useful)

`extforge dev --once` performs a single rebuild + reload then exits with the build's exit code. Useful for CI smoke tests and scripted dev-loop tooling.

Spec: `--once` skips the watcher entirely. Builds, prints summary, exits.

---

## File layout

```
src/core/hmr/
  index.ts                    # existing — extended for protocol v2 and scriptId emission
  constants.ts                # existing — adds HMR_PROTOCOL_VERSION
  strategy.ts                 # NEW — single source of strategy matrix
src/core/scaffold/templates/
  hmr-client.js.tpl           # existing — extended client (badge, scriptId, v2)
src/core/builder/
  index.ts                    # existing — emits scriptId banner per content-script entry
tests/
  hmr.test.ts                 # existing — extend
  hmr-strategy.test.ts        # NEW
  hmr-protocol.test.ts        # NEW
```

## Test strategy

- **Server unit tests:** `classifyChange`, the strategy matrix, the change-debouncer, scriptId emission. Easy.
- **Protocol envelope tests:** small unit covering `v: undefined`, `v: 2`, future `v: 3` (mismatch path). Easy.
- **Integration test for targeted content-script reload:** spin up `createHMRServer`, connect a fake WebSocket client claiming `scriptId: 0`, change a file mapped to `scriptId: 1`, assert the fake client did not receive a reload directive. Doable.
- **Client-side behavior:** the in-page client (`hmr-client.js.tpl`) is JS string content, not unit-testable in isolation. Strategy: extract pure functions (`shouldReload(scriptId, update)`, `nextBackoffDelay(attempt)`) into `src/core/hmr/client-logic.ts`, import in the template via inline IIFE. Test the pure functions directly. Keeps the template thin.

## Open questions resolved

- **Reload-cause API for plugins?** Yes, but it lands in Track 3 with the plugin API. This track only adds the structured event type; `onDevReload` hook arrives later.
- **CSS-in-JS files** (Tailwind output) — counted as JS for reload purposes. The css-swap path is for actual `.css` files emitted by the build. Tailwind's output is regenerated and reloaded via the parent JS path. Document this.
- **Dev-overlay HUD** — out of scope for this track. The reconnect badge is the smallest viable surface.

## Success criteria

- Editing a content-script CSS file produces a CSS hot swap in matched tabs in under 200ms; no reload of unrelated tabs.
- Editing a content-script JS file reloads only matched tabs; verified by an integration test.
- Killing and restarting `extforge dev` reconnects open dev clients within 10 seconds with no manual page reload, on any browser; the reconnect badge appears during the gap.
- Every reload event has a single, actionable log line on both server and client.
- Existing extensions upgrade with no config change and observe equal-or-better behavior. The "no project sees more reloads than today" invariant holds.
- All existing HMR tests pass; new tests cover protocol version, scriptId targeting, backoff math, strategy matrix.
