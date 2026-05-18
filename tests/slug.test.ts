import { describe, it, expect } from 'vitest';
import { slugify } from '../src/core/util/slug.js';

describe('slugify', () => {
  it('lowercases ASCII names and collapses whitespace to single dashes', () => {
    expect(slugify('My Cool Ext')).toBe('my-cool-ext');
  });

  it('replaces non-ASCII characters with single dashes', () => {
    expect(slugify('Résumé Helper')).toBe('r-sum-helper');
  });

  it('strips emoji and shell metacharacters', () => {
    expect(slugify('My & Cool / Ext 🚀')).toBe('my-cool-ext');
  });

  it('trims leading and trailing dashes and collapses runs of dashes', () => {
    expect(slugify('--leading--trailing--')).toBe('leading-trailing');
    expect(slugify('a---b---c')).toBe('a-b-c');
  });

  it('returns the fallback when nothing survives', () => {
    expect(slugify('')).toBe('extension');
    expect(slugify('🚀')).toBe('extension');
    expect(slugify('---')).toBe('extension');
    expect(slugify('foo', 'custom-default')).toBe('foo');
    expect(slugify('🎉', 'pkg')).toBe('pkg');
  });

  it('preserves the allowed character set: a-z 0-9 . _ -', () => {
    expect(slugify('foo.bar_baz-1')).toBe('foo.bar_baz-1');
  });

  it('is O(n) on pathological input — many leading dashes', () => {
    // No regex backtracking. The CodeQL polynomial-regex finding that
    // motivated this helper would have made the previous regex chain
    // slow on long dash runs; this should be linear and finish instantly.
    const huge = '-'.repeat(100_000) + 'tail';
    const t0 = Date.now();
    expect(slugify(huge)).toBe('tail');
    expect(Date.now() - t0).toBeLessThan(500);
  });
});
