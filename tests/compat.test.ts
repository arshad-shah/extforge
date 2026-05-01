import { describe, it, expect } from 'vitest';
import { checkSourceCompat } from '../src/core/compat/index.js';

const SAFE_SOURCE = `
  chrome.storage.local.set({ a: 1 });
`;
const SAFARI_BAD = `
  chrome.tabGroups.update(1, { collapsed: true });
`;
const SUPPRESSED = `
  // extforge-ignore-compat: gated below
  chrome.tabGroups.update(1, { collapsed: true });
`;

describe('checkSourceCompat', () => {
  it('finds nothing for supported APIs', () => {
    const issues = checkSourceCompat({ source: SAFE_SOURCE, file: 'a.ts', browsers: ['chrome', 'safari'] });
    expect(issues).toHaveLength(0);
  });
  it('flags Safari-unsupported APIs', () => {
    const issues = checkSourceCompat({ source: SAFARI_BAD, file: 'a.ts', browsers: ['chrome', 'safari'] });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]!.api).toMatch(/tabGroups/);
    expect(issues[0]!.unsupported).toContain('safari');
  });
  it('respects // extforge-ignore-compat suppressions with a reason', () => {
    const issues = checkSourceCompat({ source: SUPPRESSED, file: 'a.ts', browsers: ['chrome', 'safari'] });
    expect(issues).toHaveLength(0);
  });
  it('does not honor suppression without a reason', () => {
    const src = `// extforge-ignore-compat\nchrome.tabGroups.update(1, {});`;
    const issues = checkSourceCompat({ source: src, file: 'a.ts', browsers: ['chrome', 'safari'] });
    expect(issues).toHaveLength(1);
  });
});
