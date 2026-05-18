/**
 * Build-time CSUI discovery.
 *
 * Scans `src/contents/*.csui.{ts,tsx}` and returns metadata the builder uses
 * to:
 *   1. Add each file as a content-script IIFE entry.
 *   2. Auto-augment the manifest's `content_scripts` array with one entry
 *      per descriptor, keyed by the static `matches` array.
 *
 * Static matches extraction: this is a regex-based scan that matches the
 * top-level `defineCSUI({ matches: [...] })` call. It deliberately avoids
 * a full AST parse (no @babel/parser, no ts-morph) — keeps the dep tree thin
 * and the discovery fast. If a user does anything dynamic, they can declare
 * matches in extforge.config.ts as a fallback.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

export interface CSUIDiscovery {
  /** Absolute path to the source file. */
  file: string;
  /** Entry key used by esbuild — also where the build emits the chunk. */
  entryKey: string;
  /** Output JS path relative to the per-browser dist root. */
  outputJsPath: string;
  /** `matches:` array statically extracted, if any. */
  matches?: string[];
  /** `runAt:` value statically extracted, if any. */
  runAt?: 'document_start' | 'document_end' | 'document_idle';
}

const CSUI_DIR = 'contents';
const CSUI_SUFFIX = /\.csui\.(?:ts|tsx)$/;

/**
 * Walk `src/contents/` (one level — no recursion) and return discovery info
 * for every `*.csui.{ts,tsx}`. Returns `[]` if the directory doesn't exist.
 *
 * If two files share the same entryKey (e.g. `widget.csui.ts` and
 * `widget.csui.tsx`), the first one wins (lexicographic order — `.ts`
 * before `.tsx`) and the duplicate is dropped silently to avoid emitting
 * two manifest entries that point at the same output JS, which would
 * make Chrome run the content script twice.
 */
export function discoverCSUI(srcDir: string): CSUIDiscovery[] {
  const dir = join(srcDir, CSUI_DIR);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];

  const out: CSUIDiscovery[] = [];
  const seen = new Set<string>();
  // Sort so the resolution is stable across platforms (readdir order varies).
  const names = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .sort();

  for (const name of names) {
    const m = CSUI_SUFFIX.exec(name);
    if (!m) continue;
    const file = join(dir, name);
    const baseName = basename(name).replace(CSUI_SUFFIX, '');
    const entryKey = `contents/${baseName}`;
    if (seen.has(entryKey)) continue;
    seen.add(entryKey);
    const outputJsPath = `${entryKey}.js`;

    const source = readFileSync(file, 'utf8');
    out.push({
      file,
      entryKey,
      outputJsPath,
      matches: extractMatches(source),
      runAt: extractRunAt(source),
    });
  }
  return out;
}

/**
 * Extract a string array literal assigned to `matches:` inside the outer
 * options object passed to `defineCSUI({ ... }, render)`. Tolerant of
 * comments, trailing commas, and the source order of keys. Crucially: only
 * matches the `matches:` at the OUTER brace depth, so a nested object like
 * `{ routerMap: { matches: [...] }, matches: [...] }` resolves to the outer
 * array (the actual manifest matches), not the inner one.
 *
 * Falls back to `undefined` (caller should warn / require a fallback) when
 * extraction fails.
 */
