/**
 * Length-preserving source-code stripper.
 *
 * Replaces the bodies of comments, string literals, template literals, and
 * regex literals with spaces (newlines kept) so a downstream regex scan
 * for things like `chrome.foo.bar` or `defineCSUI({...})` doesn't
 * false-match tokens nested inside those forms. Output length matches
 * input length, so offsets computed against the stripped string map back
 * to the original.
 *
 * This is not a real tokenizer — it tracks a single "regex-allowed"
 * bit to distinguish `/foo/` (regex) from `x / foo` (division), which
 * handles the common cases without dragging in a parser dependency.
 *
 * Both `core/compat` (chrome.* compatibility scan) and
 * `core/csui/discovery` (defineCSUI options extraction) use this.
 */
export function stripSource(source: string): string {
  let out = '';
  let i = 0;
  const len = source.length;
  // After an identifier, number, or closing delimiter, a `/` means
  // division. After an operator / whitespace / opening delimiter, a `/`
  // starts a regex. Files start in expression position.
  let regexAllowed = true;
  while (i < len) {
    const ch = source[i]!;
    const next = source[i + 1];
    if (ch === '/' && next === '/') {
      // Line comment.
      out += '//';
      i += 2;
      while (i < len && source[i] !== '\n') { out += ' '; i++; }
      continue;
    }
    if (ch === '/' && next === '*') {
      // Block comment.
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
      // Regex literal — walk to the closing `/` on the same line,
      // respecting character classes and escapes.
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
      while (i < len && /[gimsuyd]/.test(source[i]!)) { out += source[i]!; i++; }
      regexAllowed = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      // String / template literal.
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
    if (/[A-Za-z0-9_$\])]/.test(ch)) regexAllowed = false;
    else if (/[\s({[,;=!&|+\-*%<>?:^~]/.test(ch)) regexAllowed = true;
    out += ch;
    i++;
  }
  return out;
}
