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
  if (process.platform === 'win32')
    return firstExisting(EDGE_WIN_PATHS) ?? findOnPath(['msedge']);
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
}

export interface LaunchDevBrowserResult {
  launched: boolean;
  binary?: string;
  process?: ChildProcess;
  /** Set when `launched` is false — why, and what to do about it. */
  warning?: string;
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
  const { browser, projectRoot, distDir, profileDir, binary, startUrls = [] } = options;
  await mkdir(profileDir, { recursive: true });

  if (browser === 'safari') {
    return {
      launched: false,
      warning:
        'Safari extensions cannot be auto-launched. Load the built extension via ' +
        'Xcode, or enable it under Safari > Settings > Extensions.',
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
    for (const url of startUrls) args.push('--start-url', url);
    try {
      const child = await new Promise<ChildProcess>((resolve, reject) => {
        const p = spawn(webExt, args, { stdio: 'ignore' });
        p.once('spawn', () => resolve(p));
        p.once('error', reject);
      });
      return { launched: true, binary: webExt, process: child };
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
    ...safeUrls,
  ];
  try {
    const child = await new Promise<ChildProcess>((resolve, reject) => {
      const p = spawn(resolved, args, { stdio: 'ignore' });
      p.once('spawn', () => resolve(p));
      p.once('error', reject);
    });
    return { launched: true, binary: resolved, process: child };
  } catch (err) {
    return { launched: false, warning: `Failed to launch ${browser}: ${String(err)}` };
  }
}
