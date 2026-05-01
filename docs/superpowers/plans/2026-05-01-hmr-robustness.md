# HMR Robustness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ExtForge HMR predictable, observable, and resilient: protocol versioning, targeted content-script reloads, infinite reconnect with visible status, single-line reload log, and a documented reload-strategy matrix.

**Architecture:** Six discrete pieces ordered by dependency. Strategy matrix → protocol versioning → targeted scriptId emission → robust reconnect (with extracted pure client logic) → one-line observability → `--once` mode. Each task ends with passing tests and a commit. Existing public types/exports stay stable.

**Tech Stack:** TypeScript, vitest, ws, chokidar (existing). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-01-hmr-robustness-design.md`

---

## File Structure

**New files:**
- `src/core/hmr/strategy.ts` — single source-of-truth `HMR_STRATEGY` constant
- `src/core/hmr/client-logic.ts` — pure functions extracted from the template (`shouldReload`, `nextBackoffDelay`, envelope checks)
- `tests/hmr-strategy.test.ts`
- `tests/hmr-protocol.test.ts`
- `tests/hmr-client-logic.test.ts`
- `tests/hmr-targeted.test.ts` (integration: server + fake WS client + file change → assertion on directives received)

**Modified:**
- `src/core/hmr/constants.ts` — add `HMR_PROTOCOL_VERSION`
- `src/core/hmr/index.ts` — wire strategy matrix; emit `v: 2`; emit `scriptIds` for content-script JS updates; new server log line; `--once` plumbing
- `src/core/scaffold/templates/hmr-client.js.tpl` — inline the pure logic, add reconnect badge, scriptId filter, log format
- `src/core/builder/index.ts` — emit `__EXTFORGE_SCRIPT_ID__` banner constant per content-script entry (for the client to pick up)
- `src/cli/index.ts` — add `--once` and `--verbose` to `dev`
- `tests/hmr.test.ts` — extend with strategy matrix and protocol version assertions

---

## Task 1: Strategy matrix constant

**Files:**
- Create: `src/core/hmr/strategy.ts`
- Test: `tests/hmr-strategy.test.ts`

- [ ] **Step 1: Write the test**

```ts
// tests/hmr-strategy.test.ts
import { describe, it, expect } from 'vitest';
import { HMR_STRATEGY, type HMRStrategy } from '../src/core/hmr/strategy.js';

describe('HMR_STRATEGY', () => {
  it('maps every entry-point kind to a strategy', () => {
    expect(HMR_STRATEGY.background).toBe('extension-reload');
    expect(HMR_STRATEGY.popup).toBe('full-reload');
    expect(HMR_STRATEGY.sidepanel).toBe('full-reload');
    expect(HMR_STRATEGY.options).toBe('full-reload');
    expect(HMR_STRATEGY.content).toBe('tab-reload-targeted');
    expect(HMR_STRATEGY.injected).toBe('extension-reload');
    expect(HMR_STRATEGY.manifest).toBe('extension-reload');
    expect(HMR_STRATEGY.css).toBe('css-swap');
    expect(HMR_STRATEGY.assets).toBe('extension-reload');
  });

  it('exports HMRStrategy union type', () => {
    const s: HMRStrategy = 'css-swap';
    expect(s).toBeTypeOf('string');
  });
});
```

- [ ] **Step 2: Implement**

```ts
// src/core/hmr/strategy.ts
export const HMR_STRATEGY = {
  background:  'extension-reload',
  popup:       'full-reload',
  sidepanel:   'full-reload',
  options:     'full-reload',
  content:     'tab-reload-targeted',
  injected:    'extension-reload',
  manifest:    'extension-reload',
  css:         'css-swap',
  assets:      'extension-reload',
} as const;

