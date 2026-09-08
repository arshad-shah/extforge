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
  resolveFirefoxBinary,
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

/**
 * A fake Chromium that answers `Extensions.loadUnpacked` over the CDP pipe,
 * and records its own argv.
 *
 * A stub that merely exits is no longer a stand-in for a browser: the
 * launcher installs the extension over CDP and waits for the reply, so a
 * fake that never answers is a fake that has failed. `argvFile` is written
 * because the other thing worth asserting is *what was passed* — a flag that
 * is accepted and then not handed to the browser looks identical from
 * outside to one that works.
 */
function fakeChromium(relPath: string, argvFile: string): string {
  const isWin = process.platform === 'win32';
  const jsPath = join(dir, `${relPath}.mjs`);
  mkdirSync(dirname(jsPath), { recursive: true });
  writeFileSync(
    jsPath,
    `
import { writeFileSync } from 'node:fs';
import { Socket } from 'node:net';
writeFileSync(${JSON.stringify(argvFile)}, process.argv.slice(2).join('\\n'));
// A pipe fd is a socket, not a file: createReadStream on one does not
// reliably deliver data. This is the primitive Chrome's own pipe uses.
try {
  const incoming = new Socket({ fd: 3, readable: true, writable: false });
  const outgoing = new Socket({ fd: 4, readable: false, writable: true });
  let buf = '';
  incoming.setEncoding('utf8');
  incoming.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\\0')) !== -1) {
      const msg = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      outgoing.write(JSON.stringify({ id: msg.id, result: {} }) + '\\0');
    }
  });
} catch {}
setTimeout(() => {}, 5000);
`,
  );
  const target = isWin ? `${relPath}.cmd` : relPath;
  const p = join(dir, target);
  writeFileSync(
    p,
    isWin
      ? `@echo off\r\n"${process.execPath}" "${jsPath}" %*\r\n`
      : `#!/bin/sh\nexec "${process.execPath}" "${jsPath}" "$@"\n`,
  );
  if (!isWin) chmodSync(p, 0o755);
  return p;
}

/**
 * A fake that records its argv and then stays alive, speaking nothing.
 *
 * Enough to assert what the launcher passed and wrote; not enough to
 * complete a debugging handshake, which is deliberate — the launcher must
 * report that failure rather than claim success.
 */
function recordingBinary(relPath: string, argvFile: string): string {
  const isWin = process.platform === 'win32';
  const target = isWin && !relPath.endsWith('.cmd') ? `${relPath}.cmd` : relPath;
  const p = join(dir, target);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(
    p,
    isWin
      ? `@echo off\r\necho %*> "${argvFile}"\r\nping -n 6 127.0.0.1 >nul\r\n`
      : `#!/bin/sh\nprintf '%s\\n' "$@" > "${argvFile}"\nsleep 5\n`,
  );
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

describe('resolveFirefoxBinary', () => {
  it('accepts an explicit override that exists', () => {
    const bin = fakeBinary('my-firefox');
    expect(resolveFirefoxBinary(bin)).toBe(bin);
  });

  it('rejects an override that does not exist', () => {
    expect(resolveFirefoxBinary(join(dir, 'nope'))).toBeUndefined();
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

  it('falls back with a warning when no firefox binary is found', async () => {
    const result = await launchDevBrowser({
      browser: 'firefox',
      projectRoot: dir,
      distDir: join(dir, 'dist', 'firefox'),
      profileDir: join(dir, 'profile'),
      binary: join(dir, 'does-not-exist'),
    });
    expect(result.launched).toBe(false);
    expect(result.warning).toMatch(/firefox/i);
  });

  it('launches chrome with a resolved binary and creates the profile dir', async () => {
    // A CDP-speaking fake: the launcher installs the extension over the pipe
    // and waits for the reply, so a stub that only exits is no longer a
    // stand-in for a browser.
    const bin = fakeChromium('fake-chrome', join(dir, 'argv-launch.txt'));
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

  it('writes the profile preferences and asks for the Remote Agent', async () => {
    /*
     * Firefox's half is covered in two places on purpose. The protocol lives
     * in `firefox-bidi.test.ts`, against a stub — Node has a WebSocket client
     * and no server, so a faithful end-to-end fake would be a hand-rolled
     * handshake and frame codec. What belongs here is what the launcher
     * *does* before any of that: the preferences have to be on disk before
     * Firefox reads them, and the Remote Agent has to be asked for, or there
     * is nothing to connect to.
     */
    const profileDir = join(dir, 'profile', 'firefox');
    const argvFile = join(dir, 'argv-firefox.txt');
    const bin = recordingBinary('fake-firefox', argvFile);
    const result = await launchDevBrowser({
      browser: 'firefox',
      projectRoot: dir,
      distDir: join(dir, 'dist', 'firefox'),
      profileDir,
      binary: bin,
    });

    // The connection cannot succeed against a fake that speaks nothing, and
    // the failure must say so rather than report a browser that is ready.
    expect(result.launched).toBe(false);
    expect(result.warning).toMatch(/Remote Agent|Failed to launch Firefox/i);

    const prefs = readFileSync(join(profileDir, 'user.js'), 'utf8');
    // A fresh profile otherwise stops to ask about the default browser and
    // shows an onboarding tour, in a window nobody is sitting in front of.
    expect(prefs).toContain('"browser.shell.checkDefaultBrowser", false');
    // Temporary add-ons are exempt from signing, but a profile that insists
    // on it refuses before it gets that far.
    expect(prefs).toContain('"xpinstall.signatures.required", false');

    const argv = await readArgv(argvFile);
    expect(argv).toContain('--remote-debugging-port');
    expect(argv).toContain('-profile');
    // A new instance, rather than handing the URLs to a Firefox already
    // running on somebody's real profile.
    expect(argv).toContain('-no-remote');
  });
});

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
    const bin = fakeChromium('fake-chrome', argvFile);
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
    const bin = fakeChromium('fake-chrome-2', argvFile);
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
    /*
     * The pipe is always there; the port is not.
     *
     * They are different things and the difference is the security posture.
     * `--remote-debugging-pipe` is how the extension gets installed at all —
     * two inherited file descriptors nothing else on the machine can reach.
     * `--remote-debugging-port` is a listening, unauthenticated socket, and
     * appears only when somebody asked for one.
     */
    expect(argv).toContain('--remote-debugging-pipe');
    expect(argv.some((a) => a.startsWith('--remote-debugging-port'))).toBe(false);
  });

  it('keeps start URLs after the flags, so they are still opened as tabs', async () => {
    const argvFile = join(dir, 'argv3.txt');
    const bin = fakeChromium('fake-chrome-3', argvFile);
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
