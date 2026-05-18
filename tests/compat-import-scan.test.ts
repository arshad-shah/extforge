import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../src/core/builder/index.js';
import { isExtForgeError } from '../src/core/errors/index.js';
import { createLogger, LogLevel } from '../src/core/logger/index.js';

describe('compat scan covers imported modules', () => {
  it('flags chrome.* calls in helper files imported by an entry (--strict)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'extforge-compat-import-'));
    mkdirSync(join(root, 'src/background'), { recursive: true });
    // Entry imports a helper — the helper contains the Safari-incompatible API.
    writeFileSync(
      join(root, 'src/background/index.ts'),
      `import { syncGroups } from './helper.js';\nsyncGroups();\n`,
    );
    writeFileSync(
      join(root, 'src/background/helper.ts'),
      // chrome.tabGroups is unsupported on Safari per @mdn/browser-compat-data.
      `export function syncGroups() { chrome.tabGroups.query({}, () => {}); }\n`,
    );

    let caught: unknown;
    try {
      await build(
        root,
        { browsers: ['safari'], manifest: { name: 'x', version: '0.0.1' } } as Parameters<typeof build>[1],
        { browser: 'safari', dev: false, strictCompat: true },
        createLogger({ level: LogLevel.Silent }),
      );
    } catch (e) { caught = e; }

    expect(isExtForgeError(caught)).toBe(true);
    if (isExtForgeError(caught)) {
      expect(caught.code).toBe('EXT_COMPAT_UNSUPPORTED');
    }
  });
});
