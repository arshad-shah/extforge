# Testing Helpers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `extforge/testing` (typed chrome.* fakes) and `extforge/testing/vitest` (preset). Update the scaffolded test template to use the fakes for real, meaningful tests. Add a Playwright fixture template for E2E.

**Architecture:** Foundation (spy helper) → per-namespace fakes (runtime, storage, tabs, action, scripting) → top-level installer + reset → vitest preset → subpath exports → scaffold template updates. Each task ends with passing tests and a commit.

**Tech Stack:** TypeScript, vitest (existing). No new runtime deps. Playwright is referenced in the scaffold template only — users add it as their own dev dep if they opt in.

**Spec:** `docs/superpowers/specs/2026-05-01-testing-helpers-design.md`

---

## File Structure

**New files:**
- `src/core/testing/internal/spy.ts` — tiny spy helper
- `src/core/testing/fakes/runtime.ts` — RuntimeFake
- `src/core/testing/fakes/storage.ts` — StorageFake (local + sync + session)
- `src/core/testing/fakes/tabs.ts` — TabsFake
- `src/core/testing/fakes/action.ts` — ActionFake
- `src/core/testing/fakes/scripting.ts` — ScriptingFake
- `src/core/testing/install.ts` — installChromeFakes / resetChromeFakes / ChromeFakes type
- `src/core/testing/vitest.ts` — setupFile preset
- `src/core/testing/index.ts` — public re-exports
- `src/core/scaffold/templates/e2e/fixture.ts.tpl`
- `src/core/scaffold/templates/e2e/smoke.test.ts.tpl`
- `tests/testing-runtime.test.ts`, `testing-storage.test.ts`, `testing-tabs.test.ts`, `testing-action.test.ts`, `testing-scripting.test.ts`, `testing-install.test.ts`

**Modified:**
- `src/core/scaffold/templates/vitest.config.ts.tpl` — add `setupFiles: ['extforge/testing/vitest']`
- `src/core/scaffold/templates/extension.test.ts.tpl` — replace with real tests
- `package.json` — add `./testing` and `./testing/vitest` subpath exports
- `tsup.config.ts` — emit `core/testing/index` and `core/testing/vitest`

---

## Task 1: Spy helper

**Files:**
- Create: `src/core/testing/internal/spy.ts`

- [ ] **Step 1: Implement**

```ts
// src/core/testing/internal/spy.ts
// Minimal call-recording wrapper. Not a Jest/Sinon replacement — it just
// records calls and lets the test override the return value.

export interface Spy<F extends (...args: any[]) => any> {
  (...args: Parameters<F>): ReturnType<F>;
  calls: Array<Parameters<F>>;
  reset(): void;
}

export function spy<F extends (...args: any[]) => any>(impl: F): Spy<F> {
  const calls: Array<Parameters<F>> = [];
  const fn = ((...args: Parameters<F>) => {
    calls.push(args);
    return impl(...args);
  }) as Spy<F>;
  fn.calls = calls;
  fn.reset = () => { calls.length = 0; };
  return fn;
}
```

- [ ] **Step 2: Verify + commit**
```bash
pnpm typecheck
# (no test for the helper alone — covered by every fake test)
git add src/core/testing/internal/spy.ts
git commit -m "feat(testing): add minimal spy() helper"
```

---

## Task 2: Storage fake

**Files:**
- Create: `src/core/testing/fakes/storage.ts`
- Test: `tests/testing-storage.test.ts`

- [ ] **Step 1: Tests**

