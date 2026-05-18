import { parseSuppressions } from './suppressions.js';
import { stripSource } from '../util/strip-source.js';
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
  // Scan against the stripped source so string literals, comment bodies, and
  // regex literals are invisible to the regex. Lengths match the original,
  // so offsets stay valid.
  const stripped = stripSource(source);
  const issues: CompatIssue[] = [];
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