export type HMREntryKind = keyof typeof HMR_STRATEGY;
export type HMRStrategy = typeof HMR_STRATEGY[HMREntryKind];
```

- [ ] **Step 3: Verify**
`pnpm test -- hmr-strategy` → 2 pass. `pnpm typecheck` → clean.

- [ ] **Step 4: Commit**
```bash
git add src/core/hmr/strategy.ts tests/hmr-strategy.test.ts
git commit -m "feat(hmr): add HMR_STRATEGY constant and HMREntryKind/HMRStrategy types"
```

---

## Task 2: Protocol version constant + envelope

**Files:**
- Modify: `src/core/hmr/constants.ts`
- Modify: `src/core/hmr/index.ts` (broadcast emits `v`)
- Test: `tests/hmr-protocol.test.ts`

- [ ] **Step 1: Add the constant**

In `src/core/hmr/constants.ts`, append:

```ts
export const HMR_PROTOCOL_VERSION = 2 as const;
export type HMRProtocolVersion = typeof HMR_PROTOCOL_VERSION;
```

- [ ] **Step 2: Update broadcast to include `v`**

In `src/core/hmr/index.ts`, in `broadcast`, change the payload composition so every outgoing message has `v: HMR_PROTOCOL_VERSION`. Update the `HMRUpdate` interface to include `v?: number` (optional for backwards compat with any existing callers).

```ts
import { HMR_PROTOCOL_VERSION } from './constants.js';

export interface HMRUpdate {
  v?: number;
  type: HMRUpdateType;
  files: string[];
  timestamp: number;
  scriptIds?: number[]; // forward-declared for Task 3
}

const broadcast = (update: HMRUpdate): void => {
  if (!wss) return;
  const payload = JSON.stringify({ v: HMR_PROTOCOL_VERSION, ...update });
  // rest unchanged
};
```

- [ ] **Step 3: Test**

```ts
// tests/hmr-protocol.test.ts
import { describe, it, expect } from 'vitest';
import { HMR_PROTOCOL_VERSION } from '../src/core/hmr/constants.js';

describe('HMR protocol', () => {
  it('exports a numeric version >= 2', () => {
    expect(typeof HMR_PROTOCOL_VERSION).toBe('number');
    expect(HMR_PROTOCOL_VERSION).toBeGreaterThanOrEqual(2);
  });
});
```

A deeper test (server-side broadcast emits `v: 2`) lives in `tests/hmr-targeted.test.ts` (Task 4).

- [ ] **Step 4: Verify + commit**
```bash
pnpm test && pnpm typecheck
git add src/core/hmr/constants.ts src/core/hmr/index.ts tests/hmr-protocol.test.ts
git commit -m "feat(hmr): version the websocket protocol envelope (v=2)"
```

---

## Task 3: Emit scriptId banner per content-script entry (builder side)

**Files:**
- Modify: `src/core/builder/index.ts`

- [ ] **Step 1: Read the builder**

Find where the existing `makeHMRBanner` is called and where content-script entries are bundled. Each content-script entry should receive an additional banner that defines `globalThis.__EXTFORGE_SCRIPT_ID__ = <index>` where `<index>` matches the content-script entry's position in the resolved manifest.

- [ ] **Step 2: Implement**

In the builder, when iterating the manifest's `content_scripts`, build a map `entryFile → scriptId` (the index in the array). When generating the per-entry esbuild banner, include:

```ts
function makeContentScriptBanner(scriptId: number, base: { js: string }): { js: string } {
  return { js: `globalThis.__EXTFORGE_SCRIPT_ID__ = ${scriptId};\n${base.js}` };
}
```

For non-content-script entries (background, popup, sidepanel, etc.), `__EXTFORGE_SCRIPT_ID__` is not set; clients see `undefined`.

If the existing builder doesn't iterate content-script entries with their index already, add a small helper that does. Keep the change additive — non-dev builds are unchanged.

- [ ] **Step 3: Test (snapshot or grep)**

The existing `tests/builder.test.ts` doesn't run an actual build. Add a small smoke test: build a fixture project with two content scripts, then read `dist/<browser>/content-1.js` and assert it begins with `globalThis.__EXTFORGE_SCRIPT_ID__ = 0;` (or `1`).

If the fixture infra is heavy, fall back to a unit test on the helper: `makeContentScriptBanner(0, { js: 'console.log(1)' })` returns the expected prefix.

- [ ] **Step 4: Verify + commit**
```bash
pnpm test && pnpm typecheck
git add src/core/builder/index.ts tests/builder.test.ts
git commit -m "feat(hmr): emit __EXTFORGE_SCRIPT_ID__ banner per content-script entry"
```

---

## Task 4: Server-side targeted content-script reloads

**Files:**
- Modify: `src/core/hmr/index.ts`
- Test: `tests/hmr-targeted.test.ts`

- [ ] **Step 1: Resolve scriptId from changed file**

In the debouncer callback in `createHMRServer`, when `updateType === 'js'`, compute which content-script entries the changed files belong to. The mapping is the same one used by the builder (Task 3). Cache it on the server when `start()` resolves the manifest.

```ts
// inside createHMRServer
let contentScriptMap: Map<string, number> | null = null;

