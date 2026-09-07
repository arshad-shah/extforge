import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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

/**
 * A no-op executable script — `spawn` runs it and it exits immediately.
 * `relPath` may include subdirectories (e.g. `node_modules/.bin/web-ext`).
 * On win32 this writes a `.cmd` stub, since that's what Node resolves there.
 */
function fakeBinary(relPath: string): string {
  const isWin = process.platform === 'win32';
  const target = isWin && !relPath.endsWith('.cmd') ? `${relPath}.cmd` : relPath;
  const p = join(dir, target);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, isWin ? '@echo off\r\nexit /b 0\r\n' : '#!/bin/sh\nexit 0\n');
  if (!isWin) chmodSync(p, 0o755);
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
    const p = fakeBinary(join('node_modules', '.bin', 'web-ext'));
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

/**
 * A fake browser that writes its own argv to `argvFile`.
 *
 * The other fakes here only need to exit cleanly, because the assertions are
 * about whether a launch happened. These assertions are about *what was
 * passed*, which is the whole of the debug-port feature — a flag that is
 * accepted, logged and then not handed to the browser looks identical from
 * the outside to one that works, right up until something tries to connect.
 */
function recordingBinary(relPath: string, argvFile: string): string {
  const isWin = process.platform === 'win32';
  const target = isWin && !relPath.endsWith('.cmd') ? `${relPath}.cmd` : relPath;
  const p = join(dir, target);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(
    p,
    isWin
      ? `@echo off\r\necho %*> "${argvFile}"\r\nexit /b 0\r\n`
      : `#!/bin/sh\nprintf '%s\\n' "$@" > "${argvFile}"\nexit 0\n`,
  );
  if (!isWin) chmodSync(p, 0o755);
  return p;
}

/** Waits for the fake to have written its argv. */
async function readArgv(argvFile: string): Promise<string[]> {
  for (let i = 0; i < 50; i++) {
    if (existsSync(argvFile)) {
      const raw = readFileSync(argvFile, 'utf8').trim();
      if (raw) return raw.split(/\r?\n|\s+/).filter(Boolean);
    }
    await new Promise((r) => setTimeout(r, 20));
  }
  return [];
}

describe('debugPort', () => {
  it('passes a CDP port to chrome, bound to loopback', async () => {
    const argvFile = join(dir, 'argv.txt');
    const bin = recordingBinary('fake-chrome', argvFile);
    const result = await launchDevBrowser({
      browser: 'chrome',
      projectRoot: dir,
      distDir: join(dir, 'dist', 'chrome'),
      profileDir: join(dir, 'profile'),
      binary: bin,
      debugPort: 9333,
    });
    expect(result.launched).toBe(true);
    expect(result.debugPort).toBe(9333);

    const argv = await readArgv(argvFile);
    expect(argv).toContain('--remote-debugging-port=9333');
    // Never on a routable interface. The endpoint has no authentication, so
    // anything that can reach it can drive the browser and read whatever the
    // profile is logged into.
    expect(argv).toContain('--remote-debugging-address=127.0.0.1');
  });

  it('passes nothing when no port is asked for', async () => {
    const argvFile = join(dir, 'argv2.txt');
    const bin = recordingBinary('fake-chrome-2', argvFile);
    const result = await launchDevBrowser({
      browser: 'chrome',
      projectRoot: dir,
      distDir: join(dir, 'dist', 'chrome'),
      profileDir: join(dir, 'profile'),
      binary: bin,
    });
    expect(result.launched).toBe(true);
    expect(result.debugPort).toBeUndefined();

    const argv = await readArgv(argvFile);
    expect(argv.some((a) => a.startsWith('--remote-debugging'))).toBe(false);
  });

  it('keeps start URLs after the flags, so they are still opened as tabs', async () => {
    const argvFile = join(dir, 'argv3.txt');
    const bin = recordingBinary('fake-chrome-3', argvFile);
    await launchDevBrowser({
      browser: 'chrome',
      projectRoot: dir,
      distDir: join(dir, 'dist', 'chrome'),
      profileDir: join(dir, 'profile'),
      binary: bin,
      debugPort: 9444,
      startUrls: ['https://example.com'],
    });

    const argv = await readArgv(argvFile);
    // Chromium reads trailing positionals as URLs. Inserting the debug flags
    // after them would make the browser treat a flag as a URL to open.
    expect(argv.indexOf('--remote-debugging-port=9444')).toBeLessThan(
      argv.indexOf('https://example.com'),
    );
  });
});
