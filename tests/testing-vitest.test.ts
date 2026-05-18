import { describe, it, expect, afterAll } from 'vitest';

describe('extforge/testing/vitest preset', () => {
  afterAll(() => {
    // Clean up the global chrome stash so other tests don't see ours.
    delete (globalThis as { chrome?: unknown }).chrome;
    delete (globalThis as { __extforgeFakes?: unknown }).__extforgeFakes;
  });

  it('installs chrome fakes on the first import when no chrome global exists', async () => {
    // Ensure clean slate before importing.
    delete (globalThis as { chrome?: unknown }).chrome;
    delete (globalThis as { __extforgeFakes?: unknown }).__extforgeFakes;
    const mod = await import('../src/core/testing/vitest.js');
    expect(mod.fakes).toBeDefined();
    expect((globalThis as { chrome?: unknown }).chrome).toBeDefined();
    expect((globalThis as { __extforgeFakes?: unknown }).__extforgeFakes).toBeDefined();
  });
});
