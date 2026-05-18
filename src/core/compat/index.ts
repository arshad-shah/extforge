import { parseSuppressions } from './suppressions.js';
// Inlined at build time by esbuild's `json` loader so the module survives
// code-splitting (a top-level chunk has no sibling data.json).
import compatJson from './data.json';
const COMPAT = compatJson as Record<string, ApiSupport>;

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

// Match `chrome.foo.bar.baz`, `chrome?.foo.bar`, and `chrome.foo?.bar` —
// optional-chaining `?.` is now common in user code. Bracket access
// (`chrome['foo']`) is intentionally not matched because the key is often
// dynamic and a static lookup wouldn't be sound.
const API_RE = /\b(chrome|browser)\??\.([A-Za-z_$][\w$]*)(?:\??\.([A-Za-z_$][\w$]*))?(?:\??\.([A-Za-z_$][\w$]*))?/g;

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
  // Track whether a `/` here can start a regex literal. JS distinguishes
  // `/foo/` (regex) from `x / foo` (division) by lookbehind for "what kind
  // of token came last". Tracking a single bit — "expression position OK" —
  // covers the common cases without a full parser; standalone files
  // start in regex-expected mode.
  let regexAllowed = true;
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
    if (ch === '/' && regexAllowed) {
      // Regex literal: walk to the closing '/' on the same line, respecting
      // character classes ([...]) and escapes. Blank out the body so any
      // `chrome.*` token inside (e.g. /chrome\.tabs/) is invisible to the
      // API regex.
      out += '/';
      i++;
      let inClass = false;
      while (i < len && source[i] !== '\n') {
        const c = source[i]!;
        if (c === '\\' && i + 1 < len) { out += '  '; i += 2; continue; }
        if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) break;
        out += ' ';
        i++;
      }
      if (i < len && source[i] === '/') { out += '/'; i++; }
      // Skip regex flags (g, i, m, s, u, y, d) so they don't look like
      // an identifier that flips regexAllowed.
      while (i < len && /[gimsuyd]/.test(source[i]!)) { out += source[i]!; i++; }
      regexAllowed = false;
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
      regexAllowed = false;
      continue;
    }
    // Single-char heuristic: after an identifier, number, or closing
    // delimiter, a `/` means division. After an operator / whitespace /
    // opening delimiter, a `/` starts a regex.
    if (/[A-Za-z0-9_$\])]/.test(ch)) regexAllowed = false;
    else if (/[\s({[,;=!&|+\-*%<>?:^~]/.test(ch)) regexAllowed = true;
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
