import type { Check } from '../index.js';
import { loadExtForgeConfig } from '../../config.js';
import { checkSourceCompat } from '../../compat/index.js';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path/posix';

const CANDIDATES = ['src/background.ts', 'src/content.ts', 'src/popup.ts', 'src/sidepanel.ts'];

export const compatCheck: Check = {
  name: 'compat',
  async run({ cwd }) {
    try {
      const cfg = await loadExtForgeConfig(cwd);
      const browsers = (cfg.browsers ?? ['chrome']) as ReadonlyArray<'chrome' | 'firefox' | 'edge' | 'safari'>;
      let total = 0;
      for (const rel of CANDIDATES) {
        const f = join(cwd, rel);
        if (!existsSync(f)) continue;
        total += checkSourceCompat({ source: readFileSync(f, 'utf8'), file: f, browsers }).length;
      }
      if (total === 0) return { name: 'compat', status: 'pass', message: 'No cross-browser compat issues' };
      return { name: 'compat', status: 'warn', message: `${total} compat issue(s) — run \`extforge build\` for details` };
    } catch { return { name: 'compat', status: 'info', message: 'Skipped' }; }
  },
};