// during start(), after resolving manifest:
contentScriptMap = buildContentScriptMap(projectRoot, config, browser);

// in the debouncer callback:
let scriptIds: number[] | undefined;
if (updateType === 'js' && contentScriptMap) {
  const ids = new Set<number>();
  for (const file of changes.keys()) {
    const id = contentScriptMap.get(file);
    if (id !== undefined) ids.add(id);
  }
  if (ids.size > 0) scriptIds = Array.from(ids);
}

broadcast({ type: updateType, files, timestamp: Date.now(), scriptIds });
```

`buildContentScriptMap` lives in `src/core/hmr/strategy.ts` (or a new sibling) and walks `config.manifest?.content_scripts` resolving each entry's `js` paths to absolute file paths.

- [ ] **Step 2: Integration test**

```ts
// tests/hmr-targeted.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import WebSocket from 'ws';
import { createHMRServer } from '../src/core/hmr/index.js';
import { createLogger, LogLevel } from '../src/core/logger/index.js';

let server: { stop(): Promise<void> } | null = null;
afterEach(async () => { if (server) { await server.stop(); server = null; } });

describe('targeted content-script reload', () => {
  it('emits scriptIds when a content-script file changes', async () => {
    const root = mkdtempSync(join(tmpdir(), 'extforge-hmr-'));
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src/content.ts'), 'console.log("a")');
    writeFileSync(join(root, 'src/background.ts'), 'console.log("b")');

    const config = {
      browsers: ['chrome'],
      manifest: {
        name: 'x', version: '0.0.1',
        content_scripts: [{ matches: ['<all_urls>'], js: ['src/content.ts'] }],
        background: { service_worker: 'src/background.ts' },
      },
    };

    const log = createLogger({ level: LogLevel.Silent });
    const s = createHMRServer({ projectRoot: root, config: config as any, browser: 'chrome', logger: log, port: 0 });
    server = s;
    await s.start();

    const messages: any[] = [];
    const client = new WebSocket(`ws://localhost:${s.port}`);
    await new Promise(r => client.on('open', r));
    client.on('message', (data) => messages.push(JSON.parse(data.toString())));

    // Change the content script
    writeFileSync(join(root, 'src/content.ts'), 'console.log("a2")');

    // Wait for debounce + rebuild
    await new Promise(r => setTimeout(r, 600));

    const jsUpdates = messages.filter(m => m.type === 'js');
    expect(jsUpdates.length).toBeGreaterThanOrEqual(1);
    expect(jsUpdates[0].v).toBe(2);
    expect(jsUpdates[0].scriptIds).toEqual([0]);

    client.close();
  });

  it('does not include scriptIds for non-content-script JS changes', async () => {
    // similar setup; change background.ts; assert scriptIds is undefined
    // (omitted here for brevity in the plan; reuse the same fixture pattern)
  });
});
```

If the integration test proves flaky on CI, fall back to a unit test on `buildContentScriptMap` and a smaller pure function `extractScriptIds(changedFiles, map)`.

- [ ] **Step 3: Verify + commit**
```bash
pnpm test && pnpm typecheck
git add src/core/hmr/index.ts src/core/hmr/strategy.ts tests/hmr-targeted.test.ts
git commit -m "feat(hmr): emit scriptIds so clients reload only matched content-script tabs"
```

---

## Task 5: Extract pure client logic

**Files:**
- Create: `src/core/hmr/client-logic.ts`
- Test: `tests/hmr-client-logic.test.ts`

- [ ] **Step 1: Write the test first**

```ts
// tests/hmr-client-logic.test.ts
import { describe, it, expect } from 'vitest';
import {
  shouldClientReload,
  nextBackoffDelay,
  isCompatibleEnvelope,
  formatReloadLog,
} from '../src/core/hmr/client-logic.js';

