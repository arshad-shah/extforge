// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetBeforeReload,
  BEFORE_RELOAD_EVENT,
  BEFORE_RELOAD_REGISTRY_KEY,
  isExtensionContextAlive,
  onBeforeExtensionReload,
  runBeforeExtensionReload,
  watchExtensionContext,
} from '../src/core/hmr/before-reload.js';
import { requestExtensionReload } from '../src/core/hmr/client-logic.js';
import { generateHMRClientCode } from '../src/core/hmr/index.js';

beforeEach(() => {
  __resetBeforeReload();
  (globalThis as { __EXTFORGE_HMR_QUIET__?: boolean }).__EXTFORGE_HMR_QUIET__ = true;
});

afterEach(() => {
  __resetBeforeReload();
  (globalThis as { __EXTFORGE_HMR_QUIET__?: boolean }).__EXTFORGE_HMR_QUIET__ = undefined;
});

describe('onBeforeExtensionReload', () => {
  it('runs a registered callback before the reload', async () => {
    const cb = vi.fn();
    onBeforeExtensionReload(cb);
    await runBeforeExtensionReload();
    expect(cb).toHaveBeenCalledOnce();
  });

  it('awaits async callbacks', async () => {
    const order: string[] = [];
    onBeforeExtensionReload(async () => {
      await new Promise((r) => setTimeout(r, 5));
      order.push('teardown');
    });
    await runBeforeExtensionReload();
    order.push('reload');
    expect(order).toEqual(['teardown', 'reload']);
  });

  it('runs every callback even when one throws', async () => {
    const after = vi.fn();
    onBeforeExtensionReload(() => {
      throw new Error('boom');
    });
    onBeforeExtensionReload(after);
    await expect(runBeforeExtensionReload()).resolves.toBeUndefined();
    expect(after).toHaveBeenCalledOnce();
  });

  it('does not let a rejecting callback block the reload', async () => {
    onBeforeExtensionReload(async () => {
      throw new Error('async boom');
    });
    await expect(runBeforeExtensionReload()).resolves.toBeUndefined();
  });

  it('does not let a hanging callback block the reload forever', async () => {
    onBeforeExtensionReload(() => new Promise<void>(() => {}));
    const t0 = Date.now();
    await runBeforeExtensionReload(20);
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it('resolves immediately when nothing is registered', async () => {
    await expect(runBeforeExtensionReload()).resolves.toBeUndefined();
  });

  it('unsubscribes', async () => {
    const cb = vi.fn();
    const off = onBeforeExtensionReload(cb);
    off();
    await runBeforeExtensionReload();
    expect(cb).not.toHaveBeenCalled();
    // idempotent
    expect(() => off()).not.toThrow();
  });

  it('survives a callback that unsubscribes itself mid-run', async () => {
    const second = vi.fn();
    const off = onBeforeExtensionReload(() => off());
    onBeforeExtensionReload(second);
    await runBeforeExtensionReload();
    expect(second).toHaveBeenCalledOnce();
  });

  it('shares one registry with the injected client, on the global', () => {
    onBeforeExtensionReload(() => {});
    const reg = (globalThis as Record<string, unknown>)[BEFORE_RELOAD_REGISTRY_KEY];
    expect(Array.isArray(reg)).toBe(true);
    expect((reg as unknown[]).length).toBe(1);
  });

  it('dispatches extforge:before-reload for listeners that never registered', async () => {
    const heard = vi.fn();
    globalThis.addEventListener(BEFORE_RELOAD_EVENT, heard);
    await runBeforeExtensionReload();
    globalThis.removeEventListener(BEFORE_RELOAD_EVENT, heard);
    expect(heard).toHaveBeenCalledOnce();
  });

  it('broadcasts dispose before the reload is requested', async () => {
    const seq: string[] = [];
    onBeforeExtensionReload(() => {
      seq.push('dispose');
    });
    await runBeforeExtensionReload();
    requestExtensionReload('full-reload', { reloadExtension: () => seq.push('reload') });
    expect(seq).toEqual(['dispose', 'reload']);
  });
});

describe('isExtensionContextAlive', () => {
  it('is alive with a runtime id', () => {
    expect(isExtensionContextAlive({ id: 'abcdef' })).toBe(true);
  });
  it('is dead once the id goes away', () => {
    expect(isExtensionContextAlive({})).toBe(false);
    expect(isExtensionContextAlive(undefined)).toBe(false);
    expect(isExtensionContextAlive(null)).toBe(false);
    expect(isExtensionContextAlive({ id: '' })).toBe(false);
  });
  it('treats a throwing accessor as dead (invalidated context)', () => {
    const runtime = {
      get id(): string {
        throw new Error('Extension context invalidated.');
      },
    };
    expect(isExtensionContextAlive(runtime)).toBe(false);
  });
});

describe('watchExtensionContext (self-dispose fallback)', () => {
  it('fires once when the context goes away, and stops polling', () => {
    vi.useFakeTimers();
    let alive = true;
    const onInvalidated = vi.fn();
    watchExtensionContext({ isAlive: () => alive, onInvalidated, intervalMs: 10 });

    vi.advanceTimersByTime(50);
    expect(onInvalidated).not.toHaveBeenCalled();

    alive = false;
    vi.advanceTimersByTime(10);
    expect(onInvalidated).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(1000);
    expect(onInvalidated).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('treats a throwing probe as an invalidated context', () => {
    vi.useFakeTimers();
    const onInvalidated = vi.fn();
    watchExtensionContext({
      isAlive: () => {
        throw new Error('Extension context invalidated.');
      },
      onInvalidated,
      intervalMs: 10,
    });
    vi.advanceTimersByTime(10);
    expect(onInvalidated).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('can be stopped before it fires', () => {
    vi.useFakeTimers();
    const onInvalidated = vi.fn();
    const stop = watchExtensionContext({ isAlive: () => false, onInvalidated, intervalMs: 10 });
    stop();
    vi.advanceTimersByTime(100);
    expect(onInvalidated).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('swallows a throwing disposer', () => {
    vi.useFakeTimers();
    expect(() => {
      watchExtensionContext({
        isAlive: () => false,
        onInvalidated: () => {
          throw new Error('teardown boom');
        },
        intervalMs: 10,
      });
      vi.advanceTimersByTime(10);
    }).not.toThrow();
    vi.useRealTimers();
  });
});

describe('hmr client — dispose before reload', () => {
  const code = generateHMRClientCode(35729);

  it('runs the before-reload hooks ahead of the reload request', () => {
    expect(code).toContain('runBeforeReloadHooks');
    expect(code).toContain("var BEFORE_RELOAD_REGISTRY_KEY = '__EXTFORGE_BEFORE_RELOAD__'");
    expect(code).toContain("var BEFORE_RELOAD_EVENT = 'extforge:before-reload'");
    const run = code.indexOf('runBeforeReloadHooks().then');
    const reload = code.indexOf('performReload(reason, allowRelay)', run);
    expect(run).toBeGreaterThan(-1);
    expect(reload).toBeGreaterThan(run);
  });

  it('bounds the wait so a hung hook cannot stall the dev loop', () => {
    expect(code).toContain('BEFORE_RELOAD_TIMEOUT_MS');
    expect(code).toContain('Promise.race');
  });

  it('ships the chrome.runtime.id self-dispose fallback', () => {
    expect(code).toContain('watchExtensionContext');
    expect(code).toContain('chrome.runtime.id');
    expect(code).toContain('CONTEXT_POLL_MS');
  });
});
