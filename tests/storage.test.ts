import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Storage } from '../src/core/storage/index.js';

// Minimal chrome.storage shim used by these tests. We override globalThis.chrome
// per-test so each Storage instance sees a fresh, isolated mock.
function makeChromeShim() {
  const stores: Record<string, Record<string, unknown>> = {
    local: {}, sync: {}, session: {}, managed: {},
  };
  type Listener = (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, area: string) => void;
  const listeners = new Set<Listener>();
  const makeArea = (areaName: string) => ({
    get: vi.fn(async (k: string) => {
      const store = stores[areaName]!;
      return k in store ? { [k]: store[k] } : {};
    }),
    set: vi.fn(async (obj: Record<string, unknown>) => {
      const store = stores[areaName]!;
      const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
      for (const [k, v] of Object.entries(obj)) {
        const oldValue = store[k];
        store[k] = v;
        changes[k] = { oldValue, newValue: v };
      }
      listeners.forEach(l => l(changes, areaName));
    }),
    remove: vi.fn(async (k: string) => {
      const store = stores[areaName]!;
      const oldValue = store[k];
      delete store[k];
      listeners.forEach(l => l({ [k]: { oldValue, newValue: undefined } }, areaName));
    }),
    clear: vi.fn(async () => {
      stores[areaName] = {};
    }),
  });
  return {
    storage: {
      local: makeArea('local'),
      sync: makeArea('sync'),
      session: makeArea('session'),
      managed: makeArea('managed'),
      onChanged: {
        addListener: (l: Listener) => listeners.add(l),
        removeListener: (l: Listener) => listeners.delete(l),
      },
    },
  };
}

describe('Storage (chrome.storage path)', () => {
  let originalChrome: unknown;

  beforeEach(() => {
    originalChrome = (globalThis as { chrome?: unknown }).chrome;
    (globalThis as { chrome?: unknown }).chrome = makeChromeShim();
  });
  afterEach(() => {
    (globalThis as { chrome?: unknown }).chrome = originalChrome;
  });

  it('round-trips a value through chrome.storage.local', async () => {
    const s = new Storage();
    await s.set('k', { a: 1 });
    expect(await s.get('k')).toEqual({ a: 1 });
  });

  it('uses the requested area', async () => {
    const s = new Storage({ area: 'session' });
    await s.set('k', 42);
    expect(await s.get('k')).toBe(42);
    // The local area should not have it.
    const local = new Storage({ area: 'local' });
    expect(await local.get('k')).toBeUndefined();
  });

  it('namespaces keys', async () => {
    const a = new Storage({ namespace: 'app:v1' });
    const b = new Storage({ namespace: 'app:v2' });
    await a.set('user', 'alice');
    await b.set('user', 'bob');
    expect(await a.get('user')).toBe('alice');
    expect(await b.get('user')).toBe('bob');
  });

  it('remove() deletes a key', async () => {
    const s = new Storage();
    await s.set('k', 1);
    await s.remove('k');
    expect(await s.get('k')).toBeUndefined();
  });

  it('watch() fires for matching key with new+old values', async () => {
    const s = new Storage();
    await s.set('k', 'old');
    const seen: Array<[unknown, unknown]> = [];
    const unwatch = s.watch({ k: (n, o) => seen.push([n, o]) });
    await s.set('k', 'new');
    expect(seen).toEqual([['new', 'old']]);
    unwatch();
    await s.set('k', 'after-unwatch');
    expect(seen.length).toBe(1);
  });

  it('watch("*") catches every change in this area', async () => {
    const s = new Storage();
    const seen: string[] = [];
    s.watch({ '*': (_n, _o) => seen.push('hit') });
    await s.set('a', 1);
    await s.set('b', 2);
    expect(seen.length).toBe(2);
  });

  it('namespaced watch only sees its own keys', async () => {
    const a = new Storage({ namespace: 'app' });
    const b = new Storage({ namespace: 'other' });
    const seenA: string[] = [];
    a.watch({ k: () => seenA.push('a') });
    await b.set('k', 1); // cross-namespace; shouldn't fire
    expect(seenA).toEqual([]);
    await a.set('k', 1);
    expect(seenA).toEqual(['a']);
  });
});

describe('Storage (localStorage fallback)', () => {
  let originalChrome: unknown;
  let store: Record<string, string>;
  let originalLocalStorage: Storage | undefined;

  beforeEach(() => {
    originalChrome = (globalThis as { chrome?: unknown }).chrome;
    (globalThis as { chrome?: unknown }).chrome = undefined;
    store = {};
    originalLocalStorage = globalThis.localStorage as unknown as Storage | undefined;
    (globalThis as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => (k in store ? store[k]! : null),
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
      clear: () => { for (const k of Object.keys(store)) delete store[k]; },
      key: (i: number) => Object.keys(store)[i] ?? null,
      get length() { return Object.keys(store).length; },
    };
  });
  afterEach(() => {
    (globalThis as { chrome?: unknown }).chrome = originalChrome;
    (globalThis as { localStorage: unknown }).localStorage = originalLocalStorage;
  });

  it('falls back to localStorage when chrome.storage is unavailable', async () => {
    const s = new Storage();
    await s.set('k', { a: 1 });
    expect(await s.get('k')).toEqual({ a: 1 });
  });

  it('stores strings as-is, JSON-parses on read', async () => {
    const s = new Storage();
    await s.set('plain', 'hello');
    expect(await s.get('plain')).toBe('hello');
  });

  it('clear() with namespace only removes namespaced keys', async () => {
    const ns = new Storage({ namespace: 'app' });
    const all = new Storage();
    await ns.set('user', 'alice');
    await all.set('global', 'something');
    await ns.clear();
    expect(await ns.get('user')).toBeUndefined();
    expect(await all.get('global')).toBe('something');
  });
});