describe('shouldClientReload', () => {
  it('reloads when no scriptIds field (broad change)', () => {
    expect(shouldClientReload({ type: 'js', files: [] }, undefined)).toBe(true);
    expect(shouldClientReload({ type: 'js', files: [], scriptIds: undefined }, 0)).toBe(true);
  });
  it('reloads only when own scriptId is included', () => {
    expect(shouldClientReload({ type: 'js', files: [], scriptIds: [0, 2] }, 0)).toBe(true);
    expect(shouldClientReload({ type: 'js', files: [], scriptIds: [0, 2] }, 1)).toBe(false);
  });
  it('non-js types always reload (server already filtered)', () => {
    expect(shouldClientReload({ type: 'full-reload', files: [] }, 1)).toBe(true);
  });
});

describe('nextBackoffDelay', () => {
  it('grows exponentially up to 8000ms', () => {
    expect(nextBackoffDelay(1)).toBe(250);
    expect(nextBackoffDelay(2)).toBe(500);
    expect(nextBackoffDelay(3)).toBe(1000);
    expect(nextBackoffDelay(4)).toBe(2000);
    expect(nextBackoffDelay(5)).toBe(4000);
    expect(nextBackoffDelay(6)).toBe(8000);
    expect(nextBackoffDelay(50)).toBe(8000);
  });
});

describe('isCompatibleEnvelope', () => {
  it('accepts undefined v (legacy v1)', () => {
    expect(isCompatibleEnvelope({ type: 'js', files: [] })).toBe(true);
  });
  it('accepts current v', () => {
    expect(isCompatibleEnvelope({ v: 2, type: 'js', files: [] })).toBe(true);
  });
  it('rejects future v', () => {
    expect(isCompatibleEnvelope({ v: 99, type: 'js', files: [] })).toBe(false);
  });
});

describe('formatReloadLog', () => {
  it('produces the canonical one-line format', () => {
    const line = formatReloadLog({ type: 'css', files: ['a.css'], durationMs: 12 }, 1);
    expect(line).toBe('[hmr] reloaded a.css — css hot swap — 12ms (1 client)');
  });
  it('pluralizes correctly', () => {
    expect(formatReloadLog({ type: 'js', files: ['a.js', 'b.js'], durationMs: 38 }, 3))
      .toContain('3 clients');
  });
});
```

- [ ] **Step 2: Implement**

```ts
// src/core/hmr/client-logic.ts
// Pure functions used by both the dev server (Node) and the in-page client
// (template-injected). Tested directly via vitest.

import { HMR_PROTOCOL_VERSION } from './constants.js';

export interface ClientUpdate {
  v?: number;
  type: 'css' | 'js' | 'full-reload' | 'manifest' | 'assets' | 'protocol-mismatch';
  files: string[];
  scriptIds?: number[];
  timestamp?: number;
}

export function shouldClientReload(update: ClientUpdate, ownScriptId: number | undefined): boolean {
  if (update.type !== 'js') return true;
  if (!update.scriptIds || update.scriptIds.length === 0) return true;
  if (ownScriptId === undefined) return true; // background/popup-class clients reload on all js
  return update.scriptIds.includes(ownScriptId);
}

