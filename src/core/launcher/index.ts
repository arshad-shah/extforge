/**
 * Dev-server browser launcher.
 *
 * Resolves a local Chrome/Chromium/Edge binary (or the `web-ext` CLI for
 * Firefox) and launches it with the freshly built extension already
 * installed, using a persistent profile directory so logins, devtools
 * layout and pinned toolbar position survive a `dev` restart.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import type { Browser } from '../manifest/index.js';

const CHROME_LINUX_NAMES = [
  'google-chrome-stable',
  'google-chrome',
  'chromium-browser',
  'chromium',
];
const CHROME_MAC_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];
const CHROME_WIN_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

const EDGE_LINUX_NAMES = ['microsoft-edge-stable', 'microsoft-edge'];
const EDGE_MAC_PATHS = ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'];
const EDGE_WIN_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

/** Search every directory on PATH for any of `names`. First match wins. */
function findOnPath(names: string[]): string | undefined {
  const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', ''] : [''];
  for (const dir of dirs) {
    for (const name of names) {
      for (const ext of exts) {
        const candidate = join(dir, name + ext);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return undefined;
}

function firstExisting(paths: string[]): string | undefined {
  return paths.find((p) => existsSync(p));
}

/** Resolve a local Chrome/Chromium binary, or undefined if none is found. */
export function resolveChromeBinary(override?: string): string | undefined {
  if (override) return existsSync(override) ? override : undefined;
  if (process.platform === 'darwin') return firstExisting(CHROME_MAC_PATHS);
  if (process.platform === 'win32')
    return firstExisting(CHROME_WIN_PATHS) ?? findOnPath(['chrome']);
  return findOnPath(CHROME_LINUX_NAMES);
}

/** Resolve a local Microsoft Edge binary, or undefined if none is found. */
export function resolveEdgeBinary(override?: string): string | undefined {
  if (override) return existsSync(override) ? override : undefined;
  if (process.platform === 'darwin') return firstExisting(EDGE_MAC_PATHS);
  if (process.platform === 'win32') return firstExisting(EDGE_WIN_PATHS) ?? findOnPath(['msedge']);
  return findOnPath(EDGE_LINUX_NAMES);
}

/** Resolve the `web-ext` CLI: a project-local install first, then PATH. */
export function resolveWebExtBinary(projectRoot: string, override?: string): string | undefined {
  if (override) return existsSync(override) ? override : undefined;
  const binName = process.platform === 'win32' ? 'web-ext.cmd' : 'web-ext';
  const local = join(projectRoot, 'node_modules', '.bin', binName);
  if (existsSync(local)) return local;
  return findOnPath([binName]);
}

/**
 * Since the fix for CVE-2024-27980, `child_process.spawn()` rejects
 * `.cmd`/`.bat` targets with `EINVAL` unless `shell` is truthy — and adding
 * `shell: true` would reopen a command-injection surface, since `distDir`,
 * `profileDir` and `startUrls` all flow into the spawned args. So on
 * Windows, resolve the project-local install's actual JS entrypoint and run
 * it directly through `process.execPath` instead of the `.cmd` shim.
 */
function resolveWebExtSpawnTarget(
  projectRoot: string,
  webExt: string,
): { command: string; prefixArgs: string[] } {
  if (process.platform === 'win32' && webExt.toLowerCase().endsWith('.cmd')) {
    const jsEntry = join(projectRoot, 'node_modules', 'web-ext', 'bin', 'web-ext.js');
    if (existsSync(jsEntry)) return { command: process.execPath, prefixArgs: [jsEntry] };
  }
  return { command: webExt, prefixArgs: [] };
}

export interface LaunchDevBrowserOptions {
  browser: Browser;
  /** Project root — used to resolve a project-local `web-ext` install. */
  projectRoot: string;
  /** Directory containing the built, unpacked extension (`dist/<browser>`). */
  distDir: string;
  /** Persistent profile directory, created if it doesn't exist. */
  profileDir: string;
  /** Override the auto-detected binary (or `web-ext`, for Firefox). */
  binary?: string;
  /** URLs to open in new tabs on launch. */
  startUrls?: string[];
  /**
   * Open a CDP endpoint on this port, so the launched browser can be driven.
   *
   * `--open` gives a developer a browser with the extension in it. This gives
   * a *script* one: Playwright and Puppeteer both attach over CDP, and
   * without a port there is no way to reach the browser ExtForge started —
   * so anything automated has to launch a second one and reproduce the
   * profile, the flags and the extension path by hand.
   *
   * What that buys is the tests, screenshots and recordings running against
   * the same browser the developer is looking at, with the same profile and
   * the same logged-in state.
   *
   * Chromium only. Firefox is launched through `web-ext`, which owns its own
   * remote-debugging plumbing, and Safari cannot be scripted this way at all.
   *
   * **This port is unauthenticated.** Anything that can reach it can drive
   * the browser and read what it can read, so it is bound to loopback and
   * left off unless asked for.
   */
  debugPort?: number;
}

export interface LaunchDevBrowserResult {
  launched: boolean;
  binary?: string;
  process?: ChildProcess;
  /** Set when `launched` is false — why, and what to do about it. */
  warning?: string;
  /** The CDP port actually passed to the browser, when one was. */
  debugPort?: number;
  /**
   * Set when the launch worked but something about it is worth saying —
   * a debug port asked for on a browser that cannot honour it, say. Distinct
   * from `warning`, which means nothing was launched at all.
   */
  notice?: string;
}

/**
 * Launch `browser` with the extension in `distDir` pre-installed. Never
 * throws — when no suitable binary is found (or the browser can't be
 * scripted, e.g. Safari), it returns `{ launched: false, warning }` so the
 * caller can fall back to the manual "load unpacked" instructions.
 */
export async function launchDevBrowser(
  options: LaunchDevBrowserOptions,
): Promise<LaunchDevBrowserResult> {
  const { browser, projectRoot, distDir, profileDir, binary, startUrls = [], debugPort } = options;

  if (browser === 'safari') {
    return {
      launched: false,
      warning:
        'Safari extensions cannot be auto-launched. Load the built extension via ' +
        'Xcode, or enable it under Safari > Settings > Extensions.',
    };
  }

  try {
    await mkdir(profileDir, { recursive: true });
  } catch (err) {
    return {
      launched: false,
      warning: `Failed to create profile directory at ${profileDir}: ${String(err)}`,
    };
  }

  if (browser === 'firefox') {
    const webExt = resolveWebExtBinary(projectRoot, binary);
    if (!webExt) {
      return {
        launched: false,
        warning:
          'web-ext not found (checked node_modules/.bin and PATH). Install it with ' +
          '`npm i -D web-ext` to enable --open for Firefox.',
      };
    }
    const args = [
      'run',
      '--source-dir',
      distDir,
      '--firefox-profile',
      profileDir,
      '--keep-profile-changes',
      '--no-input',
    ];
    const safeUrls = startUrls.filter((u) => !u.startsWith('-'));
    for (const url of safeUrls) args.push('--start-url', url);
    const { command, prefixArgs } = resolveWebExtSpawnTarget(projectRoot, webExt);
    try {
      const child = await new Promise<ChildProcess>((resolve, reject) => {
        const p = spawn(command, [...prefixArgs, ...args], { stdio: 'ignore' });
        p.once('spawn', () => resolve(p));
        p.once('error', reject);
      });
      return {
        launched: true,
        binary: webExt,
        process: child,
        // Not silently dropped: somebody who asked for a port is about to
        // try to connect to it, and "nothing is listening" is a much worse
        // message than this one.
        notice: debugPort
          ? 'debugPort is Chromium-only and was ignored: Firefox is launched through web-ext, ' +
            'which manages its own remote-debugging setup.'
          : undefined,
      };
    } catch (err) {
      return { launched: false, warning: `Failed to launch Firefox via web-ext: ${String(err)}` };
    }
  }

  const resolved = browser === 'edge' ? resolveEdgeBinary(binary) : resolveChromeBinary(binary);
  if (!resolved) {
    const label = browser === 'edge' ? 'Microsoft Edge' : 'Google Chrome';
    return {
      launched: false,
      warning: `No ${label} binary found. Set dev.browserBinary in extforge.config, or install ${label}.`,
    };
  }

  const safeUrls = startUrls.filter((u) => !u.startsWith('-'));
  const args = [
    `--load-extension=${distDir}`,
    `--disable-extensions-except=${distDir}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
  ];

  if (debugPort !== undefined) {
    args.push(`--remote-debugging-port=${debugPort}`);
    /*
     * Bound to loopback, always.
     *
     * The CDP endpoint has no authentication: whatever reaches it can drive
     * the browser, read every page in it and use whatever that profile is
     * logged into. Chromium defaults this to localhost, and saying so here
     * means the guarantee survives a future change of default rather than
     * resting on one.
     */
    args.push('--remote-debugging-address=127.0.0.1');
  }

  args.push(...safeUrls);
  try {
    const child = await new Promise<ChildProcess>((resolve, reject) => {
      const p = spawn(resolved, args, { stdio: 'ignore' });
      p.once('spawn', () => resolve(p));
      p.once('error', reject);
    });
    return { launched: true, binary: resolved, process: child, debugPort };
  } catch (err) {
    return { launched: false, warning: `Failed to launch ${browser}: ${String(err)}` };
  }
}
