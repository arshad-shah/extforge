/**
 * Recursively collect TypeScript/JavaScript source files under a
 * directory, skipping dependencies, build outputs, and other
 * non-source directories. Used by:
 *   - `core/builder/index.ts`'s pre-build compat scan,
 *   - `core/doctor/checks/compat.ts`'s standalone health check.
 *
 * Both used to carry their own copy of this walker; centralising it
 * keeps the ignored-dirs list and the cap consistent.
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', '.cache']);
const MAX_FILES = 2000;

export interface WalkSourcesOptions {
  /** Override the default ignored directory names. */
  skipDirs?: ReadonlySet<string>;
  /** Override the default set of recognised source-file extensions. */
  exts?: ReadonlySet<string>;
  /** Hard cap on the number of files returned. Default 2000. */
  limit?: number;
}

export function walkSources(root: string, opts: WalkSourcesOptions = {}): string[] {
  const exts = opts.exts ?? SOURCE_EXTS;
  const skip = opts.skipDirs ?? SKIP_DIRS;
  const limit = opts.limit ?? MAX_FILES;

  const out: string[] = [];
  const stack = [root];
  while (stack.length && out.length < limit) {
    const dir = stack.pop()!;
    let entries: import('node:fs').Dirent[];
    try { entries = readdirSync(dir, { withFileTypes: true }); }
    catch { continue; }
    for (const ent of entries) {
      if (out.length >= limit) break;
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        if (!skip.has(ent.name)) stack.push(full);
        continue;
      }
      if (!ent.isFile()) continue;
      const dot = ent.name.lastIndexOf('.');
      const ext = dot >= 0 ? ent.name.slice(dot) : '';
      if (exts.has(ext)) out.push(full);
    }
  }
  return out;
}