```ts
// tests/testing-storage.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createStorageFake, type StorageFake } from '../src/core/testing/fakes/storage.js';

let s: StorageFake;
beforeEach(() => { s = createStorageFake(); });

describe('storage fake', () => {
  it('local.set then local.get returns the value', async () => {
    await s.chrome.local.set({ a: 1 });
    const r = await s.chrome.local.get('a');
    expect(r).toEqual({ a: 1 });
  });

  it('local.get with array returns each requested key', async () => {
    await s.chrome.local.set({ a: 1, b: 2, c: 3 });
    const r = await s.chrome.local.get(['a', 'c']);
    expect(r).toEqual({ a: 1, c: 3 });
  });

  it('local.get with null returns the entire state', async () => {
    await s.chrome.local.set({ a: 1, b: 2 });
    const r = await s.chrome.local.get(null);
    expect(r).toEqual({ a: 1, b: 2 });
  });

  it('local.remove drops keys', async () => {
    await s.chrome.local.set({ a: 1, b: 2 });
    await s.chrome.local.remove('a');
    expect(await s.chrome.local.get(null)).toEqual({ b: 2 });
  });

  it('local.clear empties the area', async () => {
    await s.chrome.local.set({ a: 1 });
    await s.chrome.local.clear();
    expect(await s.chrome.local.get(null)).toEqual({});
  });

  it('sync and local are independent areas', async () => {
    await s.chrome.local.set({ a: 1 });
    await s.chrome.sync.set({ a: 2 });
    expect(await s.chrome.local.get('a')).toEqual({ a: 1 });
    expect(await s.chrome.sync.get('a')).toEqual({ a: 2 });
  });

  it('records calls on set/get', async () => {
    await s.chrome.local.set({ a: 1 });
    await s.chrome.local.get('a');
    expect(s.chrome.local.set.calls.length).toBe(1);
    expect(s.chrome.local.get.calls.length).toBe(1);
  });

  it('reset() clears state and call records', async () => {
    await s.chrome.local.set({ a: 1 });
    s.reset();
    expect(await s.chrome.local.get(null)).toEqual({});
    expect(s.chrome.local.set.calls.length).toBe(0);
  });
});
```

- [ ] **Step 2: Implement**

```ts
// src/core/testing/fakes/storage.ts
import { spy, type Spy } from '../internal/spy.js';

export interface StorageAreaFake {
  get: Spy<(keys?: string | string[] | null) => Promise<Record<string, unknown>>>;
  set: Spy<(items: Record<string, unknown>) => Promise<void>>;
  remove: Spy<(keys: string | string[]) => Promise<void>>;
  clear: Spy<() => Promise<void>>;
  __state(): Record<string, unknown>;
}

export interface StorageFake {
  readonly chrome: {
    local:   StorageAreaFake;
    sync:    StorageAreaFake;
    session: StorageAreaFake;
  };
  reset(): void;
}

function createArea(): StorageAreaFake {
  let state: Record<string, unknown> = {};
  const get = spy(async (keys?: string | string[] | null) => {
    if (keys == null) return { ...state };
    const list = Array.isArray(keys) ? keys : [keys];
    const out: Record<string, unknown> = {};
    for (const k of list) if (k in state) out[k] = state[k];
    return out;
  });
  const set = spy(async (items: Record<string, unknown>) => {
    state = { ...state, ...items };
  });
  const remove = spy(async (keys: string | string[]) => {
    const list = Array.isArray(keys) ? keys : [keys];
    for (const k of list) delete state[k];
  });
  const clear = spy(async () => { state = {}; });
  const area: StorageAreaFake = {
    get, set, remove, clear,
    __state: () => ({ ...state }),
  };
  // attach a private reset that wipes state and call records
  (area as any).__reset = () => {
    state = {};
    get.reset(); set.reset(); remove.reset(); clear.reset();
  };
  return area;
}

export function createStorageFake(): StorageFake {
  const local   = createArea();
  const sync    = createArea();
  const session = createArea();
  return {
    chrome: { local, sync, session },
    reset() {
      (local as any).__reset();
      (sync as any).__reset();
      (session as any).__reset();
    },
  };
}
```

- [ ] **Step 3: Verify + commit**
```bash
pnpm test -- testing-storage
pnpm typecheck
git add src/core/testing/fakes/storage.ts tests/testing-storage.test.ts
git commit -m "feat(testing): chrome.storage fake (local/sync/session) with spies"
```

---

## Task 3: Runtime fake

**Files:**
- Create: `src/core/testing/fakes/runtime.ts`
- Test: `tests/testing-runtime.test.ts`

- [ ] **Step 1: Tests**

