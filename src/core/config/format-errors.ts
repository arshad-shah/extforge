import type { ZodError } from 'zod';
import { ExtForgeError } from '../errors/index.js';

const SUGGESTIONS: Record<string, (received: unknown) => string | undefined> = {
  'browsers.*': (v) => {
    if (typeof v !== 'string') return undefined;
    const known = ['chrome', 'firefox', 'edge', 'safari'];
    const lower = v.toLowerCase();
    if (lower === 'brave' || lower === 'opera' || lower === 'vivaldi')
      return `${v} is Chromium-based; use "chrome" and load dist/chrome/.`;
    const close = known.find(k => k.startsWith(lower[0] ?? '') || lower.includes(k.slice(0, 3)));
    return close ? `did you mean "${close}"?` : `expected one of ${known.join(', ')}`;
  },
};

function pathPattern(path: (string | number)[]): string {
  return path.map(p => (typeof p === 'number' ? '*' : p)).join('.');
}

export function formatZodError(err: ZodError, file?: string): ExtForgeError {
  const lines: string[] = [];
  for (const issue of err.issues) {
    const path = issue.path.join('.') || '<root>';
    const received = (issue as { received?: unknown }).received;
    const expectedField = (issue as { expected?: unknown }).expected ?? issue.code;
    const suggestion = SUGGESTIONS[pathPattern(issue.path)]?.(received);
    lines.push(`  ${path}`);
    lines.push(`    expected: ${String(expectedField)}`);
    if (received !== undefined) lines.push(`    received: ${JSON.stringify(received)}`);
    if (suggestion) lines.push(`    suggestion: ${suggestion}`);
  }
  return new ExtForgeError({
    code: 'EXT_CONFIG_INVALID',
    message: `extforge.config is invalid:\n${lines.join('\n')}`,
    file,
    hint: 'Fix the fields above and re-run.',
    cause: err,
  });
}
