import type { Metafile } from 'esbuild';
import { describe, expect, it } from 'vitest';
import {
  checkBudgets,
  collectEntrySizes,
  matchesGlob,
  parseSize,
  resolveBudget,
} from '../src/core/builder/budgets.js';

describe('parseSize', () => {
  it('reads b, kb and mb in 1024-based units, case-insensitively', () => {
    expect(parseSize('512b')).toBe(512);
    expect(parseSize('50kb')).toBe(50 * 1024);
    expect(parseSize('1.5MB')).toBe(Math.round(1.5 * 1024 * 1024));
    expect(parseSize('2 KB')).toBe(2048);
  });

  it('treats a bare number as bytes', () => {
    expect(parseSize(1000)).toBe(1000);
    expect(parseSize('1000')).toBe(1000);
  });

  it('rejects anything else', () => {
    for (const bad of ['', 'kb', '50gb', '-1kb', 'fifty', -5, Number.NaN]) {
      expect(() => parseSize(bad as string | number)).toThrow(/size/i);
    }
  });
});

describe('matchesGlob', () => {
  it('matches * within one path segment and ** across segments', () => {
    expect(matchesGlob('content/index', 'content/*')).toBe(true);
    expect(matchesGlob('content/deep/index', 'content/*')).toBe(false);
    expect(matchesGlob('content/deep/index', 'content/**')).toBe(true);
    expect(matchesGlob('anything/at/all', '**')).toBe(true);
    expect(matchesGlob('ui/popup/index', 'ui/?opup/index')).toBe(true);
  });

  it('treats regex metacharacters literally', () => {
    expect(matchesGlob('a.b', 'a.b')).toBe(true);
    expect(matchesGlob('axb', 'a.b')).toBe(false);
  });
});

describe('resolveBudget', () => {
  const budgets = { '**': '500kb', 'content/*': '80kb', 'content/index': '50kb' };

  it('prefers an exact entry name over any glob', () => {
    expect(resolveBudget('content/index', budgets)).toEqual({
      pattern: 'content/index',
      limit: 50 * 1024,
    });
  });

  it('otherwise uses the first matching glob in declaration order', () => {
    expect(resolveBudget('content/other', { 'content/*': '80kb', '**': '500kb' })).toEqual({
      pattern: 'content/*',
      limit: 80 * 1024,
    });
    expect(resolveBudget('background/index', budgets)).toEqual({
      pattern: '**',
      limit: 500 * 1024,
    });
  });

  it('returns undefined when nothing matches', () => {
    expect(resolveBudget('background/index', { 'content/*': '1kb' })).toBeUndefined();
  });
});

/** Metafile paths are relative to esbuild's working directory. */
function metafile(outputs: Metafile['outputs']): Metafile {
  return { inputs: {}, outputs };
}

describe('collectEntrySizes', () => {
  const cwd = '/proj';
  const outDir = '/proj/dist/chrome';

  it('names entries by output path without extension and counts the chunks they import', () => {
    const esm = metafile({
      'dist/chrome/background/index.js': {
        bytes: 1000,
        entryPoint: 'src/background/index.ts',
        imports: [{ path: 'dist/chrome/chunk-ABC.js', kind: 'import-statement' }],
        exports: [],
        inputs: { 'src/background/index.ts': { bytesInOutput: 900 } },
      },
      'dist/chrome/chunk-ABC.js': {
        bytes: 3000,
        imports: [],
        exports: [],
        inputs: { 'node_modules/zod/index.js': { bytesInOutput: 2950 } },
      },
      'dist/chrome/background/index.js.map': {
        bytes: 9999,
        imports: [],
        exports: [],
        inputs: {},
      },
    });
    const iife = metafile({
      'dist/chrome/content/index.js': {
        bytes: 400,
        entryPoint: 'src/content/index.ts',
        imports: [],
        exports: [],
        inputs: { 'src/content/index.ts': { bytesInOutput: 380 } },
      },
      'dist/chrome/content/index.css': {
        bytes: 200,
        entryPoint: 'src/content/index.ts',
        imports: [],
        exports: [],
        inputs: {},
      },
    });

    const entries = collectEntrySizes([esm, iife], outDir, cwd);
    expect(entries.map((e) => [e.name, e.bytes])).toEqual([
      ['background/index', 4000],
      ['content/index', 400],
    ]);
    expect(entries[0]?.inputs[0]).toEqual({ path: 'node_modules/zod/index.js', bytes: 2950 });
  });

  it('leaves out inputs that were tree-shaken to zero bytes', () => {
    const esm = metafile({
      'dist/chrome/background/index.js': {
        bytes: 10,
        entryPoint: 'src/background/index.ts',
        imports: [],
        exports: [],
        inputs: { 'src/a.ts': { bytesInOutput: 10 }, 'src/unused.ts': { bytesInOutput: 0 } },
      },
    });
    expect(collectEntrySizes([esm], outDir, cwd)[0]?.inputs.map((i) => i.path)).toEqual([
      'src/a.ts',
    ]);
  });

  it('does not count dynamically imported chunks against the entry', () => {
    const esm = metafile({
      'dist/chrome/ui/popup/index.js': {
        bytes: 100,
        entryPoint: 'src/ui/popup/index.tsx',
        imports: [{ path: 'dist/chrome/chunk-LAZY.js', kind: 'dynamic-import' }],
        exports: [],
        inputs: {},
      },
      'dist/chrome/chunk-LAZY.js': { bytes: 5000, imports: [], exports: [], inputs: {} },
    });
    expect(collectEntrySizes([esm], outDir, cwd)[0]?.bytes).toBe(100);
  });
});

describe('checkBudgets', () => {
  const entries = [
    {
      name: 'content/index',
      bytes: 60 * 1024,
      inputs: [
        { path: 'node_modules/lodash/lodash.js', bytes: 40 * 1024 },
        { path: 'src/content/index.ts', bytes: 20 * 1024 },
      ],
    },
    { name: 'background/index', bytes: 10 * 1024, inputs: [] },
  ];

  it('reports each entry over its budget with the overage and top contributors', () => {
    const violations = checkBudgets(entries, { 'content/index': '50kb', '**': '500kb' });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      name: 'content/index',
      pattern: 'content/index',
      limit: 50 * 1024,
      over: 10 * 1024,
    });
    expect(violations[0]?.top.map((i) => i.path)).toEqual([
      'node_modules/lodash/lodash.js',
      'src/content/index.ts',
    ]);
  });

  it('passes when everything is within budget', () => {
    expect(checkBudgets(entries, { '**': '1mb' })).toEqual([]);
  });
});

describe('build.budgets config validation', () => {
  it('rejects an unparseable budget when the config is loaded', async () => {
    const { extForgeConfigSchema } = await import('../src/core/config/schema.js');
    const bad = extForgeConfigSchema.safeParse({ build: { budgets: { '**': '50 gigs' } } });
    expect(bad.success).toBe(false);
    expect(JSON.stringify(bad.error?.issues)).toMatch(/Invalid size/);
    const good = extForgeConfigSchema.safeParse({ build: { budgets: { '**': '50kb', x: 1024 } } });
    expect(good.success).toBe(true);
  });
});
