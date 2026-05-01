// tests/testing-action.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createActionFake, type ActionFake } from '../src/core/testing/fakes/action.js';

let a: ActionFake;
beforeEach(() => { a = createActionFake(); });

describe('action fake', () => {
  it('setBadgeText then getBadgeText round-trip for a specific tabId', async () => {
    await a.chrome.setBadgeText({ text: '5', tabId: 10 });
    const text = await a.chrome.getBadgeText({ tabId: 10 });
    expect(text).toBe('5');
  });

  it('setBadgeText then getBadgeText round-trip for global (no tabId)', async () => {
    await a.chrome.setBadgeText({ text: '99' });
    const text = await a.chrome.getBadgeText({});
    expect(text).toBe('99');
  });

  it('global and per-tab badges are independent', async () => {
    await a.chrome.setBadgeText({ text: 'G' });
    await a.chrome.setBadgeText({ text: 'T', tabId: 7 });
    expect(await a.chrome.getBadgeText({})).toBe('G');
    expect(await a.chrome.getBadgeText({ tabId: 7 })).toBe('T');
  });

  it('setIcon, enable, and disable record calls', async () => {
    await a.chrome.setIcon({ path: '16.png' });
    await a.chrome.enable(3);
    await a.chrome.disable(4);
    expect(a.chrome.setIcon.calls.length).toBe(1);
    expect(a.chrome.enable.calls.length).toBe(1);
    expect(a.chrome.disable.calls.length).toBe(1);
  });

  it('reset clears badges and all call records', async () => {
    await a.chrome.setBadgeText({ text: 'X' });
    await a.chrome.getBadgeText({});
    a.reset();
    // Call records are cleared immediately after reset (before any new calls)
    expect(a.chrome.setBadgeText.calls.length).toBe(0);
    expect(a.chrome.getBadgeText.calls.length).toBe(0);
    // Badge state is also cleared
    expect(await a.chrome.getBadgeText({})).toBe('');
  });
});
