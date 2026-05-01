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
    expect(() => (c.tabs as any).captureVisibleTab()).toThrow(/not modeled/);
  });
});
