// @vitest-environment happy-dom
/// <reference types="chrome" />
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
// Tell React's scheduler we're inside a test environment so `act` works
// cleanly and we don't get noisy "not configured to support act" warnings.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { useStorage } from '../src/core/storage/react.js';

interface FakeChromeStorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

interface FakeChromeStorage {
  local: FakeChromeStorageArea;
  onChanged: {
    addListener(l: (changes: Record<string, { newValue?: unknown; oldValue?: unknown }>, area: string) => void): void;
    removeListener(l: (...a: unknown[]) => void): void;
    _fire(changes: Record<string, { newValue?: unknown; oldValue?: unknown }>, area: string): void;
  };
}

function makeFakeChrome(initial: Record<string, unknown> = {}): { chrome: { storage: FakeChromeStorage }; store: Record<string, unknown> } {
  const store: Record<string, unknown> = { ...initial };
  const listeners: Array<(c: Record<string, { newValue?: unknown; oldValue?: unknown }>, a: string) => void> = [];
  const fakeStorage: FakeChromeStorage = {
    local: {
      get: async (key: string) => (key in store ? { [key]: store[key] } : {}),
      set: async (items: Record<string, unknown>) => {
        const changes: Record<string, { newValue?: unknown; oldValue?: unknown }> = {};
        for (const [k, v] of Object.entries(items)) {
          changes[k] = { oldValue: store[k], newValue: v };
          store[k] = v;
        }
        for (const l of listeners) l(changes, 'local');
      },
      remove: async (key: string) => {
        const oldValue = store[key];
        delete store[key];
        for (const l of listeners) l({ [key]: { oldValue, newValue: undefined } }, 'local');
      },
    },
    onChanged: {
      addListener: (l) => { listeners.push(l); },
      removeListener: (l) => {
        const i = listeners.indexOf(l as never);
        if (i >= 0) listeners.splice(i, 1);
      },
      _fire: (c, a) => { for (const l of listeners) l(c, a); },
    },
  };
  return { chrome: { storage: fakeStorage }, store };
}

let container: HTMLDivElement;
let root: Root;

function Probe(props: { storageKey: string; defaultValue: string; onState?: (v: unknown, isLoading: boolean) => void }): React.ReactElement {
  const { value, setValue, remove, isLoading } = useStorage<string>(props.storageKey, props.defaultValue);
  props.onState?.(value, isLoading);
  // Stash setters on a deterministic ref for tests to drive.
  (Probe as { _setValue?: (v: string) => Promise<void>; _remove?: () => Promise<void> })._setValue = setValue;
  (Probe as { _setValue?: (v: string) => Promise<void>; _remove?: () => Promise<void> })._remove = remove;
  return React.createElement('div', null, isLoading ? 'loading' : String(value ?? 'undef'));
}

async function renderAndWait(el: React.ReactElement): Promise<void> {
  await act(async () => { root.render(el); });
  // Two microtask ticks: one for the effect to schedule the async read,
  // one for that read's promise to resolve.
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  root.unmount();
  container.remove();
  // The hook caches Storage singletons keyed by area+namespace. Reset by
  // resetting modules between tests would be heavy; instead each test uses
  // unique keys so the listener pool doesn't bleed between specs.
  delete (globalThis as { chrome?: unknown }).chrome;
});

describe('useStorage', () => {
  it('starts in loading state and resolves to the stored value', async () => {
    const { chrome } = makeFakeChrome({ greeting: 'world' });
    (globalThis as { chrome?: unknown }).chrome = chrome;

    const seen: Array<[unknown, boolean]> = [];
    await renderAndWait(React.createElement(Probe, {
      storageKey: 'greeting',
      defaultValue: 'fallback',
      onState: (v, l) => seen.push([v, l]),
    }));

    // First render: loading=true, value=undefined.
    expect(seen[0]).toEqual([undefined, true]);
    // After the async read settles: loading=false, value='world'.
    const last = seen[seen.length - 1];
    expect(last[1]).toBe(false);
    expect(last[0]).toBe('world');
    expect(container.textContent).toBe('world');
  });

  it('returns the default value when storage has no entry', async () => {
    const { chrome } = makeFakeChrome({});
    (globalThis as { chrome?: unknown }).chrome = chrome;

    await renderAndWait(React.createElement(Probe, {
      storageKey: 'missing',
      defaultValue: 'hello',
    }));
    expect(container.textContent).toBe('hello');
  });

  it('setValue persists to storage and updates the React state', async () => {
    const { chrome, store } = makeFakeChrome({});
    (globalThis as { chrome?: unknown }).chrome = chrome;

    await renderAndWait(React.createElement(Probe, {
      storageKey: 'counter1',
      defaultValue: 'zero',
    }));

    const setValue = (Probe as { _setValue?: (v: string) => Promise<void> })._setValue!;
    await act(async () => { await setValue('one'); });
    expect(store['counter1']).toBe('one');
    expect(container.textContent).toBe('one');
  });

  it('reflects external chrome.storage.onChanged events into React state', async () => {
    const { chrome } = makeFakeChrome({ external: 'initial' });
    (globalThis as { chrome?: unknown }).chrome = chrome;

    await renderAndWait(React.createElement(Probe, {
      storageKey: 'external',
      defaultValue: 'fallback',
    }));
    expect(container.textContent).toBe('initial');

    // Simulate another tab writing to storage.
    await act(async () => {
      chrome.storage.onChanged._fire({ external: { oldValue: 'initial', newValue: 'changed' } }, 'local');
    });
    expect(container.textContent).toBe('changed');
  });

  it('remove resets the value to defaultValue and clears storage', async () => {
    const { chrome, store } = makeFakeChrome({ toDelete: 'present' });
    (globalThis as { chrome?: unknown }).chrome = chrome;

    await renderAndWait(React.createElement(Probe, {
      storageKey: 'toDelete',
      defaultValue: 'default-after-remove',
    }));
    expect(container.textContent).toBe('present');

    const remove = (Probe as { _remove?: () => Promise<void> })._remove!;
    await act(async () => { await remove(); });
    expect('toDelete' in store).toBe(false);
    expect(container.textContent).toBe('default-after-remove');
  });

  it('unmounting unsubscribes the watch listener (no setState-after-unmount)', async () => {
    const { chrome } = makeFakeChrome({ unmount: 'a' });
    (globalThis as { chrome?: unknown }).chrome = chrome;

    await renderAndWait(React.createElement(Probe, {
      storageKey: 'unmount',
      defaultValue: 'd',
    }));
    expect(container.textContent).toBe('a');

    // Unmount, then fire a change. Should not throw / log.
    await act(async () => { root.unmount(); });
    expect(() => chrome.storage.onChanged._fire({ unmount: { oldValue: 'a', newValue: 'b' } }, 'local')).not.toThrow();
  });
});
