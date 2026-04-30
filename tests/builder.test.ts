import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverInjectedEntries } from '../src/core/builder/index.js';
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
