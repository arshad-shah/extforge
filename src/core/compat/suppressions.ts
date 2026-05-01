// Returns the set of 1-indexed line numbers that are suppressed.
// Suppression syntax: a comment line containing
//   // extforge-ignore-compat: <reason>
// suppresses the next non-blank, non-comment line. A bare
//   // extforge-ignore-compat
// without a reason is ignored (still warns).

export function parseSuppressions(source: string): Set<number> {
  const lines = source.split('\n');
  const suppressed = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    const m = /\/\/\s*extforge-ignore-compat\s*:\s*\S/.exec(lines[i] ?? '');
    if (!m) continue;
    for (let j = i + 1; j < lines.length; j++) {
      const t = (lines[j] ?? '').trim();
      if (!t || t.startsWith('//')) continue;
      suppressed.add(j + 1);
      break;
    }
  }
  return suppressed;
}
