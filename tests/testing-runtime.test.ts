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