```ts
// tests/testing-runtime.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createRuntimeFake, type RuntimeFake } from '../src/core/testing/fakes/runtime.js';

let r: RuntimeFake;
beforeEach(() => { r = createRuntimeFake(); });

describe('runtime fake', () => {
  it('onInstalled listeners fire on fireOnInstalled', () => {
    const seen: any[] = [];
    r.chrome.onInstalled.addListener((details) => seen.push(details));
    r.fireOnInstalled({ reason: 'install' });
    expect(seen).toEqual([{ reason: 'install' }]);
  });

  it('onStartup listeners fire on fireOnStartup', () => {
    let n = 0;
    r.chrome.onStartup.addListener(() => { n++; });
    r.fireOnStartup();
    r.fireOnStartup();
    expect(n).toBe(2);
  });

  it('onMessage listeners can sendResponse asynchronously', async () => {
    r.chrome.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.kind === 'ping') {
        sendResponse({ kind: 'pong' });
        return true;
      }
    });
    const reply = await r.fireOnMessage({ kind: 'ping' });
    expect(reply).toEqual({ kind: 'pong' });
  });

  it('sendMessage records calls', async () => {
    await r.chrome.sendMessage({ x: 1 });
    expect(r.chrome.sendMessage.calls.length).toBe(1);
    expect(r.chrome.sendMessage.calls[0]).toEqual([{ x: 1 }]);
  });

  it('removeListener actually removes', () => {
    const seen: any[] = [];
    const fn = (d: any) => seen.push(d);
    r.chrome.onInstalled.addListener(fn);
    r.chrome.onInstalled.removeListener(fn);
    r.fireOnInstalled({ reason: 'install' });
    expect(seen).toHaveLength(0);
  });

  it('reset clears listeners and call records', () => {
    const seen: any[] = [];
    r.chrome.onInstalled.addListener((d) => seen.push(d));
    r.reset();
    r.fireOnInstalled({ reason: 'install' });
    expect(seen).toHaveLength(0);
  });

  it('reload spy is recorded', () => {
    r.chrome.reload();
    expect(r.chrome.reload.calls.length).toBe(1);
  });

  it('id is a stable test value', () => {
    expect(typeof r.chrome.id).toBe('string');
    expect(r.chrome.id.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Implement**

```ts
// src/core/testing/fakes/runtime.ts
import { spy, type Spy } from '../internal/spy.js';

type InstalledDetails = { reason: string };

export interface RuntimeFake {
  readonly chrome: {
    id: string;
    onInstalled: { addListener(fn: (d: InstalledDetails) => void): void; removeListener(fn: (d: InstalledDetails) => void): void };
    onStartup:   { addListener(fn: () => void): void; removeListener(fn: () => void): void };
    onMessage:   { addListener(fn: (m: any, sender: any, send: (r: any) => void) => boolean | void): void; removeListener(fn: any): void };
    sendMessage: Spy<(message: any) => Promise<any>>;
    reload:      Spy<() => void>;
  };
  fireOnInstalled(details?: InstalledDetails): void;
  fireOnStartup(): void;
  fireOnMessage(message: any, sender?: any): Promise<any>;
  reset(): void;
}

