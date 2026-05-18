import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { archiveFilename, packageBrowser } from '../src/cli/package-cmd.js';
import { createLogger, LogLevel } from '../src/core/logger/index.js';

const log = createLogger({ level: LogLevel.Silent });

describe('archiveFilename', () => {
  it('returns the expected name for clean inputs', () => {
    expect(archiveFilename('my-ext', '1.2.3', 'chrome')).toBe('my-ext-chrome-v1.2.3.zip');
  });

  it('strips shell metacharacters from name and version', () => {
    // A malicious manifest.name shouldn't ever land in a shell-interpolatable
    // archive path. Punctuation that could be reinterpreted by a shell or by
    // path-traversal is replaced with `_`.
    const out = archiveFilename('foo"; rm -rf /; "', '0.0.0`whoami`', 'chrome');
    expect(out).not.toMatch(/[;`$"'<>(){}|&*?\s\\/]/);
    // Whole filename matches the safe character class, plus the extension.
    expect(out).toMatch(/^[a-zA-Z0-9._-]+\.zip$/);
    expect(out).toContain('-chrome-v');
  });

  it('falls back to defaults for missing values', () => {
    expect(archiveFilename(undefined, undefined, 'firefox')).toBe('extension-firefox-v0.0.0.zip');
  });
});

describe('packageBrowser', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'extforge-pkg-'));
  });

  afterEach(() => {
    try { rmSync(tmp, { recursive: true, force: true }); } catch {}
  });

  it('does not execute shell metacharacters from the archive filename', async () => {
    // Sentinel — must NOT be created during packaging.
    const sentinel = join(tmp, 'PWNED');
    expect(existsSync(sentinel)).toBe(false);

    const dist = join(tmp, 'dist', 'chrome');
    mkdirSync(dist, { recursive: true });
    writeFileSync(join(dist, 'manifest.json'), '{}');
    const pkgDir = join(tmp, 'packages');
    mkdirSync(pkgDir);

    // Even if zip is unavailable in this environment the call must not run
    // arbitrary shell from the malicious name.
    const archive = join(pkgDir, archiveFilename(`evil"; touch "${sentinel}`, '0.0.0', 'chrome'));
    await packageBrowser({ dist, archive, log }).catch(() => { /* zip may not be installed */ });

    expect(existsSync(sentinel)).toBe(false);
  });
});
