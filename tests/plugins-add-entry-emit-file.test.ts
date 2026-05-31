import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadExtForgeConfig } from '../src/core/config.js';
import { build } from '../src/core/builder/index.js';
import { createLogger, LogLevel } from '../src/core/logger/index.js';

const silent = createLogger({ level: LogLevel.Silent });

/**
 * ctx.addEntry / ctx.emitFile were stubbed (threw "not yet implemented") until
 * v1. These tests pin the implemented behavior: a plugin can contribute a
 * synthetic entry point and write arbitrary files into each browser's output.
 */
describe('PluginContext.addEntry / emitFile', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'extforge-emit-'));
    mkdirSync(join(root, 'src/background'), { recursive: true });
    writeFileSync(join(root, 'src/background/index.ts'), 'export const start = () => 1;\n');
    // A source file the plugin will register as a synthetic entry.
    writeFileSync(join(root, 'src/generated-entry.ts'), 'console.log("synthetic");\n');
    writeFileSync(join(root, 'package.json'), '{}');
    writeFileSync(join(root, 'tsconfig.json'), '{}');
  });
  afterEach(() => { try { rmSync(root, { recursive: true, force: true }); } catch {} });

  function writeConfig(): void {
    writeFileSync(
      join(root, 'extforge.config.ts'),
      `export default {
         browsers: ['chrome'],
         framework: 'vanilla',
         manifest: { name: 'x', version: '0.0.1', manifestVersion: 3,
           permissions: { required: [], optional: [], host: [] },
           background: { entrypoint: 'background/index.js' } },
         plugins: [{
           name: 'emitter', apiVersion: 1,
           setup(ctx) {
             ctx.addEntry({ name: 'extra', file: 'src/generated-entry.ts', format: 'esm' });
             ctx.emitFile('plugin-notes.txt', 'hello from emitFile');
             ctx.emitFile('../escape.txt', 'should be rejected');
           },
         }],
       };`,
    );
  }

  it('addEntry bundles a synthetic entry into the output', async () => {
    writeConfig();
    const cfg = await loadExtForgeConfig(root);
    await build(root, cfg, { browser: 'chrome', dev: false }, silent);
    const outFiles = readdirSync(join(root, 'dist/chrome'));
    expect(outFiles).toContain('extra.js');
  });

  it('emitFile writes a file into the browser output directory', async () => {
    writeConfig();
    const cfg = await loadExtForgeConfig(root);
    await build(root, cfg, { browser: 'chrome', dev: false }, silent);
    const dest = join(root, 'dist/chrome/plugin-notes.txt');
    expect(existsSync(dest)).toBe(true);
    expect(readFileSync(dest, 'utf8')).toBe('hello from emitFile');
  });

  it('emitFile rejects paths that escape the output directory', async () => {
    writeConfig();
    const cfg = await loadExtForgeConfig(root);
    await build(root, cfg, { browser: 'chrome', dev: false }, silent);
    // `../escape.txt` would land outside dist/chrome — must not be written.
    expect(existsSync(join(root, 'dist/escape.txt'))).toBe(false);
    expect(existsSync(join(root, 'escape.txt'))).toBe(false);
  });

  it('repeated builds (e.g. per browser) do not duplicate synthetic entries', async () => {
    writeConfig();
    const cfg = await loadExtForgeConfig(root);
    const runner = (cfg as { __pluginRunner?: { getAddedEntries(): unknown[] } }).__pluginRunner!;
    await build(root, cfg, { browser: 'chrome', dev: false }, silent);
    await build(root, cfg, { browser: 'firefox', dev: false }, silent);
    expect(runner.getAddedEntries()).toHaveLength(1);
  });
});