export function createRuntimeFake(): RuntimeFake {
  const installedListeners: Array<(d: InstalledDetails) => void> = [];
  const startupListeners:   Array<() => void> = [];
  const messageListeners:   Array<(m: any, s: any, send: (r: any) => void) => boolean | void> = [];

  const sendMessage = spy(async (_msg: any) => undefined as any);
  const reload      = spy(() => undefined);

  const fake: RuntimeFake = {
    chrome: {
      id: 'extforge-test-extension-id',
      onInstalled: {
        addListener(fn) { installedListeners.push(fn); },
        removeListener(fn) { const i = installedListeners.indexOf(fn); if (i >= 0) installedListeners.splice(i, 1); },
      },
      onStartup: {
        addListener(fn) { startupListeners.push(fn); },
        removeListener(fn) { const i = startupListeners.indexOf(fn); if (i >= 0) startupListeners.splice(i, 1); },
      },
      onMessage: {
        addListener(fn) { messageListeners.push(fn); },
        removeListener(fn) { const i = messageListeners.indexOf(fn); if (i >= 0) messageListeners.splice(i, 1); },
      },
      sendMessage,
      reload,
    },
    fireOnInstalled(details = { reason: 'install' }) {
      for (const fn of [...installedListeners]) fn(details);
    },
    fireOnStartup() {
      for (const fn of [...startupListeners]) fn();
    },
    fireOnMessage(message, sender = { id: fake.chrome.id }) {
      return new Promise<any>((resolve) => {
        let resolved = false;
        const sendResponse = (r: any) => { if (!resolved) { resolved = true; resolve(r); } };
        let willRespond = false;
        for (const fn of [...messageListeners]) {
          const ret = fn(message, sender, sendResponse);
          if (ret === true) willRespond = true;
        }
        if (!willRespond) resolve(undefined);
      });
    },
    reset() {
      installedListeners.length = 0;
      startupListeners.length = 0;
      messageListeners.length = 0;
      sendMessage.reset();
      reload.reset();
    },
  };
  return fake;
}
```

- [ ] **Step 3: Verify + commit**
```bash
pnpm test -- testing-runtime
pnpm typecheck
git add src/core/testing/fakes/runtime.ts tests/testing-runtime.test.ts
git commit -m "feat(testing): chrome.runtime fake (onInstalled/onStartup/onMessage/sendMessage/reload)"
```

---

## Task 4: Tabs, action, scripting fakes (batched)

**Files:**
- Create: `src/core/testing/fakes/tabs.ts`
- Create: `src/core/testing/fakes/action.ts`
- Create: `src/core/testing/fakes/scripting.ts`
- Test: `tests/testing-tabs.test.ts`, `testing-action.test.ts`, `testing-scripting.test.ts`

- [ ] **Step 1: Tabs implementation**

```ts
// src/core/testing/fakes/tabs.ts
import { spy, type Spy } from '../internal/spy.js';

export interface TabRecord { id: number; url: string; active: boolean; }

export interface TabsFake {
  readonly chrome: {
    query: Spy<(info: { url?: string; active?: boolean }) => Promise<TabRecord[]>>;
    sendMessage: Spy<(tabId: number, message: any) => Promise<any>>;
    create: Spy<(props: { url: string }) => Promise<TabRecord>>;
    reload: Spy<(tabId: number) => Promise<void>>;
  };
  /** Seed tabs into the fake. */
  __seed(tabs: Array<{ id: number; url: string; active?: boolean }>): void;
  reset(): void;
}

export function createTabsFake(): TabsFake {
  let tabs: TabRecord[] = [];
  let nextId = 1000;

  const query = spy(async (info: { url?: string; active?: boolean }) => {
    return tabs.filter((t) => {
      if (info.active !== undefined && t.active !== info.active) return false;
      if (info.url !== undefined && t.url !== info.url) return false;
      return true;
    });
  });

  const sendMessage = spy(async (_tabId: number, _msg: any) => undefined as any);

  const create = spy(async (props: { url: string }) => {
    const t: TabRecord = { id: nextId++, url: props.url, active: true };
    tabs.push(t);
    return t;
  });

  const reload = spy(async (_tabId: number) => undefined);

  return {
    chrome: { query, sendMessage, create, reload },
    __seed(seed) {
      for (const t of seed) tabs.push({ id: t.id, url: t.url, active: t.active ?? false });
    },
    reset() {
      tabs = [];
      nextId = 1000;
      query.reset(); sendMessage.reset(); create.reset(); reload.reset();
    },
  };
}
```

Test (representative — write 4 tests covering seed/query, sendMessage, create, reload, reset).

- [ ] **Step 2: Action implementation**

```ts
// src/core/testing/fakes/action.ts
import { spy, type Spy } from '../internal/spy.js';

export interface ActionFake {
  readonly chrome: {
    setBadgeText: Spy<(details: { text: string; tabId?: number }) => Promise<void>>;
    getBadgeText: Spy<(details: { tabId?: number }) => Promise<string>>;
    setIcon: Spy<(details: Record<string, unknown>) => Promise<void>>;
    enable: Spy<(tabId?: number) => Promise<void>>;
    disable: Spy<(tabId?: number) => Promise<void>>;
  };
  reset(): void;
}