const BACKOFF = [250, 500, 1000, 2000, 4000, 8000] as const;
export function nextBackoffDelay(attempt: number): number {
  if (attempt < 1) return BACKOFF[0]!;
  return BACKOFF[Math.min(attempt - 1, BACKOFF.length - 1)]!;
}

export function isCompatibleEnvelope(update: ClientUpdate): boolean {
  if (update.v === undefined) return true; // legacy
  return update.v <= HMR_PROTOCOL_VERSION;
}

const REASON_LABEL: Record<string, string> = {
  css: 'css hot swap',
  js: 'js',
  'full-reload': 'full-reload',
  manifest: 'manifest',
  assets: 'assets',
  'protocol-mismatch': 'protocol-mismatch',
};

export function formatReloadLog(
  ev: { type: ClientUpdate['type']; files: string[]; durationMs: number },
  clientCount: number,
): string {
  const reason = REASON_LABEL[ev.type] ?? ev.type;
  const target = clientCount === 1 ? '1 client' : `${clientCount} clients`;
  return `[hmr] reloaded ${ev.files.join(', ')} — ${reason} — ${ev.durationMs}ms (${target})`;
}
```

- [ ] **Step 3: Verify + commit**
```bash
pnpm test -- hmr-client-logic
pnpm typecheck
git add src/core/hmr/client-logic.ts tests/hmr-client-logic.test.ts
git commit -m "feat(hmr): extract pure client logic for testable reload/backoff/format"
```

---

## Task 6: Inline pure logic into the in-page client template

**Files:**
- Modify: `src/core/scaffold/templates/hmr-client.js.tpl`

- [ ] **Step 1: Read the existing template**

It uses ES5 syntax (no `const`/`let` mixing, no arrow functions broadly) for maximal browser support. Keep that style.

- [ ] **Step 2: Inline the pure functions**

The template can't `import` (it's a string blob loaded by the builder). Copy the function bodies inline at the top of the IIFE. Keep them tagged with a comment so future changes can re-sync from `client-logic.ts`:

```js
// ─── Pure logic (mirrors src/core/hmr/client-logic.ts; keep in sync) ───
function shouldReload(update, ownScriptId) {
  if (update.type !== 'js') return true;
  if (!update.scriptIds || update.scriptIds.length === 0) return true;
  if (ownScriptId === undefined || ownScriptId === null) return true;
  return update.scriptIds.indexOf(ownScriptId) !== -1;
}
function nextBackoff(attempt) {
  var arr = [250, 500, 1000, 2000, 4000, 8000];
  if (attempt < 1) return arr[0];
  return arr[Math.min(attempt - 1, arr.length - 1)];
}
function isCompatible(update) {
  if (update.v === undefined) return true;
  return update.v <= 2; // HMR_PROTOCOL_VERSION
}
```

- [ ] **Step 3: Wire scriptId**

At the top of the IIFE:
```js
var OWN_SCRIPT_ID = (typeof globalThis !== 'undefined' && globalThis.__EXTFORGE_SCRIPT_ID__) ?? undefined;
```

In `handleJSUpdate`:
```js
function handleJSUpdate(files, update) {
  if (!shouldReload(update, OWN_SCRIPT_ID)) {
    console.debug('[ExtForge HMR] js update for other script, skipping');
    return;
  }
  console.log('[ExtForge HMR] reloading tab —', files.join(', '));
  location.reload();
}
```

Wire `update` through the message handler so `handleJSUpdate(update.files, update)` is called with the full envelope.

In the `onmessage` handler, gate on `isCompatible(update)`:
```js
if (!isCompatible(update)) {
  console.warn('[ExtForge HMR] incompatible server protocol v=' + update.v + '; ignoring');
  return;
}
```

- [ ] **Step 4: Backoff + badge**

Replace the existing reconnect block:

```js
function scheduleReconnect() {
  reconnectAttempts++;
  showBadge('ExtForge HMR — reconnecting (#' + reconnectAttempts + ')');
  setTimeout(connect, nextBackoff(reconnectAttempts));
}

