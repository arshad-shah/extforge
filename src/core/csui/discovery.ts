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
import { basename, join } from 'node:path';
import type { ContentScriptRunAt, ContentScriptWorld } from '../manifest/types.js';
import { stripSource } from '../util/strip-source.js';

export interface CSUIDiscovery {
  /** Absolute path to the source file. */
  file: string;
  /** Entry key used by esbuild — also where the build emits the chunk. */
  entryKey: string;
  /** Output JS path relative to the per-browser dist root. */
  outputJsPath: string;
  /** `matches:` array statically extracted, if any. */
  matches?: string[];
  /** `excludeMatches:` array statically extracted, if any. */
  excludeMatches?: string[];
  /** `runAt:` value statically extracted, if any. */
  runAt?: ContentScriptRunAt;
  /** `allFrames:` boolean statically extracted, if any. */
  allFrames?: boolean;
  /** `matchAboutBlank:` boolean statically extracted, if any. */
  matchAboutBlank?: boolean;
  /** `world:` value statically extracted, if any. */
  world?: ContentScriptWorld;
  /**
   * Manifest-affecting options that ARE declared in the source but whose value
   * could not be read statically (a variable, a spread, a computed
   * expression…). The builder warns for each — silently dropping a declared
   * option is the one outcome we refuse.
   */
  unresolvedOptions?: string[];
}

const RUN_AT_VALUES = [
  'document_start',
  'document_end',
  'document_idle',
] as const satisfies readonly ContentScriptRunAt[];
const WORLD_VALUES = ['MAIN', 'ISOLATED'] as const satisfies readonly ContentScriptWorld[];

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
    const excludeMatches = extractExcludeMatches(source);
    const runAt = extractRunAt(source);
    const allFrames = extractAllFrames(source);
    const matchAboutBlank = extractMatchAboutBlank(source);
    const world = extractWorld(source);

    // `matches` is deliberately not in this list — the builder already emits a
    // dedicated (and more actionable) warning when it can't be extracted.
    const unresolvedOptions = (
      [
        ['excludeMatches', excludeMatches],
        ['runAt', runAt],
        ['allFrames', allFrames],
        ['matchAboutBlank', matchAboutBlank],
        ['world', world],
      ] as const
    )
      .filter(([key, value]) => value === undefined && isOptionDeclared(source, key))
      .map(([key]) => key as string);

    out.push({
      file,
      entryKey,
      outputJsPath,
      matches: extractMatches(source),
      excludeMatches,
      runAt,
      allFrames,
      matchAboutBlank,
      world,
      ...(unresolvedOptions.length > 0 && { unresolvedOptions }),
    });
  }
  return out;
}

// ─── Static option extraction ────────────────────────────────────────────────
//
// Every extractor below shares one rule: the key only counts when it sits at
// brace depth 1 of the object literal passed to `defineCSUI({ ... })`. That
// keeps a nested object (`{ routerMap: { matches: [...] }, matches: [...] }`)
// and a same-named const elsewhere in the file — or in a helper module inlined
// into it — from winning over the real option.

