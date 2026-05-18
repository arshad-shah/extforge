import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path/posix';
import { build } from '../src/core/builder/index.js';
import { isExtForgeError } from '../src/core/errors/index.js';
import { createLogger, LogLevel } from '../src/core/logger/index.js';

describe('builder error wrapping', () => {
  it('throws ExtForgeError(EXT_BUILD_FAILED) on a syntax error', async () => {
    const root = mkdtempSync(join(tmpdir(), 'extforge-'));
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src/background.ts'), 'export const x = ;'); // syntax error
    writeFileSync(
      join(root, 'extforge.config.ts'),
      'export default { browsers: ["chrome"], manifest: { name: "x", version: "0.0.1" } }',
    );

    let caught: unknown;
    try {
      await build(
        root,
        { browsers: ['chrome'], manifest: { name: 'x', version: '0.0.1' } } as any,
        { browser: 'chrome', dev: false },
        createLogger({ level: LogLevel.Silent }),
      );
    } catch (e) { caught = e; }

    expect(isExtForgeError(caught)).toBe(true);
    if (isExtForgeError(caught)) {
      expect(caught.code).toBe('EXT_BUILD_FAILED');
      expect(caught.file).toMatch(/background\.ts/);
      expect(caught.line).toBeGreaterThan(0);
    }
  });

  it('wipes the per-browser output directory before a production build', async () => {
    const root = mkdtempSync(join(tmpdir(), 'extforge-clean-'));
    mkdirSync(join(root, 'src/background'), { recursive: true });
    writeFileSync(join(root, 'src/background/index.ts'), 'export const x = 1;');
    // Pre-populate dist with stale output that should be removed.
    const distBrowser = join(root, 'dist/chrome');
    mkdirSync(distBrowser, { recursive: true });
    const stale = join(distBrowser, 'stale-renamed-chunk.js');
    writeFileSync(stale, '// stale');
    expect(existsSync(stale)).toBe(true);

    await build(
      root,
      {
        browsers: ['chrome'],
        manifest: {
          name: 'x',
          version: '0.0.1',
          description: '',
          manifestVersion: 3,
          permissions: { required: [], optional: [], host: [] },
        },
      } as Parameters<typeof build>[1],
      { browser: 'chrome', dev: false },
      createLogger({ level: LogLevel.Silent }),
    );

    expect(existsSync(stale)).toBe(false);
  });
});