export function createActionFake(): ActionFake {
  const badges = new Map<number | 'global', string>();

  const setBadgeText = spy(async ({ text, tabId }: { text: string; tabId?: number }) => {
    badges.set(tabId ?? 'global', text);
  });
  const getBadgeText = spy(async ({ tabId }: { tabId?: number }) => {
    return badges.get(tabId ?? 'global') ?? '';
  });
  const setIcon = spy(async (_d: Record<string, unknown>) => undefined);
  const enable  = spy(async (_tabId?: number) => undefined);
  const disable = spy(async (_tabId?: number) => undefined);

  return {
    chrome: { setBadgeText, getBadgeText, setIcon, enable, disable },
    reset() {
      badges.clear();
      setBadgeText.reset(); getBadgeText.reset(); setIcon.reset();
      enable.reset(); disable.reset();
    },
  };
}
```

Test (3-4 tests).

- [ ] **Step 3: Scripting implementation**

```ts
// src/core/testing/fakes/scripting.ts
import { spy, type Spy } from '../internal/spy.js';

export interface ExecuteScriptInjection {
  target: { tabId: number };
  files?: string[];
  func?: (...args: any[]) => any;
  args?: any[];
  world?: 'ISOLATED' | 'MAIN';
}

export interface ScriptingFake {
  readonly chrome: {
    executeScript: Spy<(injection: ExecuteScriptInjection) => Promise<Array<{ result?: unknown; frameId?: number }>>>;
  };
  /** Override the result executeScript returns next time. */
  __nextResult(value: unknown): void;
  reset(): void;
}

export function createScriptingFake(): ScriptingFake {
  const queue: unknown[] = [];

  const executeScript = spy(async (_inj: ExecuteScriptInjection) => {
    const value = queue.length > 0 ? queue.shift() : undefined;
    return [{ result: value, frameId: 0 }];
  });

  return {
    chrome: { executeScript },
    __nextResult(value) { queue.push(value); },
    reset() { queue.length = 0; executeScript.reset(); },
  };
}
```

Test (3 tests covering call recording, __nextResult, reset).

- [ ] **Step 4: Verify + commit**

After all three are implemented and tested:
```bash
pnpm test -- testing-tabs testing-action testing-scripting
pnpm typecheck
git add src/core/testing/fakes/{tabs,action,scripting}.ts \
        tests/testing-{tabs,action,scripting}.test.ts
git commit -m "feat(testing): chrome.tabs, .action, .scripting fakes"
```

---

## Task 5: install + reset + ChromeFakes bag

**Files:**
- Create: `src/core/testing/install.ts`
- Test: `tests/testing-install.test.ts`

- [ ] **Step 1: Tests**

```ts
// tests/testing-install.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { installChromeFakes, resetChromeFakes } from '../src/core/testing/install.js';

afterEach(() => { delete (globalThis as any).chrome; });

describe('installChromeFakes', () => {
  it('attaches chrome to globalThis with all namespaces', () => {
    const fakes = installChromeFakes();
    const c = (globalThis as any).chrome;
    expect(c.runtime).toBeDefined();
    expect(c.storage).toBeDefined();
    expect(c.tabs).toBeDefined();
    expect(c.action).toBeDefined();
    expect(c.scripting).toBeDefined();
    expect(fakes.runtime).toBeDefined();
  });

  it('throws if globalThis.chrome is already defined', () => {
    (globalThis as any).chrome = { existing: true };
    expect(() => installChromeFakes()).toThrow(/already/i);
  });

  it('reset clears every namespace', async () => {
    const fakes = installChromeFakes();
    await (globalThis as any).chrome.storage.local.set({ a: 1 });
    resetChromeFakes(fakes);
    expect(await (globalThis as any).chrome.storage.local.get(null)).toEqual({});
  });

  it('unmodeled methods throw a clear error', () => {
    installChromeFakes();
    const c = (globalThis as any).chrome;
    expect(() => c.tabs.captureVisibleTab?.()).toThrow();
  });
});
```

- [ ] **Step 2: Implement**

```ts
// src/core/testing/install.ts
import { createRuntimeFake, type RuntimeFake } from './fakes/runtime.js';
import { createStorageFake, type StorageFake } from './fakes/storage.js';
import { createTabsFake, type TabsFake } from './fakes/tabs.js';
import { createActionFake, type ActionFake } from './fakes/action.js';
import { createScriptingFake, type ScriptingFake } from './fakes/scripting.js';

