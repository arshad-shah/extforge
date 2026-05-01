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

/**
 * Replace the contents of string literals and comment bodies with spaces of
 * equal length so the regex doesn't match chrome.* tokens inside them.
 * Newlines are preserved so that line/column math using the original source
 * stays accurate (lengths are identical).
 */
function stripStringsAndComments(source: string): string {
  let out = '';
  let i = 0;
  const len = source.length;
  while (i < len) {
    const ch = source[i]!;
    const next = source[i + 1];
    if (ch === '/' && next === '/') {
      // Line comment: keep '//' delimiter, blank out the rest of the line.
      out += '//';
      i += 2;
      while (i < len && source[i] !== '\n') { out += ' '; i++; }
      continue;
    }
    if (ch === '/' && next === '*') {
      out += '/*';
      i += 2;
      while (i < len && !(source[i] === '*' && source[i + 1] === '/')) {
        out += source[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (i < len) { out += '*/'; i += 2; }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      out += quote;
      i++;
      while (i < len && source[i] !== quote) {
        if (source[i] === '\\') { out += '  '; i += 2; continue; }
        out += source[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (i < len) { out += quote; i++; }
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

function lookupSupport(parts: string[]): ApiSupport | undefined {
  for (let n = parts.length; n >= 1; n--) {
    const key = parts.slice(0, n).join('.');
    if (COMPAT[key]) return COMPAT[key];
  }
  return undefined;
}

export function checkSourceCompat(input: CompatInput): CompatIssue[] {
  const { source, file, browsers } = input;
  // Parse suppressions from the original source (comments must be intact).
  const suppressed = parseSuppressions(source);
  const lines = source.split('\n');
  // Scan against the stripped source so string literals and comment bodies
  // are invisible to the regex. Lengths match the original, so offsets stay valid.
  const stripped = stripStringsAndComments(source);
  const issues: CompatIssue[] = [];
  // Reset regex state in case of reuse.
  API_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = API_RE.exec(stripped)) !== null) {
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
