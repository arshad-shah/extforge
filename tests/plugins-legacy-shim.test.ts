import { describe, it, expect } from 'vitest';
import { PluginRunner } from '../src/core/plugins/runner.js';
import { createLogger, LogLevel } from '../src/core/logger/index.js';
import type { ExtForgePluginLegacy } from '../src/core/plugins/types.js';

const baseCtx = {
  config: { browsers: ['chrome'] } as any,
  paths: { root: '/p', src: '/p/src', dist: '/p/dist' },
  logger: createLogger({ level: LogLevel.Silent }),
  addEntry: () => {},
  emitFile: () => {},
};

describe('legacy plugin shim', () => {
  it('adapts setup(config) to setup({config})', async () => {
    let seen: any;
    const legacy: ExtForgePluginLegacy = {
      name: 'old',
      setup(config) { seen = config; },
    };
    const r = new PluginRunner([legacy], baseCtx);
    await r.setup();
    expect(seen).toBe(baseCtx.config);
  });

  it('routes buildStart and buildEnd through onBuildStart/onBuildEnd', async () => {
    const calls: string[] = [];
    const legacy: ExtForgePluginLegacy = {
      name: 'old',
      buildStart() { calls.push('start'); },
      buildEnd() { calls.push('end'); },
    };
    const r = new PluginRunner([legacy], baseCtx);
    await r.setup();
    await r.fireBuildStart({ browser: 'chrome', dev: false });
    await r.fireBuildEnd({ errors: [], warnings: [], outDir: '/p/dist/chrome', browser: 'chrome' } as any);
    expect(calls).toEqual(['start', 'end']);
  });
});
