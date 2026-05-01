import type { Check } from '../index.js';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'pathe';

const RECOMMENDED = ['dev', 'build', 'package'];

export const scriptsPresentCheck: Check = {
  name: 'scripts-present',
  async run({ cwd }) {
    const pj = join(cwd, 'package.json');
    if (!existsSync(pj)) return { name: 'scripts-present', status: 'info', message: 'No package.json (skipped)' };
    const scripts = JSON.parse(readFileSync(pj, 'utf8')).scripts ?? {};
    const missing = RECOMMENDED.filter(s => !scripts[s]);
    if (missing.length === 0) return { name: 'scripts-present', status: 'pass', message: 'Recommended scripts present' };
    return { name: 'scripts-present', status: 'info', message: `Missing scripts: ${missing.join(', ')}` };
  },
};
