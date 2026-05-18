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
  it('flags optional-chained chrome.* access too', () => {
    const src = `chrome?.tabGroups?.update(1, { collapsed: true });`;
    const issues = checkSourceCompat({ source: src, file: 'a.ts', browsers: ['chrome', 'safari'] });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]!.api).toMatch(/tabGroups/);
  });
  it('ignores chrome.* tokens inside a regex literal', () => {
    // Without regex-literal stripping, the API regex would match
    // `chrome.tabGroups` inside this RegExp body and produce a false
    // positive.
    const src = `const re = /chrome\\.tabGroups/; chrome.storage.local.set({a:1});`;
    const issues = checkSourceCompat({ source: src, file: 'a.ts', browsers: ['chrome', 'safari'] });
    expect(issues).toHaveLength(0);
  });
  it('does not honor suppression without a reason', () => {
    const src = `// extforge-ignore-compat\nchrome.tabGroups.update(1, {});`;
    const issues = checkSourceCompat({ source: src, file: 'a.ts', browsers: ['chrome', 'safari'] });
    expect(issues).toHaveLength(1);
  });
  it('does not flag chrome.* inside string literals', () => {
    const src = `console.log("chrome.tabGroups.update is unsupported on safari");`;
    const issues = checkSourceCompat({ source: src, file: 'a.ts', browsers: ['chrome', 'safari'] });
    expect(issues).toHaveLength(0);
  });
  it('does not flag chrome.* inside line comments', () => {
    const src = `// chrome.tabGroups.update would be unsupported\nconst x = 1;`;
    const issues = checkSourceCompat({ source: src, file: 'a.ts', browsers: ['chrome', 'safari'] });
    expect(issues).toHaveLength(0);
  });
});
