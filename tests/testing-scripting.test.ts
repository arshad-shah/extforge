// tests/testing-scripting.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createScriptingFake, type ScriptingFake } from '../src/core/testing/fakes/scripting.js';

let s: ScriptingFake;
beforeEach(() => { s = createScriptingFake(); });

describe('scripting fake', () => {
  it('executeScript records calls', async () => {
    await s.chrome.executeScript({ target: { tabId: 1 }, files: ['inject.js'] });
    expect(s.chrome.executeScript.calls.length).toBe(1);
    expect(s.chrome.executeScript.calls[0][0]).toMatchObject({ target: { tabId: 1 } });
  });

  it('__nextResult queues are consumed in order', async () => {
    s.__nextResult('first');
    s.__nextResult('second');
    const r1 = await s.chrome.executeScript({ target: { tabId: 1 } });
    const r2 = await s.chrome.executeScript({ target: { tabId: 1 } });
    const r3 = await s.chrome.executeScript({ target: { tabId: 1 } });
    expect(r1[0].result).toBe('first');
    expect(r2[0].result).toBe('second');
    expect(r3[0].result).toBeUndefined(); // queue exhausted
  });

  it('reset clears the queue and call records', async () => {
    s.__nextResult('value');
    await s.chrome.executeScript({ target: { tabId: 2 } });
    s.reset();
    expect(s.chrome.executeScript.calls.length).toBe(0);
    // queue is empty after reset — next call returns undefined result
    const r = await s.chrome.executeScript({ target: { tabId: 2 } });
    expect(r[0].result).toBeUndefined();
  });
});
