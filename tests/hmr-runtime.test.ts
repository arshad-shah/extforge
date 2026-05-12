import { describe, it, expect, beforeEach } from 'vitest';
import { createHMRRuntime, ensureGlobalRuntime, applyV3Update, type HMRRuntime } from '../src/core/hmr/runtime.js';

describe('HMR runtime', () => {
  let rt: HMRRuntime;

  beforeEach(() => {
    rt = createHMRRuntime();
  });

  it('register() returns a HotApi and stores the module', () => {
    const hot = rt.register('a', { x: 1 });
    expect(hot.enabled).toBe(true);
    expect(rt.get('a')?.exports).toEqual({ x: 1 });
  });

  it('apply() with no accept callbacks returns false (must reload)', () => {
    rt.register('a', { x: 1 });
    const ok = rt.apply('a', () => ({ x: 2 }));
    expect(ok).toBe(false);
  });

  it('apply() invokes accept callbacks with the new exports', () => {
    rt.register('a', { x: 1 });
    const seen: Array<unknown> = [];
    const hot = rt.register('a', { x: 1 });
    hot.accept((next) => { seen.push(next); });
    const ok = rt.apply('a', () => ({ x: 2 }));
    expect(ok).toBe(true);
    expect(seen).toEqual([{ x: 2 }]);
    expect(rt.get('a')?.exports).toEqual({ x: 2 });
  });

  it('apply() runs dispose callbacks before swap', () => {
    const order: string[] = [];
    const hot = rt.register('a', {});
    hot.dispose(() => order.push('dispose'));
    hot.accept(() => { order.push('accept'); });
    rt.apply('a', () => ({}));
    expect(order).toEqual(['dispose', 'accept']);
  });

  it('decline() makes future updates fall back to reload', () => {
    const hot = rt.register('a', {});
    hot.accept(() => {});
    hot.decline();
    expect(rt.apply('a', () => ({}))).toBe(false);
  });

  it('apply() returns true and is a no-op when hash matches', () => {
    const hot = rt.register('a', { x: 1 });
    let calls = 0;
    hot.accept(() => { calls++; });
    rt.apply('a', () => ({ x: 1 }), 'h1');
    rt.apply('a', () => ({ x: 1 }), 'h1'); // same hash → no-op
    expect(calls).toBe(1);
  });

  it('factory throwing aborts the swap and returns false', () => {
    const hot = rt.register('a', { x: 1 });
    hot.accept(() => {});
    const ok = rt.apply('a', () => { throw new Error('boom'); });
    expect(ok).toBe(false);
    expect(rt.get('a')?.exports).toEqual({ x: 1 });
  });

  it('accept returning false aborts even after exports were swapped', () => {
    const hot = rt.register('a', { x: 1 });
    hot.accept(() => false);
    const ok = rt.apply('a', () => ({ x: 2 }));
    expect(ok).toBe(false);
  });
});

describe('ensureGlobalRuntime', () => {
  it('returns the same instance on repeated calls', () => {
    const a = ensureGlobalRuntime();
    const b = ensureGlobalRuntime();
    expect(a).toBe(b);
  });
});

describe('applyV3Update', () => {
  it('returns true when every update is hot-accepted', async () => {
    const rt = createHMRRuntime();
    const hot1 = rt.register('a', {});
    const hot2 = rt.register('b', {});
    hot1.accept(() => {});
    hot2.accept(() => {});
    const ok = await applyV3Update(rt, {
      v: 3,
      type: 'hmr-update',
      timestamp: Date.now(),
      updates: [
        { id: 'a', hash: 'h1', chunkUrl: 'https://stub/a.js' },
        { id: 'b', hash: 'h2', chunkUrl: 'https://stub/b.js' },
      ],
    }, async (url) => ({ default: () => ({ url }) }));
    expect(ok).toBe(true);
  });

  it('returns false if any update could not be accepted', async () => {
    const rt = createHMRRuntime();
    rt.register('a', {});  // no accept → must reload
    const ok = await applyV3Update(rt, {
      v: 3,
      type: 'hmr-update',
      timestamp: Date.now(),
      updates: [{ id: 'a', hash: 'h', chunkUrl: 'x' }],
    }, async () => ({ default: () => ({}) }));
    expect(ok).toBe(false);
  });

  it('empty updates is a true no-op', async () => {
    const rt = createHMRRuntime();
    const ok = await applyV3Update(rt, {
      v: 3,
      type: 'hmr-update',
      timestamp: 0,
      updates: [],
    }, async () => ({ default: () => ({}) }));
    expect(ok).toBe(true);
  });
});
