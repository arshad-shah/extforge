import { describe, it, expect } from 'vitest';
import { presetReact } from '../src/core/plugins/preset-react.js';
import { PluginRunner } from '../src/core/plugins/runner.js';
import { createLogger, LogLevel } from '../src/core/logger/index.js';

const baseCtx = {
  config: {} as any,
  paths: { root: '/p', src: '/p/src', dist: '/p/dist' },
  logger: createLogger({ level: LogLevel.Silent }),
  addEntry: () => {},
  emitFile: () => {},
};

describe('presetReact', () => {
  it('transforms entry esbuild options to use automatic JSX with default importSource react', async () => {
    const r = new PluginRunner([presetReact()], baseCtx);
    await r.setup();
    const out = await r.fireBuildEntry({ name: 'x', file: '/p/src/x.tsx', format: 'esm' });
    expect(out.esbuildOptions).toMatchObject({ jsx: 'automatic', jsxImportSource: 'react' });
  });

  it('respects custom jsxImportSource and classic runtime', async () => {
    const r = new PluginRunner([presetReact({ jsxImportSource: 'preact', jsxRuntime: 'classic' })], baseCtx);
    await r.setup();
    const out = await r.fireBuildEntry({ name: 'x', file: '/p/src/x.tsx', format: 'esm' });
    expect(out.esbuildOptions).toMatchObject({ jsx: 'transform', jsxImportSource: 'preact' });
  });

  it('exposes the plugin name and apiVersion', () => {
    const p = presetReact();
    expect(p.name).toBe('extforge:preset-react');
    expect(p.apiVersion).toBe(1);
  });
});
