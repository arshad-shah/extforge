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
