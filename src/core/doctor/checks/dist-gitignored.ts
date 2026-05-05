import type { Check } from '../index.js';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path/posix';

export const distGitignoredCheck: Check = {
  name: 'dist-gitignored',
  async run({ cwd }) {
    const gi = join(cwd, '.gitignore');
    if (!existsSync(gi)) return { name: 'dist-gitignored', status: 'info', message: 'No .gitignore (skipping)' };
    const lines = readFileSync(gi, 'utf8').split('\n').map(l => l.trim());
    if (lines.some(l => l === 'dist' || l === 'dist/' || l === '/dist')) {
      return { name: 'dist-gitignored', status: 'pass', message: 'dist/ is gitignored' };
    }
    return { name: 'dist-gitignored', status: 'warn', message: 'dist/ is not in .gitignore', hint: 'Add `dist/` to .gitignore.' };
  },
};
