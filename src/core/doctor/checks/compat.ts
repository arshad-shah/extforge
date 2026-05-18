import type { Check } from '../index.js';
import { loadExtForgeConfig } from '../../config.js';
import { checkSourceCompat } from '../../compat/index.js';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', '.cache']);
const MAX_FILES = 2000;

function walkSource(root: string, limit: number = MAX_FILES): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length && out.length < limit) {
    const dir = stack.pop()!;
    let entries: import('node:fs').Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch { continue; }
    for (const ent of entries) {
      if (out.length >= limit) break;
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        if (!SKIP_DIRS.has(ent.name)) stack.push(full);
        continue;
      }
      if (!ent.isFile()) continue;
      const dot = ent.name.lastIndexOf('.');
      const ext = dot >= 0 ? ent.name.slice(dot) : '';
      if (SOURCE_EXTS.has(ext)) out.push(full);
    }
  }
  return out;
}

export const compatCheck: Check = {
  name: 'compat',
  async run({ cwd }) {
    try {
      const cfg = await loadExtForgeConfig(cwd);
      const browsers = (cfg.browsers ?? ['chrome']) as ReadonlyArray<'chrome' | 'firefox' | 'edge' | 'safari'>;
      const srcDir = resolve(cwd, cfg.build?.srcDir ?? 'src');
      if (!existsSync(srcDir)) return { name: 'compat', status: 'pass', message: 'No source directory to scan' };
      try { if (!statSync(srcDir).isDirectory()) return { name: 'compat', status: 'pass', message: 'No source directory to scan' }; }
      catch { return { name: 'compat', status: 'pass', message: 'No source directory to scan' }; }

      let total = 0;
      for (const file of walkSource(srcDir)) {
        try {
          total += checkSourceCompat({ source: readFileSync(file, 'utf8'), file, browsers }).length;
        } catch { /* skip unreadable file */ }
      }
      if (total === 0) return { name: 'compat', status: 'pass', message: 'No cross-browser compat issues' };
      return { name: 'compat', status: 'warn', message: `${total} compat issue(s) — run \`extforge build\` for details` };
    } catch { return { name: 'compat', status: 'info', message: 'Skipped' }; }
  },
};
