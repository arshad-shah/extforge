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
