import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCodeFrame, serializeBuildError } from '../src/core/hmr/build-error.js';
import { ExtForgeError } from '../src/core/errors/index.js';

describe('buildCodeFrame', () => {
  let dir: string;

  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'ef-frame-')); });
  afterEach(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });

  it('renders surrounding context with a `>` marker on the failing line', () => {
    const f = join(dir, 'a.ts');
    writeFileSync(f, [
      'line 1',
      'line 2',
      'line 3 (broken)',
      'line 4',
      'line 5',
    ].join('\n'));
    const frame = buildCodeFrame(f, 3);
    expect(frame).toBeDefined();
    expect(frame!.split('\n').some((l) => l.startsWith('> 3 |'))).toBe(true);
    expect(frame).toContain('1 | line 1');
    expect(frame).toContain('5 | line 5');
  });

  it('adds a column-pointing caret when column is supplied', () => {
    const f = join(dir, 'b.ts');
    writeFileSync(f, 'const x = ;\n');
    const frame = buildCodeFrame(f, 1, 11);
    expect(frame).toBeDefined();
    const caretLine = frame!.split('\n').find((l) => l.trim().startsWith('^'));
    expect(caretLine).toBeDefined();
  });

  it('returns undefined for a missing file', () => {
    expect(buildCodeFrame(join(dir, 'nope.ts'), 1)).toBeUndefined();
  });

  it('returns undefined for an out-of-range line', () => {
    const f = join(dir, 'c.ts');
    writeFileSync(f, 'only one line\n');
    expect(buildCodeFrame(f, 99)).toBeUndefined();
  });

  it('caps the frame at the file boundaries when line is near the start/end', () => {
    const f = join(dir, 'd.ts');
    writeFileSync(f, 'first\nsecond\nthird\n');
    const frame = buildCodeFrame(f, 1);
    expect(frame).toBeDefined();
    expect(frame!.startsWith('> 1 | first')).toBe(true);
  });
});

describe('serializeBuildError', () => {
  let dir: string;

  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'ef-serr-')); });
  afterEach(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });

  it('extracts ExtForgeError fields verbatim', () => {
    const err = new ExtForgeError({
      code: 'EXT_BUILD_FAILED',
      message: 'syntax error',
      file: '/abs/proj/src/a.ts',
      line: 2,
      column: 10,
      hint: 'fix the comma',
    });
    const out = serializeBuildError(err, '/abs/proj');
    expect(out.code).toBe('EXT_BUILD_FAILED');
    expect(out.message).toBe('syntax error');
    expect(out.file).toBe('src/a.ts');
    expect(out.line).toBe(2);
    expect(out.column).toBe(10);
    expect(out.hint).toBe('fix the comma');
  });

  it('attaches a frame when the file is readable and line is in range', () => {
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src/a.ts'), 'export const x = 1;\nexport const y = ;\n');
    const err = new ExtForgeError({
      code: 'EXT_BUILD_FAILED',
      message: 'parse error',
      file: join(dir, 'src/a.ts'),
      line: 2,
      column: 17,
    });
    const out = serializeBuildError(err, dir);
    expect(out.frame).toBeDefined();
    expect(out.frame).toContain('> 2 |');
  });

  it('falls back to message + stack for a plain Error', () => {
    const err = new Error('boom');
    const out = serializeBuildError(err);
    expect(out.code).toBe('EXT_BUILD_ERROR');
    expect(out.message).toBe('boom');
    expect(out.stack).toContain('Error: boom');
  });

  it('coerces non-Error values to a string message', () => {
    const out = serializeBuildError('something-went-wrong');
    expect(out.message).toBe('something-went-wrong');
    expect(out.code).toBe('EXT_BUILD_ERROR');
  });

  it('unwraps an esbuild-style aggregate error into code+file+line+column', () => {
    const esb = {
      errors: [
        {
          text: 'Unexpected ";"',
          location: { file: '/abs/proj/src/a.ts', line: 4, column: 12 },
        },
        { text: 'second error', location: null },
      ],
    };
    const out = serializeBuildError(esb, '/abs/proj');
    expect(out.code).toBe('EXT_BUILD_FAILED');
    expect(out.message).toBe('Unexpected ";"');
    expect(out.file).toBe('src/a.ts');
    expect(out.line).toBe(4);
    expect(out.column).toBe(12);
  });

  it('falls back to "Build failed" when the esbuild error has no text', () => {
    const out = serializeBuildError({ errors: [{}] });
    expect(out.message).toBe('Build failed');
  });
});