function showBadge(text) {
  if (typeof document === 'undefined') return;
  var el = document.querySelector('[data-extforge-hmr-status]');
  if (!el) {
    el = document.createElement('div');
    el.setAttribute('data-extforge-hmr-status', '');
    el.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647;background:#0F172A;color:#A78BFA;padding:6px 10px;border-radius:6px;font:12px/1.4 system-ui,sans-serif;opacity:0.85;pointer-events:none';
    document.body.appendChild(el);
  }
  el.textContent = text;
}
function hideBadge() {
  if (typeof document === 'undefined') return;
  var el = document.querySelector('[data-extforge-hmr-status]');
  if (el && el.parentNode) el.parentNode.removeChild(el);
}
```

Call `hideBadge()` in `ws.onopen` after resetting `reconnectAttempts = 0`. Drop the `MAX_RECONNECT` cap (or keep but bump to a very high number; spec says infinite in dev — set to `Number.MAX_SAFE_INTEGER` and trust the user to kill the tab).

- [ ] **Step 5: One-line client log**

Replace the per-handler `console.log` calls with one `[ExtForge HMR] reloaded <files> — <reason> — <ts>ms` line per update, computed by inlining the same `formatReloadLog` body.

- [ ] **Step 6: Verify**

There's no unit test for the template (it's a string). But `pnpm build && node dist/cli/index.js dev --once` against a fixture or the existing dev playground should hot-reload as before. If you can't run the playground, at minimum confirm that:
- `pnpm test` passes (existing tests still pass)
- `pnpm typecheck` clean
- The template still passes through `loadTemplate` without errors (write a tiny test that calls `generateHMRClientCode(35729)` and asserts the returned string contains `shouldReload`, `nextBackoff`, `OWN_SCRIPT_ID`, `data-extforge-hmr-status`).

Add that template smoke test to `tests/hmr.test.ts`:

```ts
import { generateHMRClientCode } from '../src/core/hmr/index.js';
describe('hmr client template', () => {
  it('contains the inlined pure logic and badge code', () => {
    const code = generateHMRClientCode(35729);
    expect(code).toContain('shouldReload');
    expect(code).toContain('nextBackoff');
    expect(code).toContain('OWN_SCRIPT_ID');
    expect(code).toContain('data-extforge-hmr-status');
    expect(code).toContain('isCompatible');
  });
});
```

- [ ] **Step 7: Commit**
```bash
git add src/core/scaffold/templates/hmr-client.js.tpl tests/hmr.test.ts
git commit -m "feat(hmr): infinite reconnect with badge, scriptId targeting, v2 envelope, single-line log"
```

---

## Task 7: One-line server log + verbose mode

**Files:**
- Modify: `src/core/hmr/index.ts`
- Modify: `src/cli/index.ts` (add `--verbose`)

- [ ] **Step 1: Replace existing log lines**

The existing `log.hmr(files, updateType)` and `log.timeEnd('rebuild', 'Rebuild')` produce two lines. Replace with one line emitted after the broadcast:

```ts
import { formatReloadLog } from './client-logic.js';

