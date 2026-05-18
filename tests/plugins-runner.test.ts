import { describe, it, expect } from 'vitest';
import { PluginRunner } from '../src/core/plugins/runner.js';
import { createLogger, LogLevel } from '../src/core/logger/index.js';
import { isExtForgeError } from '../src/core/errors/index.js';
import type { ExtForgePluginV1, EntryDescriptor } from '../src/core/plugins/types.js';

const baseCtx = {
  config: { browsers: ['chrome'] } as any,
  paths: { root: '/p', src: '/p/src', dist: '/p/dist' },
  logger: createLogger({ level: LogLevel.Silent }),
  addEntry: () => {},
  emitFile: () => {},
};

describe('PluginRunner', () => {
  it('calls every plugin setup once in registration order', async () => {
    const order: string[] = [];
    const a: ExtForgePluginV1 = { name: 'a', apiVersion: 1, setup: () => { order.push('a'); } };
    const b: ExtForgePluginV1 = { name: 'b', apiVersion: 1, setup: () => { order.push('b'); } };
    const r = new PluginRunner([a, b], baseCtx);
    await r.setup();
    expect(order).toEqual(['a', 'b']);
  });

  it('reduce-chains onManifestTransform across plugins', async () => {
    const a: ExtForgePluginV1 = {
      name: 'a', apiVersion: 1,
      setup({ hooks }) { hooks.onManifestTransform((m) => ({ ...m, fromA: true })); },
    };
    const b: ExtForgePluginV1 = {
      name: 'b', apiVersion: 1,
      setup({ hooks }) { hooks.onManifestTransform((m) => ({ ...m, fromB: true })); },
    };
    const r = new PluginRunner([a, b], baseCtx);
    await r.setup();
    const out = await r.fireManifestTransform({ name: 'x' }, 'chrome');
    expect(out).toMatchObject({ name: 'x', fromA: true, fromB: true });
  });

  it('skips a manifestTransform return that is not a plain object', async () => {
    // A plugin returning `null` (or a non-object) used to overwrite the
    // manifest, which then crashed every downstream plugin reading
    // `next.permissions` etc. Treat anything that isn't a plain object as
    // "no change requested".
    const breaks: ExtForgePluginV1 = {
      name: 'breaks', apiVersion: 1,
      setup({ hooks }) { hooks.onManifestTransform(() => null as unknown as Record<string, unknown>); },
    };
    const reads: ExtForgePluginV1 = {
      name: 'reads', apiVersion: 1,
      setup({ hooks }) {
        hooks.onManifestTransform((m) => {
          if (!m || typeof m !== 'object') throw new Error('manifest is not an object');
          return { ...m, ok: true };
        });
      },
    };
    const r = new PluginRunner([breaks, reads], baseCtx);
    await r.setup();
    const out = await r.fireManifestTransform({ name: 'x' }, 'chrome');
    expect(out).toMatchObject({ name: 'x', ok: true });
  });

  it('reduce-chains onBuildEntry; void return preserves prior value', async () => {
    const a: ExtForgePluginV1 = {
      name: 'a', apiVersion: 1,
      setup({ hooks }) {
        hooks.onBuildEntry((e) => ({ ...e, esbuildOptions: { ...(e.esbuildOptions ?? {}), jsx: 'automatic' } }));
      },
    };
    const b: ExtForgePluginV1 = {
      name: 'b', apiVersion: 1,
      setup({ hooks }) { hooks.onBuildEntry(() => undefined); },
    };
    const r = new PluginRunner([a, b], baseCtx);
    await r.setup();
    const entry: EntryDescriptor = { name: 'x', file: '/p/src/x.tsx', format: 'esm' };
    const out = await r.fireBuildEntry(entry);
    expect(out.esbuildOptions).toMatchObject({ jsx: 'automatic' });
  });

  it('throws ExtForgeError(EXT_PLUGIN_FAILED) when a plugin throws in setup', async () => {
    const a: ExtForgePluginV1 = {
      name: 'boom', apiVersion: 1,
      setup() { throw new Error('boom'); },
    };
    const r = new PluginRunner([a], baseCtx);
    let caught: unknown;
    try { await r.setup(); } catch (e) { caught = e; }
    expect(isExtForgeError(caught)).toBe(true);
    if (isExtForgeError(caught)) {
      expect(caught.code).toBe('EXT_PLUGIN_FAILED');
      expect(caught.message).toContain('boom');
    }
  });

  it('attaches plugin name and hook name to thrown errors during fire*', async () => {
    const a: ExtForgePluginV1 = {
      name: 'transform-bomb', apiVersion: 1,
      setup({ hooks }) { hooks.onManifestTransform(() => { throw new Error('kapow'); }); },
    };
    const r = new PluginRunner([a], baseCtx);
    await r.setup();
    let caught: unknown;
    try { await r.fireManifestTransform({}, 'chrome'); } catch (e) { caught = e; }
    expect(isExtForgeError(caught)).toBe(true);
    if (isExtForgeError(caught)) {
      expect(caught.message).toContain('transform-bomb');
      expect(caught.message).toContain('onManifestTransform');
    }
  });
});