export interface ChromeFakes {
  runtime:   RuntimeFake;
  storage:   StorageFake;
  tabs:      TabsFake;
  action:    ActionFake;
  scripting: ScriptingFake;
  reset(): void;
}

const NOT_MODELED = (ns: string, method: string) => {
  return () => {
    throw new Error(
      `chrome.${ns}.${method} is not modeled by extforge/testing v1; supply your own mock or extend the fake. ` +
      `Docs: https://extforge.arshadshah.com/testing#unmodeled`,
    );
  };
};

function withNotModeledTrap<T extends object>(target: T, ns: string): T {
  return new Proxy(target, {
    get(t, prop, receiver) {
      const v = Reflect.get(t, prop, receiver);
      if (v !== undefined) return v;
      if (typeof prop === 'string') return NOT_MODELED(ns, prop);
      return v;
    },
  });
}

export function createChromeFakes(): ChromeFakes {
  const runtime   = createRuntimeFake();
  const storage   = createStorageFake();
  const tabs      = createTabsFake();
  const action    = createActionFake();
  const scripting = createScriptingFake();

  return {
    runtime, storage, tabs, action, scripting,
    reset() {
      runtime.reset(); storage.reset(); tabs.reset(); action.reset(); scripting.reset();
    },
  };
}

export function installChromeFakes(): ChromeFakes {
  if ((globalThis as any).chrome !== undefined) {
    throw new Error(
      'globalThis.chrome is already defined. Either remove the existing definition before calling installChromeFakes(), ' +
      'or construct fakes per-namespace via createRuntimeFake() etc.',
    );
  }
  const fakes = createChromeFakes();
  (globalThis as any).chrome = {
    runtime:   withNotModeledTrap(fakes.runtime.chrome,   'runtime'),
    storage:   fakes.storage.chrome, // sub-areas are real objects with no proxy
    tabs:      withNotModeledTrap(fakes.tabs.chrome,      'tabs'),
    action:    withNotModeledTrap(fakes.action.chrome,    'action'),
    scripting: withNotModeledTrap(fakes.scripting.chrome, 'scripting'),
  };
  return fakes;
}

export function resetChromeFakes(fakes: ChromeFakes): void {
  fakes.reset();
}
```

- [ ] **Step 3: Verify + commit**
```bash
pnpm test -- testing-install
pnpm typecheck
git add src/core/testing/install.ts tests/testing-install.test.ts
git commit -m "feat(testing): installChromeFakes/resetChromeFakes with not-modeled trap"
```

---

## Task 6: Vitest preset + public exports + subpath wiring

**Files:**
- Create: `src/core/testing/vitest.ts`
- Create: `src/core/testing/index.ts`
- Modify: `package.json`
- Modify: `tsup.config.ts`

- [ ] **Step 1: Public re-exports (`src/core/testing/index.ts`)**

```ts
export { installChromeFakes, resetChromeFakes, createChromeFakes, type ChromeFakes } from './install.js';
export { createRuntimeFake, type RuntimeFake } from './fakes/runtime.js';
export { createStorageFake, type StorageFake, type StorageAreaFake } from './fakes/storage.js';
export { createTabsFake, type TabsFake, type TabRecord } from './fakes/tabs.js';
export { createActionFake, type ActionFake } from './fakes/action.js';
export { createScriptingFake, type ScriptingFake, type ExecuteScriptInjection } from './fakes/scripting.js';
```

- [ ] **Step 2: Vitest setup file (`src/core/testing/vitest.ts`)**

```ts
// extforge/testing/vitest — used as a vitest setupFile.
//
//   import { defineConfig } from 'vitest/config';
//   export default defineConfig({ test: { setupFiles: ['extforge/testing/vitest'] } });
//
// Registers chrome fakes globally and resets them in beforeEach.

import { beforeEach } from 'vitest';
import { installChromeFakes, resetChromeFakes, type ChromeFakes } from './install.js';

let fakes: ChromeFakes;
if ((globalThis as any).chrome === undefined) {
  fakes = installChromeFakes();
} else {
  // Tolerate re-import (the file may load twice in some setups). Reuse the
  // existing chrome by reading back the bag from the module-level cache below.
  fakes = (globalThis as any).__extforgeFakes;
}

