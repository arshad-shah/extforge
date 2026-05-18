import type { Check } from '../index.js';
import { loadExtForgeConfig } from '../../config.js';
import { checkSourceCompat } from '../../compat/index.js';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { walkSources } from '../../util/walk-sources.js';

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
      for (const file of walkSources(srcDir)) {
        try {
          total += checkSourceCompat({ source: readFileSync(file, 'utf8'), file, browsers }).length;
        } catch { /* skip unreadable file */ }
      }
      if (total === 0) return { name: 'compat', status: 'pass', message: 'No cross-browser compat issues' };
      return { name: 'compat', status: 'warn', message: `${total} compat issue(s) — run \`extforge build\` for details` };
    } catch { return { name: 'compat', status: 'info', message: 'Skipped' }; }
  },
};
