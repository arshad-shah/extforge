import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolve } from 'node:path/posix';
import { discoverInjectedEntries, partitionEntriesForFormat, buildContentScriptMap } from '../src/core/builder/index.js';
import { createLogger, LogLevel } from '../src/core/logger/index.js';

function makeTempSrc(): string {
  const dir = mkdtempSync(join(tmpdir(), 'extforge-builder-'));
  const src = join(dir, 'src');
  mkdirSync(src, { recursive: true });
  return src;
}

const silentLog = createLogger({ scope: 'test', level: LogLevel.Silent });

describe('discoverInjectedEntries', () => {
  let srcDir: string;

  beforeEach(() => { srcDir = makeTempSrc(); });
  afterEach(() => { rmSync(srcDir, { recursive: true, force: true }); });

  it('returns empty when neither src/injected.ts nor src/injected/ exists', () => {
    expect(discoverInjectedEntries(srcDir, silentLog)).toEqual({});
  });

  it('discovers a single src/injected.ts as { injected: <path> }', () => {
    const file = join(srcDir, 'injected.ts');
    writeFileSync(file, '// noop');
    const result = discoverInjectedEntries(srcDir, silentLog);
    expect(result).toEqual({ injected: file });
  });

  it('discovers a single src/injected.tsx as { injected: <path> }', () => {
    const file = join(srcDir, 'injected.tsx');
    writeFileSync(file, '// noop');
    const result = discoverInjectedEntries(srcDir, silentLog);
    expect(result).toEqual({ injected: file });
  });

  it('discovers all .ts/.tsx children of src/injected/', () => {
    const dir = join(srcDir, 'injected');
    mkdirSync(dir);
    const a = join(dir, 'a.ts');
    const b = join(dir, 'b.tsx');
    writeFileSync(a, '// a');
    writeFileSync(b, '// b');
    const result = discoverInjectedEntries(srcDir, silentLog);
    expect(result).toEqual({ 'injected/a': a, 'injected/b': b });
  });

  it('ignores non-ts files in src/injected/', () => {
    const dir = join(srcDir, 'injected');
    mkdirSync(dir);
    writeFileSync(join(dir, 'a.ts'), '// a');
    writeFileSync(join(dir, 'README.md'), 'docs');
    writeFileSync(join(dir, 'data.json'), '{}');
    const result = discoverInjectedEntries(srcDir, silentLog);
    expect(Object.keys(result)).toEqual(['injected/a']);
  });

  it('does not recurse into subdirectories of src/injected/', () => {
    const dir = join(srcDir, 'injected');
    mkdirSync(dir);
    mkdirSync(join(dir, 'sub'));
    writeFileSync(join(dir, 'a.ts'), '// a');
    writeFileSync(join(dir, 'sub', 'nested.ts'), '// nested');
    const result = discoverInjectedEntries(srcDir, silentLog);
    expect(Object.keys(result)).toEqual(['injected/a']);
  });

  it('prefers directory mode and warns when both layouts exist', () => {
    const dir = join(srcDir, 'injected');
    mkdirSync(dir);
    writeFileSync(join(dir, 'a.ts'), '// a');
    writeFileSync(join(srcDir, 'injected.ts'), '// loose');

    const log = createLogger({ scope: 'test', level: LogLevel.Silent });
    const warn = vi.spyOn(log, 'warn');

    const result = discoverInjectedEntries(srcDir, log);
    expect(Object.keys(result)).toEqual(['injected/a']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/both .*injected\/.*injected\.ts/i);
  });
});

describe('partitionEntriesForFormat', () => {
  it('routes content/index entry to IIFE bucket', () => {
    const allEntries = { 'background/index': '/p/bg.ts', 'content/index': '/p/content.ts' };
    const injectedEntries = { 'injected': '/p/injected.ts' };
    const { esmEntries, iifeEntries } = partitionEntriesForFormat(allEntries, injectedEntries);
    expect(esmEntries).toEqual({ 'background/index': '/p/bg.ts' });
    expect(iifeEntries).toEqual({ 'content/index': '/p/content.ts', 'injected': '/p/injected.ts' });
  });

  it('handles missing content/index gracefully', () => {
    const allEntries = { 'background/index': '/p/bg.ts', 'ui/popup/index': '/p/popup.ts' };
    const injectedEntries = { 'injected': '/p/injected.ts' };
    const { esmEntries, iifeEntries } = partitionEntriesForFormat(allEntries, injectedEntries);
    expect(esmEntries).toEqual({ 'background/index': '/p/bg.ts', 'ui/popup/index': '/p/popup.ts' });
    expect(iifeEntries).toEqual({ 'injected': '/p/injected.ts' });
  });

  it('handles empty injected map', () => {
    const allEntries = { 'content/index': '/p/content.ts', 'background/index': '/p/bg.ts' };
    const { esmEntries, iifeEntries } = partitionEntriesForFormat(allEntries, {});
    expect(esmEntries).toEqual({ 'background/index': '/p/bg.ts' });
    expect(iifeEntries).toEqual({ 'content/index': '/p/content.ts' });
  });

  it('does not mutate the input maps', () => {
    const allEntries = { 'content/index': '/p/content.ts', 'background/index': '/p/bg.ts' };
    const injectedEntries = { 'injected': '/p/injected.ts' };
    partitionEntriesForFormat(allEntries, injectedEntries);
    expect(allEntries).toEqual({ 'content/index': '/p/content.ts', 'background/index': '/p/bg.ts' });
    expect(injectedEntries).toEqual({ 'injected': '/p/injected.ts' });
  });
});

describe('buildContentScriptMap', () => {
  it('maps each content-script JS file to its index', () => {
    const cfg = {
      manifest: {
        contentScripts: [
          { matches: ['<all_urls>'], js: ['src/a.ts'] },
          { matches: ['<all_urls>'], js: ['src/b.ts', 'src/c.ts'] },
        ],
      },
    } as any;
    const map = buildContentScriptMap('/p', cfg);
    expect(map.get(resolve('/p', 'src/a.ts'))).toBe(0);
    expect(map.get(resolve('/p', 'src/b.ts'))).toBe(1);
    expect(map.get(resolve('/p', 'src/c.ts'))).toBe(1);
  });

  it('returns empty map when no contentScripts', () => {
    const map = buildContentScriptMap('/p', { manifest: {} } as any);
    expect(map.size).toBe(0);
  });

  it('returns empty map when manifest is undefined', () => {
    const map = buildContentScriptMap('/p', {} as any);
    expect(map.size).toBe(0);
  });

  it('handles content-script entry with no js array', () => {
    const cfg = {
      manifest: {
        contentScripts: [
          { matches: ['<all_urls>'], css: ['src/styles.css'] },
          { matches: ['<all_urls>'], js: ['src/b.ts'] },
        ],
      },
    } as any;
    const map = buildContentScriptMap('/p', cfg);
    expect(map.size).toBe(1);
    expect(map.get(resolve('/p', 'src/b.ts'))).toBe(1);
  });
});
