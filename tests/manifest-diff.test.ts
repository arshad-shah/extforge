import { describe, expect, it } from 'vitest';
import {
  diffManifests,
  formatDiff,
  type ManifestChange,
  meetsLevel,
  worstLevel,
} from '../src/core/diff/index.js';

const base = {
  manifest_version: 3,
  name: 'Ext',
  version: '1.2.0',
  permissions: ['storage', 'bookmarks'],
  host_permissions: ['https://api.example.com/*'],
  content_scripts: [{ matches: ['https://example.com/*'], js: ['content/index.js'] }],
};

const find = (changes: ManifestChange[], key: string, value?: unknown) =>
  changes.find((c) => c.key === key && (value === undefined || c.value === value));

describe('diffManifests', () => {
  it('reports nothing for identical manifests', () => {
    expect(diffManifests(base, structuredClone(base))).toEqual([]);
  });

  it('marks a permission with a Chrome install warning as prompting users', () => {
    const changes = diffManifests(base, { ...base, permissions: [...base.permissions, 'history'] });
    expect(find(changes, 'permissions', 'history')).toMatchObject({
      kind: 'added',
      level: 'prompt',
    });
  });

  it('marks a warning-free permission as review only', () => {
    const changes = diffManifests(base, { ...base, permissions: [...base.permissions, 'alarms'] });
    expect(find(changes, 'permissions', 'alarms')).toMatchObject({
      kind: 'added',
      level: 'review',
    });
  });

  it('assumes an unknown permission prompts, and says so', () => {
    const changes = diffManifests(base, { ...base, permissions: [...base.permissions, 'madeUp'] });
    expect(find(changes, 'permissions', 'madeUp')).toMatchObject({ level: 'prompt' });
    expect(find(changes, 'permissions', 'madeUp')?.note).toMatch(/not in extforge's list/);
  });

  it('treats removals as safe', () => {
    const changes = diffManifests(base, { ...base, permissions: ['storage'] });
    expect(find(changes, 'permissions', 'bookmarks')).toMatchObject({
      kind: 'removed',
      level: 'info',
    });
  });

  it('marks new host access as prompting, from host_permissions or content script matches', () => {
    const changes = diffManifests(base, {
      ...base,
      host_permissions: [...base.host_permissions, '*://*.github.com/*'],
      content_scripts: [{ matches: ['https://example.com/*', 'https://new.dev/*'], js: ['c.js'] }],
    });
    expect(find(changes, 'host_permissions', '*://*.github.com/*')).toMatchObject({
      level: 'prompt',
    });
    expect(find(changes, 'content_scripts.matches', 'https://new.dev/*')).toMatchObject({
      level: 'prompt',
    });
  });

  it('does not count a host already reachable through the other key', () => {
    const changes = diffManifests(base, {
      ...base,
      content_scripts: [{ matches: ['https://api.example.com/*'], js: ['content/index.js'] }],
    });
    expect(find(changes, 'content_scripts.matches', 'https://api.example.com/*')?.level).toBe(
      'info',
    );
  });

  it('does not prompt for new hosts when <all_urls> was already granted', () => {
    const before = { ...base, host_permissions: ['<all_urls>'] };
    const changes = diffManifests(before, {
      ...before,
      content_scripts: [{ matches: ['https://new.dev/*'], js: ['c.js'] }],
    });
    expect(find(changes, 'content_scripts.matches', 'https://new.dev/*')?.level).toBe('info');
  });

  it('treats new optional permissions as review, since nothing is asked at update time', () => {
    const changes = diffManifests(base, { ...base, optional_permissions: ['downloads'] });
    expect(find(changes, 'optional_permissions', 'downloads')).toMatchObject({ level: 'review' });
  });

  it('reports a version bump as info and CSP changes as review', () => {
    const changes = diffManifests(base, {
      ...base,
      version: '1.3.0',
      content_security_policy: { extension_pages: "script-src 'self'" },
    });
    expect(find(changes, 'version')).toMatchObject({ kind: 'changed', from: '1.2.0', to: '1.3.0' });
    expect(find(changes, 'content_security_policy')).toMatchObject({
      kind: 'added',
      level: 'review',
    });
  });
});

describe('levels', () => {
  it('orders info < review < prompt', () => {
    expect(worstLevel([])).toBe('none');
    expect(worstLevel([{ level: 'info' }, { level: 'review' }] as ManifestChange[])).toBe('review');
    expect(meetsLevel('prompt', 'review')).toBe(true);
    expect(meetsLevel('review', 'prompt')).toBe(false);
  });
});

describe('formatDiff', () => {
  it('prints one line per change with a marker for disruptive ones', () => {
    const lines = formatDiff(
      diffManifests(base, { ...base, version: '1.3.0', permissions: ['storage', 'history'] }),
    );
    expect(lines.some((l) => l.startsWith('+ permissions: "history"') && l.includes('⚠'))).toBe(
      true,
    );
    expect(lines.some((l) => l.startsWith('- permissions: "bookmarks"'))).toBe(true);
    expect(lines.some((l) => l.startsWith('~ version: 1.2.0 → 1.3.0'))).toBe(true);
  });
});
