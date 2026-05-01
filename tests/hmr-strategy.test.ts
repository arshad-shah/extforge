import { describe, it, expect } from 'vitest';
import { HMR_STRATEGY, type HMRStrategy } from '../src/core/hmr/strategy.js';

describe('HMR_STRATEGY', () => {
  it('maps every entry-point kind to a strategy', () => {
    expect(HMR_STRATEGY.background).toBe('extension-reload');
    expect(HMR_STRATEGY.popup).toBe('full-reload');
    expect(HMR_STRATEGY.sidepanel).toBe('full-reload');
    expect(HMR_STRATEGY.options).toBe('full-reload');
    expect(HMR_STRATEGY.content).toBe('tab-reload-targeted');
    expect(HMR_STRATEGY.injected).toBe('extension-reload');
    expect(HMR_STRATEGY.manifest).toBe('extension-reload');
    expect(HMR_STRATEGY.css).toBe('css-swap');
    expect(HMR_STRATEGY.assets).toBe('extension-reload');
  });

  it('exports HMRStrategy union type', () => {
    const s: HMRStrategy = 'css-swap';
    expect(s).toBeTypeOf('string');
  });
});
