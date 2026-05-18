/**
 * Serialise a build failure into a structured envelope the dev error
 * overlay can render. Includes a source frame (a few lines of context
 * around the failing line, with a caret marker) when we have a file +
 * line + the file is readable.
 *
 * Kept separate from `hmr/index.ts` so the formatting logic is unit
 * testable without spinning up a WebSocket server.
 */

import { readFileSync } from 'node:fs';
import { isAbsolute, relative } from 'node:path';
import { isExtForgeError, type ExtForgeError } from '../errors/index.js';

export interface SerializedBuildError {
  code: string;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  hint?: string;
  docsUrl?: string;
  frame?: string;
  stack?: string;
}

const FRAME_CONTEXT_LINES = 2;

/**
 * Build a code frame like:
 *
 *   3 | export const foo = 1;
 *   4 | export const bar = ;
 *     |                   ^
 *   5 | export const baz = 3;
 *
 * Returns `undefined` if the file can't be read or the line is out of range.
 */
export function buildCodeFrame(
  file: string,
  line: number,
  column?: number,
  contextLines: number = FRAME_CONTEXT_LINES,
): string | undefined {
  let source: string;
  try { source = readFileSync(file, 'utf8'); }
  catch { return undefined; }

  const lines = source.split(/\r?\n/);
  if (line < 1 || line > lines.length) return undefined;

  const start = Math.max(1, line - contextLines);
  const end = Math.min(lines.length, line + contextLines);
  const gutterWidth = String(end).length;

  const out: string[] = [];
  for (let n = start; n <= end; n++) {
    const num = String(n).padStart(gutterWidth, ' ');
    const text = lines[n - 1] ?? '';
    const marker = n === line ? '>' : ' ';
    out.push(`${marker} ${num} | ${text}`);
    if (n === line && column != null && column > 0) {
      const pad = ' '.repeat(gutterWidth) + '   ' + ' '.repeat(Math.max(0, column - 1));
      out.push(`${pad}^`);
    }
  }
  return out.join('\n');
}

/**
 * Coerce any caught build-time error (ExtForgeError, plain Error, string)
 * into the structured payload the overlay knows how to render.
 *
 * `projectRoot`, when provided, is used to shorten absolute file paths
 * in the output (turn `/home/me/proj/src/foo.ts` into `src/foo.ts`).
 */
export function serializeBuildError(err: unknown, projectRoot?: string): SerializedBuildError {
  const out: SerializedBuildError = { code: 'EXT_BUILD_ERROR', message: 'Unknown error' };

  if (isExtForgeError(err)) {
    const e = err as ExtForgeError;
    out.code = e.code ?? 'EXT_BUILD_ERROR';
    out.message = e.message;
    out.hint = e.hint;
    out.docsUrl = e.docsUrl;
    if (e.file) out.file = projectRoot && isAbsolute(e.file) ? relative(projectRoot, e.file) : e.file;
    if (e.line != null) out.line = e.line;
    if (e.column != null) out.column = e.column;
    if (e.stack) out.stack = e.stack;
  } else if (err && typeof err === 'object' && Array.isArray((err as { errors?: unknown[] }).errors)) {
    // esbuild-style aggregate error from `BuildContext.rebuild()` — that
    // path doesn't flow through the builder's throwAsBuildError wrapper.
    // Pull the first entry's text + location so the overlay still gets a
    // useful file:line:col pointing at the broken source.
    const esb = err as { errors: Array<{ text?: string; location?: { file?: string; line?: number; column?: number } | null }> };
    const first = esb.errors[0];
    out.code = 'EXT_BUILD_FAILED';
    out.message = first?.text ?? 'Build failed';
    if (first?.location?.file) {
      const f = first.location.file;
      out.file = projectRoot && isAbsolute(f) ? relative(projectRoot, f) : f;
      if (first.location.line != null) out.line = first.location.line;
      if (first.location.column != null) out.column = first.location.column;
    }
    if (err instanceof Error && err.stack) out.stack = err.stack;
  } else if (err instanceof Error) {
    out.message = err.message;
    out.stack = err.stack;
  } else {
    out.message = String(err);
  }

  // Try to build a frame if we have a real file + line.
  if (out.file && out.line) {
    const abs = projectRoot && !isAbsolute(out.file)
      ? `${projectRoot}/${out.file}`
      : out.file;
    const frame = buildCodeFrame(abs, out.line, out.column);
    if (frame) out.frame = frame;
  }
  return out;
}
