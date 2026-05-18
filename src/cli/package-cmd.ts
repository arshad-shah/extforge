/**
 * `extforge package` helpers — extracted so we can unit-test the filename
 * sanitisation and prove no path component reaches a shell unescaped.
 */

import { spawnSync } from 'node:child_process';
import type { Logger } from '../core/logger/index.js';

const SAFE_FILENAME_RE = /[^a-zA-Z0-9._-]/g;

/**
 * Produce a safe archive filename for a single browser. Shell metacharacters,
 * path separators, and whitespace in `name`/`version` are replaced with `_`
 * so the result is safe to use as a filesystem path even if the manifest
 * config is malicious or weirdly punctuated.
 */
export function archiveFilename(
  name: string | undefined,
  version: string | undefined,
  browser: string,
): string {
  const safeName = (name ?? 'extension').replace(SAFE_FILENAME_RE, '_');
  const safeVersion = (version ?? '0.0.0').replace(SAFE_FILENAME_RE, '_');
  const safeBrowser = browser.replace(SAFE_FILENAME_RE, '_');
  return `${safeName}-${safeBrowser}-v${safeVersion}.zip`;
}

export interface PackageBrowserOptions {
  /** Absolute path to the per-browser build output (e.g. dist/chrome). */
  dist: string;
  /** Absolute path of the archive to create. */
  archive: string;
  log: Logger;
}

/**
 * Zip the contents of `dist` into `archive`. Uses `spawnSync` with an argv
 * array — no shell — so neither `dist` nor `archive` can be interpreted as
 * a shell command, regardless of metacharacters in the path.
 */
export async function packageBrowser(opts: PackageBrowserOptions): Promise<void> {
  const { dist, archive, log } = opts;
  // `-r .` zips the directory contents rather than a top-level `./` prefix.
  const result = spawnSync('zip', ['-r', archive, '.'], {
    cwd: dist,
    stdio: 'pipe',
    shell: false,
  });
  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      log.error('The `zip` command was not found. Install it (e.g. apt-get install zip) or use a JS-based packager.');
      throw result.error;
    }
    throw result.error;
  }
  if (result.status !== 0) {
    const stderr = result.stderr?.toString() ?? '';
    throw new Error(`zip exited with status ${result.status}: ${stderr.trim()}`);
  }
}
