import { describe, it, expect } from 'vitest';
import { PluginRunner } from '../src/core/plugins/runner.js';
import { createLogger, LogLevel } from '../src/core/logger/index.js';
import type { ExtForgePluginV1 } from '../src/core/plugins/types.js';

describe('onDevReload', () => {
  it('fires registered listeners with the broadcast envelope', async () => {
    const seen: any[] = [];
    const p: ExtForgePluginV1 = {
      name: 'tap', apiVersion: 1,
      setup({ hooks }) { hooks.onDevReload((ev) => { seen.push(ev); }); },
    };
    const r = new PluginRunner([p], {
      config: {} as any,
      paths: { root: '/p', src: '/p/src', dist: '/p/dist' },
      logger: createLogger({ level: LogLevel.Silent }),
      addEntry: () => {}, emitFile: () => {},
    });
    await r.setup();
    await r.fireDevReload({ v: 2, type: 'css', files: ['a.css'], timestamp: 1 });
    expect(seen).toHaveLength(1);
    expect(seen[0].type).toBe('css');
  });

  it('fires with js type and scriptIds', async () => {
    const seen: any[] = [];
    const p: ExtForgePluginV1 = {
      name: 'tap-js', apiVersion: 1,
      setup({ hooks }) { hooks.onDevReload((ev) => { seen.push(ev); }); },
    };
    const r = new PluginRunner([p], {
      config: {} as any,
      paths: { root: '/p', src: '/p/src', dist: '/p/dist' },
      logger: createLogger({ level: LogLevel.Silent }),
      addEntry: () => {}, emitFile: () => {},
    });
    await r.setup();
    await r.fireDevReload({ v: 2, type: 'js', files: ['content.js'], timestamp: 100, scriptIds: [0, 1] });
    expect(seen).toHaveLength(1);
    expect(seen[0].type).toBe('js');
    expect(seen[0].scriptIds).toEqual([0, 1]);
  });

  it('calls listeners across multiple plugins in registration order', async () => {
    const order: string[] = [];
    const makePlugin = (name: string): ExtForgePluginV1 => ({
      name, apiVersion: 1,
      setup({ hooks }) { hooks.onDevReload(() => { order.push(name); }); },
    });
    const r = new PluginRunner([makePlugin('first'), makePlugin('second')], {
      config: {} as any,
      paths: { root: '/p', src: '/p/src', dist: '/p/dist' },
      logger: createLogger({ level: LogLevel.Silent }),
      addEntry: () => {}, emitFile: () => {},
    });
    await r.setup();
    await r.fireDevReload({ v: 2, type: 'full-reload', files: [], timestamp: 0 });
    expect(order).toEqual(['first', 'second']);
  });
});