/** Offset of the `{` opening the options literal of the `defineCSUI(` call. */
function findOptionsStart(stripped: string): number | undefined {
  // Locate the *call site*: `defineCSUI` followed (after optional whitespace)
  // by `(`. Skips earlier hits like `import { defineCSUI }` where the next
  // token is `}` instead of `(`.
  const callRe = /\bdefineCSUI\s*\(/g;
  const callMatch = callRe.exec(stripped);
  if (!callMatch) return undefined;
  let i = callMatch.index + callMatch[0].length;
  while (i < stripped.length && /\s/.test(stripped[i]!)) i++;
  return stripped[i] === '{' ? i : undefined;
}

/**
 * Offset of the first non-whitespace character of `key`'s value, when `key`
 * appears at brace depth 1 of the `defineCSUI` options literal. `undefined`
 * when the call, the literal, or the key isn't there.
 */
function findOptionValueStart(stripped: string, key: string): number | undefined {
  const optsStart = findOptionsStart(stripped);
  if (optsStart === undefined) return undefined;

  let depth = 0;
  for (let i = optsStart; i < stripped.length; i++) {
    const c = stripped[i]!;
    if (c === '{') {
      depth++;
      continue;
    }
    if (c === '}') {
      depth--;
      if (depth === 0) return undefined;
      continue;
    }
    if (depth !== 1) continue;
    if (c !== key[0] || !stripped.startsWith(key, i)) continue;
    // Must be a key token: preceded by `{` or `,` (skipping whitespace) and
    // followed by `:`.
    let p = i - 1;
    while (p >= optsStart && /\s/.test(stripped[p]!)) p--;
    const isKeyStart = p < optsStart || stripped[p] === '{' || stripped[p] === ',';
    if (!isKeyStart) continue;
    let q = i + key.length;
    while (q < stripped.length && /\s/.test(stripped[q]!)) q++;
    if (stripped[q] !== ':') continue;
    let r = q + 1;
    while (r < stripped.length && /\s/.test(stripped[r]!)) r++;
    return r;
  }
  return undefined;
}

/**
 * Whether `key` is declared at the top level of the `defineCSUI` options —
 * regardless of whether its value could be read. The builder uses this to tell
 * "the user didn't ask for it" apart from "the user asked for it and we
 * couldn't parse it", so the second case can be warned about loudly.
 */
export function isOptionDeclared(source: string, key: string): boolean {
  return findOptionValueStart(stripSource(source), key) !== undefined;
}

/**
 * Extract a string array literal option (`matches`, `excludeMatches`).
 * Tolerant of comments, trailing commas, and the source order of keys.
 * Returns `undefined` when the key is absent, the value isn't an array
 * literal, or the array holds no string literals.
 */
function extractStringArrayOption(source: string, key: string): string[] | undefined {
  const stripped = stripSource(source);
  const start = findOptionValueStart(stripped, key);
  if (start === undefined || stripped[start] !== '[') return undefined;

  // Single-level array: string bodies are blanked in `stripped`, so the first
  // `]` there is the real terminator even when an item contains one.
  const close = stripped.indexOf(']', start);
  if (close === -1) return undefined;
  // Read the body from the ORIGINAL source — `stripped` has the literal
  // contents replaced with spaces.
  const arrBody = source.slice(start + 1, close);

  const items: string[] = [];
  const literalRe = /(["'`])((?:\\\1|.)*?)\1/g;
  let lit: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: canonical RegExp.exec iteration.
  while ((lit = literalRe.exec(arrBody)) !== null) {
    items.push(lit[2] ?? '');
  }
  return items.length > 0 ? items : undefined;
}

/** Extract a string-literal option, narrowed to `allowed`. */
function extractStringLiteralOption<T extends string>(
  source: string,
  key: string,
  allowed: readonly T[],
): T | undefined {
  const start = findOptionValueStart(stripSource(source), key);
  if (start === undefined) return undefined;
  // Read from the ORIGINAL source so we get the real characters, not the
  // spaces `stripSource` left behind.
  const quote = source[start];
  if (quote !== '"' && quote !== "'" && quote !== '`') return undefined;
  const end = source.indexOf(quote, start + 1);
  if (end === -1) return undefined;
  const value = source.slice(start + 1, end) as T;
  return allowed.includes(value) ? value : undefined;
}

/** Extract a `true` / `false` literal option. */
function extractBooleanOption(source: string, key: string): boolean | undefined {
  const stripped = stripSource(source);
  const start = findOptionValueStart(stripped, key);
  if (start === undefined) return undefined;
  // `\b`-style guard: `trueish` and `falsey` are identifiers, not literals.
  const rest = stripped.slice(start);
  if (/^true\s*[,}]/.test(rest)) return true;
  if (/^false\s*[,}]/.test(rest)) return false;
  return undefined;
}

/**
 * Extract the `matches:` array from the OUTER options object passed to
 * `defineCSUI({ ... }, render)`. Only the key at brace depth 1 wins, so a
 * nested `{ routerMap: { matches: [...] } }` never shadows the manifest
 * matches.
 *
 * Falls back to `undefined` (caller should warn / require a fallback) when
 * extraction fails.
 */
export function extractMatches(source: string): string[] | undefined {
  return extractStringArrayOption(source, 'matches');
}

/**
 * Extract `excludeMatches:` — same shape and same depth-1 rule as
 * {@link extractMatches}. A declared-but-unreadable value is reported through
 * `CSUIDiscovery.unresolvedOptions` rather than dropped in silence.
 */
export function extractExcludeMatches(source: string): string[] | undefined {
  return extractStringArrayOption(source, 'excludeMatches');
}

/**
 * Extract `runAt: '...'` from the OUTER options object passed to
 * `defineCSUI({ ... })`. Like `extractMatches`, only the top-level key
 * at brace depth 1 wins — a helper module's `const runAt = 'document_end'`
 * declared elsewhere in the file is ignored.
 */
export function extractRunAt(source: string): CSUIDiscovery['runAt'] | undefined {
  return extractStringLiteralOption(source, 'runAt', RUN_AT_VALUES);
}

/** Extract `world: 'MAIN' | 'ISOLATED'`. Depth-1 only, as above. */
export function extractWorld(source: string): CSUIDiscovery['world'] | undefined {
  return extractStringLiteralOption(source, 'world', WORLD_VALUES);
}

/** Extract `allFrames: true | false`. Depth-1 only, as above. */
export function extractAllFrames(source: string): boolean | undefined {
  return extractBooleanOption(source, 'allFrames');
}

/** Extract `matchAboutBlank: true | false`. Depth-1 only, as above. */
export function extractMatchAboutBlank(source: string): boolean | undefined {
  return extractBooleanOption(source, 'matchAboutBlank');
}
