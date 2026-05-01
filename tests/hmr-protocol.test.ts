import { describe, it, expect } from 'vitest';
import { HMR_PROTOCOL_VERSION } from '../src/core/hmr/constants.js';

describe('HMR protocol', () => {
  it('exports a numeric version >= 2', () => {
    expect(typeof HMR_PROTOCOL_VERSION).toBe('number');
    expect(HMR_PROTOCOL_VERSION).toBeGreaterThanOrEqual(2);
  });
});
