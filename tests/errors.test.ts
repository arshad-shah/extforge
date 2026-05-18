import { describe, it, expect } from 'vitest';
import {
  ExtForgeError,
  isExtForgeError,
  ERROR_CODES,
  docsUrlFor,
} from '../src/core/errors/index.js';
import { ERROR_DOCS } from '../src/core/errors/error-docs.js';

describe('ExtForgeError', () => {
  it('captures code, file, line, hint, docsUrl', () => {
    const err = new ExtForgeError({
      code: 'EXT_CONFIG_INVALID',
      message: 'Invalid value',
      file: '/a/b.ts',
      line: 4,
      column: 2,
      hint: 'try foo',
      docsUrl: 'https://x',
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('EXT_CONFIG_INVALID');
    expect(err.file).toBe('/a/b.ts');
    expect(err.line).toBe(4);
    expect(err.hint).toBe('try foo');
    expect(err.docsUrl).toBe('https://x');
    expect(err.name).toBe('ExtForgeError');
  });

  it('defaults docsUrl to the canonical URL for the code', () => {
    const err = new ExtForgeError({ code: 'EXT_CONFIG_INVALID', message: 'x' });
    expect(err.docsUrl).toBe(docsUrlFor('EXT_CONFIG_INVALID'));
  });

  it('threads `cause` through to the underlying Error', () => {
    const root = new Error('root');
    const err = new ExtForgeError({ code: 'EXT_BUILD_FAILED', message: 'wrap', cause: root });
    expect((err as Error & { cause?: unknown }).cause).toBe(root);
  });

  it('exposes the code registry', () => {
    expect(ERROR_CODES.EXT_CONFIG_INVALID).toBe('EXT_CONFIG_INVALID');
    expect(ERROR_CODES.EXT_BUILD_FAILED).toBe('EXT_BUILD_FAILED');
    expect(ERROR_CODES.EXT_COMPAT_UNSUPPORTED).toBe('EXT_COMPAT_UNSUPPORTED');
  });
});

describe('isExtForgeError', () => {
  it('identifies ExtForgeError instances', () => {
    const err = new ExtForgeError({ code: 'EXT_BUILD_FAILED', message: 'x' });
    expect(isExtForgeError(err)).toBe(true);
  });
  it('rejects plain Errors and non-Error values', () => {
    expect(isExtForgeError(new Error('plain'))).toBe(false);
    expect(isExtForgeError(null)).toBe(false);
    expect(isExtForgeError(undefined)).toBe(false);
    expect(isExtForgeError('a string')).toBe(false);
    // Object with the right name tag but not an Error instance: rejected.
    expect(isExtForgeError({ name: 'ExtForgeError' })).toBe(false);
  });
});

describe('docsUrlFor', () => {
  it('produces a URL under the canonical docs base', () => {
    expect(docsUrlFor('EXT_BUILD_FAILED')).toMatch(/\/errors\/EXT_BUILD_FAILED$/);
  });
});

describe('ERROR_CODES + ERROR_DOCS', () => {
  it('every code has a complete doc entry', () => {
    for (const code of Object.values(ERROR_CODES)) {
      const doc = ERROR_DOCS[code as keyof typeof ERROR_DOCS];
      expect(doc, code).toBeDefined();
      expect(doc.title.length, code).toBeGreaterThan(0);
      expect(doc.description.length, code).toBeGreaterThan(0);
      expect(doc.whenYouSeeThis.length, code).toBeGreaterThan(0);
      expect(doc.howToFix.length, code).toBeGreaterThan(0);
    }
  });

  it('no doc entries reference an unknown code', () => {
    const codes = new Set(Object.values(ERROR_CODES));
    for (const docCode of Object.keys(ERROR_DOCS)) {
      expect(codes.has(docCode as never), docCode).toBe(true);
    }
  });
});
