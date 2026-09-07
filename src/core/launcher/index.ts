/**
 * Dev-server browser launcher.
 *
 * Resolves a local Chrome, Edge or Firefox binary and launches it with the
 * freshly built extension already installed, using a persistent profile
 * directory so logins, devtools layout and pinned toolbar position survive a
 * `dev` restart.
 *
 * Installing is done over each browser's own debugging protocol rather than
 * with a command-line switch, because the switch no longer exists on one and
 * never existed on the other:
 *
 * - **Chromium** — `Extensions.loadUnpacked` over a CDP pipe. Chrome 137
 *   removed `--load-extension` from branded builds, where it is now accepted
 *   and silently ignored: a browser opens looking perfectly normal with no
 *   extension in it. The old switch remains as a fallback for Chrome 125 and
 *   older, which have no `Extensions.loadUnpacked`.
 * - **Firefox** — `installTemporaryAddon` over RDP. There has never been a
 *   flag for this; a temporary add-on is also the only kind that can be
 *   unsigned.
 *
 * Both are what `web-ext` does. Doing it here rather than shelling out to it
 * means `dev --open` works with no extra dependency to install.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import type { Browser } from '../manifest/index.js';
import { CDP_PIPE_STDIO, CdpPipe, isUnknownCdpMethod } from './cdp-pipe.js';
import { FIREFOX_DEV_PREFS, FirefoxBidi, renderUserJs } from './firefox-bidi.js';

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

const FIREFOX_LINUX_NAMES = ['firefox', 'firefox-esr', 'firefox-developer-edition'];
const FIREFOX_MAC_PATHS = [
  '/Applications/Firefox.app/Contents/MacOS/firefox',
  '/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox',
];
const FIREFOX_WIN_PATHS = [
  'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
  'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe',
];

/** Resolve a local Firefox binary, or undefined if none is found. */
export function resolveFirefoxBinary(override?: string): string | undefined {
  if (override) return existsSync(override) ? override : undefined;
  if (process.platform === 'darwin') return firstExisting(FIREFOX_MAC_PATHS);
  if (process.platform === 'win32') return firstExisting(FIREFOX_WIN_PATHS);
  return findOnPath(FIREFOX_LINUX_NAMES);
}

/**
 * An unused loopback port.
 *
 * Asked of the OS rather than picked, because a hardcoded one collides the
 * moment two projects run `dev` at once — and the collision surfaces as a
 * browser that will not accept the add-on, which reads as this feature being
 * broken rather than as a busy port.
 */
