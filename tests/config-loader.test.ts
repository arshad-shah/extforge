import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfigModule, resolveConfigFile } from '../src/core/config/loader.js';
import { ExtForgeError } from '../src/core/errors/index.js';

/**
 * Discovery + deep-merge + validation now live in @arshad-shah/config-kit (see
 * loadExtForgeConfig). This module owns the one piece config-kit delegates to a
 * host: turning a resolved config file path into its default export, compiling
 * TypeScript on the fly. These tests pin that loading behaviour.
 */
describe('loadConfigModule', () => {
  let dir: string;

  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cfg-loader-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('loads a TypeScript config (default export)', async () => {
    const file = join(dir, 'foo.config.ts');
    writeFileSync(file, `export default { flag: true, nested: { value: 'hi' } };`);
    const cfg = await loadConfigModule<{ flag: boolean; nested: { value: string } }>(file, dir);
    expect(cfg.flag).toBe(true);
    expect(cfg.nested).toEqual({ value: 'hi' });
  });

  it('loads an MJS config (default export)', async () => {
    const file = join(dir, 'foo.config.mjs');
    writeFileSync(file, `export default { flag: true };`);
    expect((await loadConfigModule<{ flag: boolean }>(file, dir)).flag).toBe(true);
  });

  it('loads a JS config in an ESM package', async () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
    const file = join(dir, 'foo.config.js');
    writeFileSync(file, `export default { flag: true };`);
    expect((await loadConfigModule<{ flag: boolean }>(file, dir)).flag).toBe(true);
  });

  it('loads a CJS config (module.exports)', async () => {
    const file = join(dir, 'foo.config.cjs');
    writeFileSync(file, `module.exports = { flag: true };`);
    expect((await loadConfigModule<{ flag: boolean }>(file, dir)).flag).toBe(true);
  });

  it('loads a JSON config', async () => {
    const file = join(dir, 'foo.config.json');
    writeFileSync(file, `{ "flag": true }`);
    expect((await loadConfigModule<{ flag: boolean }>(file, dir)).flag).toBe(true);
  });

  it('throws ExtForgeError(EXT_CONFIG_INVALID) on syntax error in TS', async () => {
    const file = join(dir, 'foo.config.ts');
    writeFileSync(file, `export const x = ;`);
    let caught: unknown;
    try { await loadConfigModule(file, dir); } catch (err) { caught = err; }
    expect(caught).toBeInstanceOf(ExtForgeError);
    expect((caught as ExtForgeError).code).toBe('EXT_CONFIG_INVALID');
  });

  it('inlines relative imports via esbuild bundling', async () => {
    writeFileSync(join(dir, 'helper.ts'), `export const VAL = 42;`);
    const file = join(dir, 'foo.config.ts');
    writeFileSync(file, `import { VAL } from './helper.js'; export default { list: [VAL] };`);
    expect((await loadConfigModule<{ list: number[] }>(file, dir)).list).toEqual([42]);
  });

  it('unwraps `module.exports = { default: {...} }` only when default is present', async () => {
    const file = join(dir, 'foo.config.cjs');
    writeFileSync(file, `module.exports = { default: { flag: true } };`);
    expect((await loadConfigModule<{ flag: boolean }>(file, dir)).flag).toBe(true);
  });
});

describe('resolveConfigFile', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cfg-resolve-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('returns undefined when no config file exists', () => {
    expect(resolveConfigFile(dir, 'foo')).toBeUndefined();
  });

  it('resolves to an absolute path', () => {
    writeFileSync(join(dir, 'foo.config.ts'), `export default {};`);
    const p = resolveConfigFile(dir, 'foo');
    expect(p).toBeDefined();
    expect(p!.startsWith('/') || /^[A-Z]:/.test(p!)).toBe(true);
  });

  it('probes in order: .ts wins over .js when both exist', () => {
    writeFileSync(join(dir, 'foo.config.ts'), `export default {};`);
    writeFileSync(join(dir, 'foo.config.js'), `module.exports = {};`);
    expect(resolveConfigFile(dir, 'foo')).toMatch(/\.ts$/);
  });
});
