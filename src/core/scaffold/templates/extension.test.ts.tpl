import { describe, it, expect } from 'vitest';
import { fakes } from 'extforge/testing/vitest';

// `chrome` is auto-installed as a fake by extforge/testing/vitest.
// `fakes` exposes test-side controls (firing events, inspecting spies).
//
// These are example tests for {{NAME}}. Replace with real tests as you build.

describe('{{NAME}}', () => {
  it('reads and writes chrome.storage.local', async () => {
    await chrome.storage.local.set({ theme: 'dark' });
    const result = await chrome.storage.local.get('theme');
    expect(result).toEqual({ theme: 'dark' });
  });

  it('records sendMessage calls', async () => {
    await chrome.runtime.sendMessage({ kind: 'ping' });
    expect(fakes.runtime.chrome.sendMessage.calls.length).toBe(1);
    expect(fakes.runtime.chrome.sendMessage.calls[0]).toEqual([{ kind: 'ping' }]);
  });

  it('fires onInstalled to listeners registered during the test', () => {
    const seen: { reason: string }[] = [];
    chrome.runtime.onInstalled.addListener((d) => seen.push(d));
    fakes.runtime.fireOnInstalled({ reason: 'install' });
    expect(seen).toEqual([{ reason: 'install' }]);
  });
});