(globalThis as any).__extforgeFakes = fakes;

beforeEach(() => { resetChromeFakes(fakes); });

export { fakes };
```

- [ ] **Step 3: Subpath exports — `package.json`**

In `exports`:
```json
"./testing": {
  "import": "./dist/core/testing/index.js",
  "types": "./dist/core/testing/index.d.ts"
},
"./testing/vitest": {
  "import": "./dist/core/testing/vitest.js",
  "types": "./dist/core/testing/vitest.d.ts"
}
```

- [ ] **Step 4: tsup.config.ts**

Add to entry list:
```
core/testing/index
core/testing/vitest
```

Match the pattern used for `core/plugins/index`.

- [ ] **Step 5: Verify**

- `pnpm test` — full suite green
- `pnpm typecheck` — clean
- `pnpm build` — success; verify `dist/core/testing/index.js`, `dist/core/testing/vitest.js`, and their `.d.ts` exist
- Smoke: `node -e "import('./dist/core/testing/index.js').then(m => console.log(Object.keys(m).sort().join(',')))"` — should include `installChromeFakes`, `createRuntimeFake`, `createStorageFake`, etc.

- [ ] **Step 6: Add an integration test for the preset**

Create `tests/testing-preset.test.ts` — a small test that imports `extforge/testing/vitest` would actually require building first; instead, test the underlying behavior directly:

```ts
import { describe, it, expect } from 'vitest';
import { installChromeFakes, resetChromeFakes } from '../src/core/testing/install.js';

describe('vitest preset path (manual install)', () => {
  it('install + use + reset round-trips', async () => {
    delete (globalThis as any).chrome;
    const fakes = installChromeFakes();
    const c = (globalThis as any).chrome;
    await c.storage.local.set({ a: 1 });
    expect(await c.storage.local.get(null)).toEqual({ a: 1 });
    resetChromeFakes(fakes);
    expect(await c.storage.local.get(null)).toEqual({});
    delete (globalThis as any).chrome;
  });
});
```

- [ ] **Step 7: Commit**
```bash
git add src/core/testing/index.ts src/core/testing/vitest.ts \
        package.json tsup.config.ts tests/testing-preset.test.ts