export function extractMatches(source: string): string[] | undefined {
  const stripped = stripStringsAndComments(source);

  // Locate the *call site*: `defineCSUI` followed (after optional whitespace)
  // by `(`. Skips earlier hits like `import { defineCSUI }` where the next
  // token is `}` instead of `(`.
  const callRe = /\bdefineCSUI\s*\(/g;
  const callMatch = callRe.exec(stripped);
  if (!callMatch) return undefined;
  let i = callMatch.index + callMatch[0].length;
  while (i < stripped.length && /\s/.test(stripped[i]!)) i++;
  if (stripped[i] !== '{') return undefined;
  const optsStart = i;

  // Walk the options literal balancing braces (and brackets/parens for
  // safety) and record the offsets of `matches:` keys that appear at
  // brace depth 1 (the top level of the options object).
  let depth = 0;
  let outerMatchesArrStart = -1;
  for (; i < stripped.length; i++) {
    const c = stripped[i]!;
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) break; }
    else if (depth === 1) {
      // Look for `matches` as a key token: preceded by `{` or `,` (skipping
      // whitespace) and followed by `:`.
      if (c === 'm' && stripped.startsWith('matches', i)) {
        let p = i - 1;
        while (p >= optsStart && /\s/.test(stripped[p]!)) p--;
        const isKeyStart = p < optsStart || stripped[p] === '{' || stripped[p] === ',';
        if (isKeyStart) {
          let q = i + 'matches'.length;
          while (q < stripped.length && /\s/.test(stripped[q]!)) q++;
          if (stripped[q] === ':') {
            // Find the opening `[` for the value.
            let r = q + 1;
            while (r < stripped.length && /\s/.test(stripped[r]!)) r++;
            if (stripped[r] === '[') {
              outerMatchesArrStart = r;
              break;
            }
          }
        }
      }
    }
  }
  if (outerMatchesArrStart === -1) return undefined;

  // Pull the array body — single-level, won't contain nested `]`.
  const close = stripped.indexOf(']', outerMatchesArrStart);
  if (close === -1) return undefined;
  const arrBody = source.slice(outerMatchesArrStart + 1, close);

  const items: string[] = [];
  const literalRe = /(["'`])((?:\\\1|.)*?)\1/g;
  let lit: RegExpExecArray | null;
  while ((lit = literalRe.exec(arrBody)) !== null) {
    items.push(lit[2] ?? '');
  }
  return items.length > 0 ? items : undefined;
}

/**
 * Extract `runAt: '...'` from the OUTER options object passed to
 * `defineCSUI({ ... })`. Like `extractMatches`, only the top-level key
 * at brace depth 1 wins — a helper module's `const runAt = 'document_end'`
 * declared elsewhere in the file is ignored.
 */
export function extractRunAt(source: string): CSUIDiscovery['runAt'] | undefined {
  const stripped = stripStringsAndComments(source);
  const callRe = /\bdefineCSUI\s*\(/g;
  const callMatch = callRe.exec(stripped);
  if (!callMatch) return undefined;
  let i = callMatch.index + callMatch[0].length;
  while (i < stripped.length && /\s/.test(stripped[i]!)) i++;
  if (stripped[i] !== '{') return undefined;
  const optsStart = i;

  let depth = 0;
  for (; i < stripped.length; i++) {
    const c = stripped[i]!;
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) break; }
    else if (depth === 1 && c === 'r' && stripped.startsWith('runAt', i)) {
      let p = i - 1;
      while (p >= optsStart && /\s/.test(stripped[p]!)) p--;
      const isKeyStart = p < optsStart || stripped[p] === '{' || stripped[p] === ',';
      if (!isKeyStart) continue;
      let q = i + 'runAt'.length;
      while (q < stripped.length && /\s/.test(stripped[q]!)) q++;
      if (stripped[q] !== ':') continue;
      // Scan to the quoted string literal value — read from the ORIGINAL
      // source so we get the real characters, not the spaces stripped left
      // behind by stripStringsAndComments.
      let r = q + 1;
      while (r < source.length && /\s/.test(source[r]!)) r++;
      const quote = source[r];
      if (quote !== '"' && quote !== "'" && quote !== '`') return undefined;
      const end = source.indexOf(quote, r + 1);
      if (end === -1) return undefined;
      const v = source.slice(r + 1, end);
      if (v === 'document_start' || v === 'document_end' || v === 'document_idle') return v;
      return undefined;
    }
  }
  return undefined;
}

/**
 * Replace string literal contents and comment bodies with spaces so our
 * regexes don't pick up syntax-shaped tokens that aren't actually code.
 * Cheap copy of the same routine used by core/compat. Length-preserving.
 */
function stripStringsAndComments(source: string): string {
  let out = '';
  let i = 0;
  const len = source.length;
  while (i < len) {
    const ch = source[i]!;
    const next = source[i + 1];
    if (ch === '/' && next === '/') {
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
    // Preserve quoted strings as-is so matches: ['url'] still parses correctly.
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      out += ch;
      i++;
      while (i < len && source[i] !== quote) {
        if (source[i] === '\\' && i + 1 < len) {
          out += source[i]! + source[i + 1]!;
          i += 2;
          continue;
        }
        out += source[i]!;
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
