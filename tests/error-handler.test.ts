import { describe, it, expect } from 'vitest';
import { ExtForgeError } from '../src/core/errors/index.js';
import { formatError } from '../src/cli/error-handler.js';

describe('formatError', () => {
  it('formats ExtForgeError with code, file:line, hint, docsUrl', () => {
    const err = new ExtForgeError({
      code: 'EXT_CONFIG_INVALID',
      message: 'browsers[0] received "brave"',
      file: '/p/extforge.config.ts',
      line: 3,
      column: 14,
      hint: 'use "chrome"',
    });
    const f = formatError(err);
    expect(f.title).toBe('EXT_CONFIG_INVALID');
    expect(f.detail).toContain('extforge.config.ts:3:14');
    expect(f.detail).toContain('browsers[0] received "brave"');
    expect(f.hint).toContain('use "chrome"');
    expect(f.docsUrl).toContain('EXT_CONFIG_INVALID');
  });

  it('falls back to existing behavior for plain Error', () => {
    const f = formatError(new Error('something else'));
    expect(f.detail).toBe('something else');
    expect(f.title).toBeTruthy();
  });
});
