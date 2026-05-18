import type { Check } from '../index.js';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// `dist`, `dist/`, `/dist`, `**/dist`, `dist/*`, `dist/**` — any of these
// excludes the build output. Comments after `#` on the same line and the
// optional negation `!` are stripped/ignored to match how git resolves
// patterns.
const DIST_PATTERNS = new Set([
  'dist', 'dist/', '/dist', '/dist/', '**/dist', '**/dist/',
  'dist/*', 'dist/**', '/dist/*', '/dist/**',
]);

export const distGitignoredCheck: Check = {
  name: 'dist-gitignored',
  async run({ cwd }) {
    const gi = join(cwd, '.gitignore');
    if (!existsSync(gi)) return { name: 'dist-gitignored', status: 'info', message: 'No .gitignore (skipping)' };
    // Strip a leading UTF-8 BOM (U+FEFF) if present so the first pattern
    // line parses cleanly.
    const raw = readFileSync(gi, 'utf8').replace(/^\uFEFF/, '');
    const lines = raw.split(/\r?\n/).map((l) => {
      // Drop comments and surrounding whitespace; ignore negations because
      // a positive match elsewhere would still suffice.
      const hash = l.indexOf('#');
      const trimmed = (hash === -1 ? l : l.slice(0, hash)).trim();
      return trimmed.startsWith('!') ? trimmed.slice(1) : trimmed;
    });
    if (lines.some((l) => DIST_PATTERNS.has(l))) {
      return { name: 'dist-gitignored', status: 'pass', message: 'dist/ is gitignored' };
    }
    return { name: 'dist-gitignored', status: 'warn', message: 'dist/ is not in .gitignore', hint: 'Add `dist/` to .gitignore.' };
  },
};