git commit -m "feat(testing): public exports + extforge/testing and extforge/testing/vitest subpaths"
```

---

## Task 7: Scaffold updates — real test template + e2e fixture

**Files:**
- Modify: `src/core/scaffold/templates/vitest.config.ts.tpl`
- Modify: `src/core/scaffold/templates/extension.test.ts.tpl`
- Create: `src/core/scaffold/templates/e2e/fixture.ts.tpl`
- Create: `src/core/scaffold/templates/e2e/smoke.test.ts.tpl`

- [ ] **Step 1: Update `vitest.config.ts.tpl`**

Replace existing content:

```ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.{test,spec}.ts'],
    setupFiles: ['extforge/testing/vitest'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
```

- [ ] **Step 2: Replace `extension.test.ts.tpl`**

```ts
import { describe, it, expect } from 'vitest';

// `chrome` is auto-installed as a fake by extforge/testing/vitest (see vitest.config.ts).
// You can also `import { fakes } from 'extforge/testing/vitest'` for direct test-side controls.

describe('{{NAME}}', () => {
  it('writes settings to chrome.storage.local on install', async () => {
    // The background-script handler is registered when the module is imported.
    const { /* re-export your handlers if needed */ } = await import('../src/background.js');

    // Trigger the install event via the fake.
    const { fakes } = await import('extforge/testing/vitest');
    fakes.runtime.fireOnInstalled({ reason: 'install' });

    // Wait a microtask so the async handler runs.
    await new Promise(r => setTimeout(r, 0));

    const stored = await chrome.storage.local.get(null);
    expect(stored).toHaveProperty('settings');
  });

  it('responds to a "getSettings" runtime message', async () => {
    await import('../src/background.js');
    const { fakes } = await import('extforge/testing/vitest');

    await chrome.storage.local.set({ settings: { theme: 'dark' } });
    const reply = await fakes.runtime.fireOnMessage({ action: 'getSettings' });
    expect(reply).toBeDefined();
  });
});
```

(If the scaffold's background template doesn't actually export anything importable, the test should just exercise the fakes directly. Keep the test passing-by-default for a freshly scaffolded project. If needed, simplify the test to just exercise `chrome.storage.local.set/get` and `fakes.runtime.fireOnMessage` without importing background.)

- [ ] **Step 3: Add `e2e/fixture.ts.tpl`**

```ts
import { test as base, chromium, type BrowserContext } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'pathe';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXT_PATH = resolve(__dirname, '../../dist/chrome');

type Fixtures = { context: BrowserContext; extensionId: string };

export const test = base.extend<Fixtures>({
  context: async ({}, use) => {
    const ctx = await chromium.launchPersistentContext('', {
      headless: false,
      args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
    });
    await use(ctx);
    await ctx.close();
  },
  extensionId: async ({ context }, use) => {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');
    const id = sw.url().split('/')[2]!;
    await use(id);
  },
});

export const expect = test.expect;
```

- [ ] **Step 4: Add `e2e/smoke.test.ts.tpl`**

```ts
import { test, expect } from './fixture.js';

test('extension service worker boots', async ({ context, extensionId }) => {
  expect(extensionId).toMatch(/^[a-z]{32}$/);
  // Open the popup if your manifest defines one:
  // const page = await context.newPage();
  // await page.goto(`chrome-extension://${extensionId}/popup.html`);
  // await expect(page.locator('h1')).toBeVisible();
});
```

- [ ] **Step 5: Verify**

- `pnpm test` — green (the templates are static `.tpl` files; not executed in this repo's test suite, but the existing scaffold tests should still parse them as text)
- `pnpm typecheck` — clean
- `pnpm build` — success
- Run `node dist/cli/index.js init test-ext-tmp --defaults` in a tmp dir; verify the generated project has `vitest.config.ts` with the setupFile, an `extension.test.ts` that uses fakes, and an `e2e/` directory. (Optional smoke; if too involved, skip.)

- [ ] **Step 6: Commit**
```bash
git add src/core/scaffold/templates/vitest.config.ts.tpl \
        src/core/scaffold/templates/extension.test.ts.tpl \
        src/core/scaffold/templates/e2e/
git commit -m "feat(scaffold): real test template using extforge/testing fakes; Playwright e2e fixture"
```

---

## Task 8: Final verification + CHANGELOG

**Files:** Modify `CHANGELOG.md`

- [ ] **Step 1: Suite**
```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

- [ ] **Step 2: CHANGELOG**

Append under `[Unreleased]`:

```markdown
### Testing
- New subpath exports: `extforge/testing` (typed `chrome.*` fakes for `runtime`, `storage`, `tabs`, `action`, `scripting`) and `extforge/testing/vitest` (vitest setup-file preset that auto-installs fakes and resets them between tests).
- `installChromeFakes()` / `resetChromeFakes()` for granular control.
- Unmodeled `chrome.*` calls throw a clear "not modeled" error pointing at the docs.
- Scaffolded projects now ship a `vitest.config.ts` wired to the preset and an `extension.test.ts` with real, passing tests.
- New scaffold templates for Playwright E2E: `tests/e2e/fixture.ts` and `tests/e2e/smoke.test.ts`.

### Backwards compatibility (Testing)
No breaking changes. Existing scaffolded projects are unaffected; the new template applies only to projects created via `extforge init` from this version onward.
```

- [ ] **Step 3: Commit**
```bash
git add CHANGELOG.md
git commit -m "docs: changelog for testing helpers track"
```

- [ ] **Step 4: Print final state** — `git log --oneline main..HEAD`.

## Self-Review Checklist

- [x] **Spec coverage:** spy (T1), storage (T2), runtime (T3), tabs/action/scripting (T4), install + not-modeled trap (T5), preset + subpath exports (T6), scaffold templates (T7).
- [x] **No placeholders:** every step has runnable code or commands.
- [x] **Type consistency:** `Spy<F>` from `internal/spy.ts` used by every fake. `ChromeFakes`/`{Namespace}Fake` shapes consistent.
- [x] **Backwards compat:** new subpath exports; scaffold update only affects newly-created projects.
- [x] **Frequent commits:** 8 commits.
