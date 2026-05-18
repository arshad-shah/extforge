/**
 * `extforge package` helpers — extracted so we can unit-test the filename
 * sanitisation and prove no path component reaches a shell unescaped.
 */

import { spawnSync } from 'node:child_process';
import type { Logger } from '../core/logger/index.js';
import { writeZip } from './zip-writer.js';

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
  /**
   * Force a specific implementation. Defaults to `'auto'` — try the
   * system `zip` first, fall back to the pure-JS writer when the binary
   * isn't installed. Tests can pin this to `'js'` to get
   * platform-independent behaviour.
   */
  impl?: 'auto' | 'system' | 'js';
}

/**
 * Zip the contents of `dist` into `archive`. Prefers the system `zip`
 * binary (faster, well-tested); falls back to a pure-Node implementation
 * when it's not present (typical on Windows). Both paths use `spawnSync`
 * with argv arrays — no shell — so paths with metacharacters can't be
 * interpreted as shell commands regardless of impl.
 */
export async function packageBrowser(opts: PackageBrowserOptions): Promise<void> {
  const { dist, archive, log, impl = 'auto' } = opts;

  if (impl === 'js') {
    writeZip(dist, archive);
    return;
  }

  // `-r .` zips the directory contents rather than a top-level `./` prefix.
  // -X strips OS-specific extra fields so the output is reproducible
  // enough for CI artefact diffing.
  const result = spawnSync('zip', ['-rX', archive, '.'], {
    cwd: dist,
    stdio: 'pipe',
    shell: false,
  });
  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      if (impl === 'system') {
        log.error('The `zip` command was not found. Install it (e.g. apt-get install zip).');
        throw result.error;
      }
      log.debug('zip binary not found — using pure-JS writer');
      writeZip(dist, archive);
      return;
    }
    throw result.error;
  }
  if (result.status !== 0) {
    const stderr = result.stderr?.toString() ?? '';
    throw new Error(`zip exited with status ${result.status}: ${stderr.trim()}`);
  }
}
