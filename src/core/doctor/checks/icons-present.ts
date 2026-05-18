import type { Check } from '../index.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const REQUIRED = [16, 32, 48, 128];

export const iconsPresentCheck: Check = {
  name: 'icons-present',
  async run({ cwd }) {
    const missing = REQUIRED.filter(s => !existsSync(join(cwd, `icons/icon-${s}.png`)));
    if (missing.length === 0) return { name: 'icons-present', status: 'pass', message: 'All required icons present' };
    return {
      name: 'icons-present',
      status: 'warn',
      message: `Missing: ${missing.map(s => `icon-${s}.png`).join(', ')}`,
      hint: 'Add the icons or run `extforge icons`.',
    };
  },
};
