// tests/testing-tabs.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createTabsFake, type TabsFake } from '../src/core/testing/fakes/tabs.js';

let t: TabsFake;
beforeEach(() => { t = createTabsFake(); });

describe('tabs fake', () => {
  it('__seed + query returns all seeded tabs', async () => {
    t.__seed([
      { id: 1, url: 'https://a.com', active: true },
      { id: 2, url: 'https://b.com', active: false },
    ]);
    const all = await t.chrome.query({});
    expect(all).toHaveLength(2);
  });

  it('query filters by active', async () => {
    t.__seed([
      { id: 1, url: 'https://a.com', active: true },
      { id: 2, url: 'https://b.com', active: false },
    ]);
    const active = await t.chrome.query({ active: true });
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(1);
  });

  it('create increments id starting from 1000', async () => {
    const tab1 = await t.chrome.create({ url: 'https://x.com' });
    const tab2 = await t.chrome.create({ url: 'https://y.com' });
    expect(tab1.id).toBe(1000);
    expect(tab2.id).toBe(1001);
    expect(tab1.url).toBe('https://x.com');
    expect(tab1.active).toBe(true);
  });

  it('sendMessage records calls with tabId and message', async () => {
    await t.chrome.sendMessage(42, { kind: 'ping' });
    expect(t.chrome.sendMessage.calls.length).toBe(1);
    expect(t.chrome.sendMessage.calls[0]).toEqual([42, { kind: 'ping' }]);
  });

  it('reload records the tabId', async () => {
    await t.chrome.reload(99);
    expect(t.chrome.reload.calls.length).toBe(1);
    expect(t.chrome.reload.calls[0]).toEqual([99]);
  });

  it('reset wipes state, nextId, and call records', async () => {
    t.__seed([{ id: 1, url: 'https://a.com', active: true }]);
    await t.chrome.sendMessage(1, { x: 1 });
    t.reset();
    const tabs = await t.chrome.query({});
    expect(tabs).toHaveLength(0);
    expect(t.chrome.sendMessage.calls.length).toBe(0);
    // nextId resets to 1000
    const created = await t.chrome.create({ url: 'https://new.com' });
    expect(created.id).toBe(1000);
  });
});
