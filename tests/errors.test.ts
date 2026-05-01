import { describe, it, expect } from 'vitest';
import { ExtForgeError, ERROR_CODES } from '../src/core/errors/index.js';

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
  });

  it('exposes the code registry', () => {
    expect(ERROR_CODES.EXT_CONFIG_INVALID).toBe('EXT_CONFIG_INVALID');
    expect(ERROR_CODES.EXT_BUILD_FAILED).toBe('EXT_BUILD_FAILED');
    expect(ERROR_CODES.EXT_COMPAT_UNSUPPORTED).toBe('EXT_COMPAT_UNSUPPORTED');
  });
});
