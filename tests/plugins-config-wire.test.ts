import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path/posix';
import { loadExtForgeConfig } from '../src/core/config.js';

describe('loadExtForgeConfig plugin wire-in', () => {
  it('attaches a non-enumerable __pluginRunner to the result', async () => {
    const root = mkdtempSync(join(tmpdir(), 'extforge-cfg-'));
    writeFileSync(
      join(root, 'extforge.config.ts'),
      'export default { browsers: ["chrome"], framework: "react", manifest: { name: "x", version: "0.0.1" } }',
    );
    const cfg = await loadExtForgeConfig(root);
    expect((cfg as any).__pluginRunner).toBeDefined();
    expect(Object.keys(cfg)).not.toContain('__pluginRunner');
    // presetReact should be auto-injected because framework=react
    const runner = (cfg as any).__pluginRunner;
    expect(runner.plugins.some((p: any) => p.name === 'extforge:preset-react')).toBe(true);
  });

  it('does not auto-inject presetReact when framework is not react', async () => {
    const root = mkdtempSync(join(tmpdir(), 'extforge-cfg2-'));
    writeFileSync(
      join(root, 'extforge.config.ts'),
      'export default { browsers: ["chrome"], framework: "vanilla", manifest: { name: "x", version: "0.0.1" } }',
    );
    const cfg = await loadExtForgeConfig(root);
    const runner = (cfg as any).__pluginRunner;
    expect(runner.plugins.some((p: any) => p.name === 'extforge:preset-react')).toBe(false);
  });

  it('user plugin onConfigResolved fires', async () => {
    const root = mkdtempSync(join(tmpdir(), 'extforge-cfg3-'));
    writeFileSync(
      join(root, 'extforge.config.ts'),
      `let seen = false;
       export default {
         browsers: ['chrome'],
         framework: 'vanilla',
         manifest: { name: 'x', version: '0.0.1' },
         plugins: [{
           name: 'observer', apiVersion: 1,
           setup({ hooks }) { hooks.onConfigResolved(() => { (globalThis as any).__seen = true; }); },
         }],
       };`,
    );
    delete (globalThis as any).__seen;
    await loadExtForgeConfig(root);
    expect((globalThis as any).__seen).toBe(true);
  });
});
