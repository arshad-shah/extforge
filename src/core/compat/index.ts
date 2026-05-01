import { createRequire } from 'node:module';
import { parseSuppressions } from './suppressions.js';

// data.json is loaded via createRequire so the module works under
// "moduleResolution: bundler" without import-attribute support.
const require = createRequire(import.meta.url);
const COMPAT = require('./data.json') as Record<string, ApiSupport>;

interface ApiSupport {
  chrome?: string | false;
  firefox?: string | false;
  edge?: string | false;
  safari?: string | false;
}

export interface CompatIssue {
  file: string;
  line: number;
  column: number;
  api: string;
  supported: string[];
  unsupported: string[];
}

export interface CompatInput {
  source: string;
  file: string;
  browsers: ReadonlyArray<'chrome' | 'firefox' | 'edge' | 'safari'>;
}

const API_RE = /\b(chrome|browser)\.([A-Za-z_$][\w$]*)(?:\.([A-Za-z_$][\w$]*))?(?:\.([A-Za-z_$][\w$]*))?/g;

function lookupSupport(parts: string[]): ApiSupport | undefined {
  for (let n = parts.length; n >= 1; n--) {
    const key = parts.slice(0, n).join('.');
    if (COMPAT[key]) return COMPAT[key];
  }
  return undefined;
}

export function checkSourceCompat(input: CompatInput): CompatIssue[] {
  const { source, file, browsers } = input;
  const suppressed = parseSuppressions(source);
  const lines = source.split('\n');
  const issues: CompatIssue[] = [];
  // Reset regex state in case of reuse.
  API_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = API_RE.exec(source)) !== null) {
    const a = m[2], b = m[3], c = m[4];
    const apiPath = [a, b, c].filter(Boolean) as string[];
    if (apiPath.length === 0) continue;
    const support = lookupSupport(apiPath);
    if (!support) continue;
    const unsupported = browsers.filter(br => support[br] === false);
    if (unsupported.length === 0) continue;

    let offset = 0, line = 1, col = 1;
    for (let i = 0; i < lines.length; i++) {
      const len = (lines[i] ?? '').length + 1;
      if (offset + len > m.index) { line = i + 1; col = m.index - offset + 1; break; }
      offset += len;
    }
    if (suppressed.has(line)) continue;

    issues.push({
      file, line, column: col,
      api: apiPath.join('.'),
      supported: browsers.filter(br => support[br] !== false),
      unsupported,
    });
  }
  return issues;
}