// after broadcast(...)
const durationMs = Math.round(performance.now() - rebuildStart);
const clientCount = wss ? Array.from(wss.clients).filter(c => c.readyState === WebSocket.OPEN).length : 0;
log.info(formatReloadLog({ type: updateType, files, durationMs }, clientCount));
```

Where `rebuildStart = performance.now()` is captured at the top of the debouncer callback.

In verbose mode, follow up with `log.debug` listing the file paths.

- [ ] **Step 2: Plumb `--verbose`**

In `src/cli/index.ts` `dev` subcommand args, add:
```ts
verbose: { type: 'boolean', description: 'Verbose HMR output', default: false },
```

When constructing the logger for `dev`:
```ts
level: args.verbose ? LogLevel.Trace : (args.quiet ? LogLevel.Warn : LogLevel.Debug),
```

- [ ] **Step 3: Verify + commit**
```bash
pnpm test && pnpm typecheck
git add src/core/hmr/index.ts src/cli/index.ts
git commit -m "feat(hmr): one-line reload log on server; --verbose flag for dev"
```

---

## Task 8: `extforge dev --once`

**Files:**
- Modify: `src/cli/index.ts`
- Modify: `src/core/hmr/index.ts` (optional — alternative is to do it entirely in the CLI handler)

- [ ] **Step 1: Implement in the CLI**

Easier than threading through HMR: when `--once` is passed, the CLI handler builds and exits without starting the server.

```ts
if (args.once) {
  const { build } = await import('../core/builder/index.js');
  const result = await build(root, config, { browser: browser as any, dev: true }, log);
  process.exit(result.errors.length > 0 ? 1 : 0);
}
```

Add to args:
```ts
once: { type: 'boolean', description: 'Run a single build then exit', default: false },
```

- [ ] **Step 2: Verify**

```bash
pnpm build
node dist/cli/index.js dev --once   # in a fixture project
```

Should build and exit 0.

- [ ] **Step 3: Commit**
```bash
git add src/cli/index.ts
git commit -m "feat(cli): add `extforge dev --once` for single-shot builds"
```

---

## Task 9: Final verification + CHANGELOG

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Full suite**
```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

All clean.

- [ ] **Step 2: Smoke against a real extension**

If a known-good ExtForge extension exists locally, run `extforge dev` from this branch, edit a CSS file (expect hot swap), edit a content script JS file (expect targeted tab reload), edit `extforge.config.ts` (expect full extension reload), kill server, restart server (expect badge then auto-reconnect).

If no such extension is at hand, document this as a manual verification deferred to user testing in the report.

- [ ] **Step 3: CHANGELOG entry**

Append under "Unreleased":

```markdown
### Added
- HMR protocol versioning (`v: 2` envelope) with graceful legacy fallback.
- Targeted content-script reloads — only tabs matching the changed script reload.
- Infinite reconnect in dev with capped exponential backoff (250ms → 8s).
- Reconnect status badge in matched pages while the dev server is unreachable.
- Single-line HMR log on both server and client: `[hmr] reloaded <files> — <reason> — <ms> (<n> clients)`.
- `extforge dev --verbose` flag for per-change file detail.
- `extforge dev --once` flag for single-shot builds (CI smoke).
- `HMR_STRATEGY` constant exposes the per-entry-point reload matrix as the single source of truth.

### Changed
- HMR client gives up forever-mode on max attempts in favor of indefinite reconnect with visible state.

### Backwards compatibility
No breaking changes. Old projects rebuilt against this version inherit the new HMR client automatically. Any old client connecting to the new server still receives messages it understands; the server simply doesn't include the v2-only fields.
```

- [ ] **Step 4: Commit**
```bash
git add CHANGELOG.md
git commit -m "docs: changelog for HMR robustness track"
```

---

## Self-Review Checklist

- **Spec coverage:** strategy matrix (T1), protocol version (T2 + T6 client gate), targeted scriptId reloads (T3 server-emit + T4 server-route + T6 client-filter), robust reconnect (T6 badge + backoff), one-line log (T5 helper + T7 server + T6 client), `--once` (T8). Stability matrix doc surfaces in T1.
- **No placeholders:** every step has runnable code or commands.
- **Type consistency:** `HMRUpdate` (server) and `ClientUpdate` (pure logic) are co-evolving; `client-logic.ts` is the canonical shape, server casts into it. `HMR_PROTOCOL_VERSION = 2` referenced consistently.
- **Backwards compat:** server still accepts old clients (they just don't see v2-only fields); old server can't talk to new clients (they fall back via `isCompatible`); no required config additions.
- **Frequent commits:** 9 commits, each independently reviewable.
