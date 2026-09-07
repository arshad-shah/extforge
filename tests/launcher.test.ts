import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  launchDevBrowser,
  resolveChromeBinary,
  resolveEdgeBinary,
  resolveWebExtBinary,
} from '../src/core/launcher/index.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'extforge-launcher-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A no-op executable script — `spawn` runs it and it exits immediately. */
function fakeBinary(name: string): string {
  const p = join(dir, name);
  writeFileSync(p, '#!/bin/sh\nexit 0\n');
  chmodSync(p, 0o755);
  return p;
}

describe('resolveChromeBinary / resolveEdgeBinary', () => {
  it('accepts an explicit override that exists', () => {
    const bin = fakeBinary('my-chrome');
    expect(resolveChromeBinary(bin)).toBe(bin);
  });

  it('rejects an override that does not exist', () => {
    expect(resolveChromeBinary(join(dir, 'nope'))).toBeUndefined();
  });

  it('edge: accepts an explicit override that exists', () => {
    const bin = fakeBinary('my-edge');
    expect(resolveEdgeBinary(bin)).toBe(bin);
  });
});

describe('resolveWebExtBinary', () => {
  it('finds a project-local node_modules/.bin/web-ext', () => {
    const binDir = join(dir, 'node_modules', '.bin');
    mkdirSync(binDir, { recursive: true });
    const p = join(binDir, 'web-ext');
    writeFileSync(p, '#!/bin/sh\nexit 0\n');
    chmodSync(p, 0o755);
    expect(resolveWebExtBinary(dir)).toBe(p);
  });

  it('returns undefined when nothing is installed and PATH is empty', () => {
    const empty = mkdtempSync(join(tmpdir(), 'extforge-empty-'));
    const prevPath = process.env.PATH;
    process.env.PATH = empty;
    try {
      expect(resolveWebExtBinary(dir)).toBeUndefined();
    } finally {
      process.env.PATH = prevPath;
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it('accepts an explicit override', () => {
    const bin = fakeBinary('custom-web-ext');
    expect(resolveWebExtBinary(dir, bin)).toBe(bin);
  });
});

describe('launchDevBrowser', () => {
  it('falls back with a warning for safari (never launched)', async () => {
    const result = await launchDevBrowser({
      browser: 'safari',
      projectRoot: dir,
      distDir: join(dir, 'dist', 'safari'),
      profileDir: join(dir, 'profile'),
    });
    expect(result.launched).toBe(false);
    expect(result.process).toBeUndefined();
    expect(result.warning).toMatch(/safari/i);
  });

  it('falls back with a warning when no chrome/edge binary is found', async () => {
    const result = await launchDevBrowser({
      browser: 'chrome',
      projectRoot: dir,
      distDir: join(dir, 'dist', 'chrome'),
      profileDir: join(dir, 'profile'),
      binary: join(dir, 'does-not-exist'),
    });
    expect(result.launched).toBe(false);
    expect(result.warning).toMatch(/chrome/i);
  });

  it('falls back with a warning when web-ext is not found for firefox', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'extforge-empty-'));
    const prevPath = process.env.PATH;
    process.env.PATH = empty;
    try {
      const result = await launchDevBrowser({
        browser: 'firefox',
        projectRoot: dir,
        distDir: join(dir, 'dist', 'firefox'),
        profileDir: join(dir, 'profile'),
      });
      expect(result.launched).toBe(false);
      expect(result.warning).toMatch(/web-ext/i);
    } finally {
      process.env.PATH = prevPath;
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it('launches chrome with a resolved binary and creates the profile dir', async () => {
    const bin = fakeBinary('fake-chrome');
    const profileDir = join(dir, 'profile', 'chrome');
    const result = await launchDevBrowser({
      browser: 'chrome',
      projectRoot: dir,
      distDir: join(dir, 'dist', 'chrome'),
      profileDir,
      binary: bin,
    });
    expect(result.launched).toBe(true);
    expect(result.binary).toBe(bin);
    expect(result.process).toBeDefined();
    expect(existsSync(profileDir)).toBe(true);
    result.process?.kill();
  });

  it('launches firefox via a resolved web-ext binary', async () => {
    const bin = fakeBinary('fake-web-ext');
    const profileDir = join(dir, 'profile', 'firefox');
    const result = await launchDevBrowser({
      browser: 'firefox',
      projectRoot: dir,
      distDir: join(dir, 'dist', 'firefox'),
      profileDir,
      binary: bin,
    });
    expect(result.launched).toBe(true);
    expect(result.binary).toBe(bin);
    expect(result.process).toBeDefined();
    expect(existsSync(profileDir)).toBe(true);
    result.process?.kill();
  });
});
