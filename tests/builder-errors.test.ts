import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
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
});