async function freePort(): Promise<number> {
  const { createServer } = await import('node:net');
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
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

export interface LaunchDevBrowserOptions {
  browser: Browser;
  /** Project root. Reserved for resolving project-local tooling. */
  projectRoot: string;
  /** Directory containing the built, unpacked extension (`dist/<browser>`). */
  distDir: string;
  /** Persistent profile directory, created if it doesn't exist. */
  profileDir: string;
  /** Override the auto-detected browser binary. */
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
   * The id the browser gave the installed extension.
   *
   * Reported because "the browser opened" is not the same claim as "the
   * extension is in it", and for months the two looked identical from
   * outside. An id is the browser confirming it took the thing.
   */
  installedId?: string;
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
    const firefox = resolveFirefoxBinary(binary);
    if (!firefox) {
      return {
        launched: false,
        warning:
          'No Firefox binary found. Set dev.browserBinary in extforge.config, or install Firefox.',
      };
    }

    /*
     * Firefox loads an unsigned add-on exactly one way: over a debugging
     * connection, as a *temporary* add-on. There is no command-line switch
     * for it.
     *
     * It has two debugging servers and only one of them still works.
     * `-start-debugger-server` — the devtools RDP server, and what `web-ext`
     * drives — is still listed in Firefox 155's `--help` and its port never
     * opens, with or without `devtools.debugger.remote-enabled`. Anything
     * built on it fails silently, which is the same trap as Chrome's
     * `--load-extension`. The Remote Agent speaks WebDriver BiDi and has
     * `webExtension.install`, so that is what this uses.
     *
     * The preferences go in before launch: a fresh profile otherwise stops
     * to ask about the default browser and show an onboarding tour, in a
     * window nobody is sitting in front of.
     */
    try {
      await writeFile(join(profileDir, 'user.js'), renderUserJs(FIREFOX_DEV_PREFS), 'utf8');
    } catch (err) {
      return {
        launched: false,
        warning: `Could not write Firefox preferences into ${profileDir}: ${String(err)}`,
      };
    }

    // Its own port, distinct from `debugPort`: that one is CDP and Chromium's.
    const agentPort = await freePort();
    const args = [
      '--remote-debugging-port',
      String(agentPort),
      '-profile',
      profileDir,
      // A new instance, rather than handing the URLs to a Firefox already
      // running on somebody's real profile.
      '-no-remote',
      ...startUrls.filter((u) => !u.startsWith('-')),
    ];

    try {
      const child = await new Promise<ChildProcess>((resolve, reject) => {
        const p = spawn(firefox, args, { stdio: 'ignore' });
        p.once('spawn', () => resolve(p));
        p.once('error', reject);
      });
      const bidi = await FirefoxBidi.connect(
        agentPort,
        30_000,
        () => child.exitCode !== null || child.signalCode !== null,
      );
      let installedId: string | undefined;
      try {
        installedId = await bidi.installAddon(distDir);
      } finally {
        bidi.close();
      }
      return {
        launched: true,
        binary: firefox,
        process: child,
        installedId,
        notice: debugPort
          ? 'debugPort is a Chromium option and was ignored: Firefox speaks its own debugging ' +
            'protocol, not CDP.'
          : undefined,
      };
    } catch (err) {
      return { launched: false, warning: `Failed to launch Firefox: ${String(err)}` };
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

  /**
   * Builds the command line. `legacy` is the Chrome-125-and-older path.
   */
  const buildArgs = (legacy: boolean): string[] => {
    const out = [`--user-data-dir=${profileDir}`, '--no-first-run', '--no-default-browser-check'];
    if (legacy) {
      out.push(`--load-extension=${distDir}`, `--disable-extensions-except=${distDir}`);
    } else {
      // The pipe carries `Extensions.loadUnpacked`; the switch is what makes
      // Chrome accept it. Neither opens a network port.
      out.push('--remote-debugging-pipe', '--enable-unsafe-extension-debugging');
      /*
       * Otherwise every site sees the developer as a bot.
       *
       * `--remote-debugging-pipe` sets `navigator.webdriver = true`, and
       * plenty of sites change what they serve — or refuse to serve at all —
       * when they see it. That is a bad trade for a tool whose whole purpose
       * is inspecting real pages: the browser would be quietly showing you a
       * different site from the one your users get.
       *
       * `web-ext` does the same.
       */
      out.push('--disable-blink-features=AutomationControlled');
    }
    if (debugPort !== undefined) {
      out.push(`--remote-debugging-port=${debugPort}`);
      /*
       * Bound to loopback, always.
       *
       * The port has no authentication: whatever reaches it can drive the
       * browser, read every page in it and use whatever that profile is
       * logged into. Chromium defaults this to localhost, and saying so
       * means the guarantee survives a change of default.
       */
      out.push('--remote-debugging-address=127.0.0.1');
    }
    out.push(...safeUrls);
    return out;
  };

  const spawnBrowser = (args: string[], legacy: boolean): Promise<ChildProcess> =>
    new Promise((resolve, reject) => {
      const p = spawn(resolved, args, {
        // fds 3 and 4 are the CDP pipe. The legacy path needs neither.
        stdio: legacy ? 'ignore' : [...CDP_PIPE_STDIO],
      });
      p.once('spawn', () => resolve(p));
      p.once('error', reject);
    });

  /*
   * Install over CDP, and fall back only where that is not available.
   *
   * `--load-extension` was removed from branded Chrome in 137. It is still
   * accepted and simply ignored, so the failure is a browser that opens
   * looking perfectly normal with no extension in it — which is why this
   * tries the modern path first and treats the old flag as the exception.
   */
  try {
    const child = await spawnBrowser(buildArgs(false), false);
    const cdp = new CdpPipe(child);
    try {
      const result = (await cdp.send('Extensions.loadUnpacked', { path: distDir })) as {
        id?: string;
      } | null;
      cdp.close();
      return {
        launched: true,
        binary: resolved,
        process: child,
        debugPort,
        installedId: result?.id,
      };
    } catch (err) {
      cdp.close();
      if (!isUnknownCdpMethod(err)) {
        child.kill();
        return {
          launched: false,
          warning: `Failed to install the extension over CDP: ${String(err)}`,
        };
      }
      // Chrome 125 or older: no `Extensions.loadUnpacked`, but `--load-extension`
      // still works there. Relaunch with it.
      child.kill();
      const legacyChild = await spawnBrowser(buildArgs(true), true);
      return { launched: true, binary: resolved, process: legacyChild, debugPort };
    }
  } catch (err) {
    return { launched: false, warning: `Failed to launch ${browser}: ${String(err)}` };
  }
}
