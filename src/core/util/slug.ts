/**
 * Slugifier shared by `manifest/generator.ts` (Firefox addon-id derivation)
 * and `scaffold/index.ts` (npm package-name normalisation).
 *
 * Both call sites take an arbitrary user-supplied name and need to coerce
 * it into a `[a-z0-9._-]+` identifier suitable for the Firefox addon-id
 * grammar (and npm's package-name rules — same character class).
 *
 * Implementation goal: O(n), no regex backtracking. CodeQL's
 * polynomial-regex check flagged the previous `^-+|-+$` /  `-{2,}` chain
 * because it uses overlapping `+` quantifiers; this rewrite walks the
 * string once with index-based logic instead.
 */

const ALLOWED = /[a-z0-9._-]/;

/**
 * Lowercase the input, replace any run of disallowed characters with a
 * single `-`, collapse `-` runs to one, trim leading/trailing `-`.
 * Returns the fallback when nothing survives.
 */
export function slugify(input: string, fallback: string = 'extension'): string {
  const src = input.toLowerCase();
  let out = '';
  let prevDash = true; // leading: skip leading dashes
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (ALLOWED.test(ch)) {
      if (ch === '-') {
        // Collapse consecutive dashes (including dashes derived from the
        // replace-run-of-disallowed-chars path).
        if (prevDash) continue;
        prevDash = true;
        out += '-';
      } else {
        prevDash = false;
        out += ch;
      }
    } else {
      // Out-of-class char: emit a single `-` unless the previous emitted
      // char was already `-`.
      if (prevDash) continue;
      prevDash = true;
      out += '-';
    }
  }
  // Strip the trailing `-` if we ended on one.
  if (out.endsWith('-')) out = out.slice(0, -1);
  return out.length > 0 ? out : fallback;
}
