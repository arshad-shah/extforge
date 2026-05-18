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
 */
export function discoverCSUI(srcDir: string): CSUIDiscovery[] {
  const dir = join(srcDir, CSUI_DIR);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];

  const out: CSUIDiscovery[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const m = CSUI_SUFFIX.exec(entry.name);
    if (!m) continue;
    const file = join(dir, entry.name);
    const baseName = basename(entry.name).replace(CSUI_SUFFIX, '');
    const entryKey = `contents/${baseName}`;
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
 * Extract a string array literal assigned to `matches:` inside a top-level
 * `defineCSUI({ ... })` call. Tolerant: comments, trailing commas, nested
 * object braces between definition and matches array. Falls back to
 * `undefined` (caller should warn / require a fallback) when extraction fails.
 */
export function extractMatches(source: string): string[] | undefined {
  const stripped = stripStringsAndComments(source);
  const idx = stripped.indexOf('defineCSUI');
  if (idx === -1) return undefined;
  // Find the first `matches` key after `defineCSUI`.
  const afterDef = stripped.slice(idx);
  const matchesRe = /\bmatches\s*:\s*\[([\s\S]*?)\]/;
  const m = matchesRe.exec(afterDef);
  if (!m) return undefined;
  const arrBody = m[1] ?? '';
  // Pull every quoted literal in the array body.
  const items: string[] = [];
  const literalRe = /(["'`])((?:\\\1|.)*?)\1/g;
  let lit: RegExpExecArray | null;
  while ((lit = literalRe.exec(arrBody)) !== null) {
    items.push(lit[2] ?? '');
  }
  return items.length > 0 ? items : undefined;
}

/**
 * Extract `runAt: '...'` string literal.
 */
export function extractRunAt(source: string): CSUIDiscovery['runAt'] | undefined {
  const stripped = stripStringsAndComments(source);
  const re = /\brunAt\s*:\s*['"]([^'"]+)['"]/;
  const m = re.exec(stripped);
  if (!m) return undefined;
  const v = m[1];
  if (v === 'document_start' || v === 'document_end' || v === 'document_idle') return v;
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
