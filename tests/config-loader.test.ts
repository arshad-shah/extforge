import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfigFile } from '../src/core/config/loader.js';
import { ExtForgeError } from '../src/core/errors/index.js';

interface SampleCfg {
  flag?: boolean;
  list?: number[];
  nested?: { value: string };
}

const DEFAULTS: SampleCfg = { flag: false, list: [1, 2] };

describe('loadConfigFile', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cfg-loader-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns defaults when no config file exists', async () => {
    const r = await loadConfigFile<SampleCfg>({ name: 'foo', cwd: dir, defaults: DEFAULTS });
    expect(r.config).toEqual(DEFAULTS);
    expect(r.configFile).toBeUndefined();
  });

  it('loads a TypeScript config (default export)', async () => {
    writeFileSync(
      join(dir, 'foo.config.ts'),
      `export default { flag: true, nested: { value: 'hi' } };`,
    );
    const r = await loadConfigFile<SampleCfg>({ name: 'foo', cwd: dir, defaults: DEFAULTS });
    expect(r.config.flag).toBe(true);
    expect(r.config.nested).toEqual({ value: 'hi' });
    // shallow-merged: list comes from defaults
    expect(r.config.list).toEqual([1, 2]);
    expect(r.configFile).toMatch(/foo\.config\.ts$/);
  });

  it('loads an MJS config (default export)', async () => {
    writeFileSync(
      join(dir, 'foo.config.mjs'),
      `export default { flag: true };`,
    );
    const r = await loadConfigFile<SampleCfg>({ name: 'foo', cwd: dir, defaults: DEFAULTS });
    expect(r.config.flag).toBe(true);
  });

  it('loads a JS config in an ESM package', async () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
    writeFileSync(join(dir, 'foo.config.js'), `export default { flag: true };`);
    const r = await loadConfigFile<SampleCfg>({ name: 'foo', cwd: dir, defaults: DEFAULTS });
    expect(r.config.flag).toBe(true);
  });

  it('loads a CJS config (module.exports)', async () => {
    writeFileSync(join(dir, 'foo.config.cjs'), `module.exports = { flag: true };`);
    const r = await loadConfigFile<SampleCfg>({ name: 'foo', cwd: dir, defaults: DEFAULTS });
    expect(r.config.flag).toBe(true);
  });

  it('user values win over defaults', async () => {
    writeFileSync(
      join(dir, 'foo.config.ts'),
      `export default { list: [9, 9, 9] };`,
    );
    const r = await loadConfigFile<SampleCfg>({ name: 'foo', cwd: dir, defaults: DEFAULTS });
    expect(r.config.list).toEqual([9, 9, 9]);
    expect(r.config.flag).toBe(false); // from defaults
  });

  it('throws ExtForgeError(EXT_CONFIG_INVALID) on syntax error in TS', async () => {
    writeFileSync(join(dir, 'foo.config.ts'), `export const x = ;`);
    let caught: unknown;
    try {
      await loadConfigFile<SampleCfg>({ name: 'foo', cwd: dir, defaults: DEFAULTS });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ExtForgeError);
    expect((caught as ExtForgeError).code).toBe('EXT_CONFIG_INVALID');
  });

  it('respects probe order: .ts wins over .js when both exist', async () => {
    writeFileSync(join(dir, 'foo.config.ts'), `export default { flag: true };`);
    writeFileSync(join(dir, 'foo.config.js'), `module.exports = { flag: false };`);
    const r = await loadConfigFile<SampleCfg>({ name: 'foo', cwd: dir, defaults: DEFAULTS });
    expect(r.config.flag).toBe(true);
    expect(r.configFile).toMatch(/\.ts$/);
  });

  it('handles a TS config that imports another module (bundled)', async () => {
    // Note: packages from node_modules stay external via packages: 'external'.
    // This test exercises only relative imports being inlined — write two
    // local files and import one from the other.
    writeFileSync(
      join(dir, 'helper.ts'),
      `export const VAL = 42;`,
    );
    writeFileSync(
      join(dir, 'foo.config.ts'),
      `import { VAL } from './helper.js'; export default { list: [VAL] };`,
    );
    const r = await loadConfigFile<SampleCfg>({ name: 'foo', cwd: dir, defaults: DEFAULTS });
    expect(r.config.list).toEqual([42]);
  });

  it('exports configFile as an absolute path', async () => {
    writeFileSync(join(dir, 'foo.config.ts'), `export default {};`);
    const r = await loadConfigFile<SampleCfg>({ name: 'foo', cwd: dir, defaults: DEFAULTS });
    expect(r.configFile).toBeDefined();
    expect(r.configFile!.startsWith('/') || /^[A-Z]:/.test(r.configFile!)).toBe(true);
  });

  it('unwraps `module.exports = { default: {...} }` only when default is present', async () => {
    writeFileSync(
      join(dir, 'foo.config.cjs'),
      `module.exports = { default: { flag: true } };`,
    );
    const r = await loadConfigFile<SampleCfg>({ name: 'foo', cwd: dir, defaults: DEFAULTS });
    expect(r.config.flag).toBe(true);
  });
});
