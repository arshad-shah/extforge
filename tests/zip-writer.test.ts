import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { writeZip } from '../src/cli/zip-writer.js';

const hasUnzip = spawnSync('unzip', ['-v'], { stdio: 'pipe' }).status === 0;

describe('writeZip', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ef-zip-'));
  });
  afterEach(() => {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  it('writes a non-empty file with the ZIP local-file-header signature', () => {
    const src = join(dir, 'src'); mkdirSync(src);
    writeFileSync(join(src, 'a.txt'), 'hello world');
    const out = join(dir, 'out.zip');
    writeZip(src, out);
    const buf = readFileSync(out);
    expect(buf.length).toBeGreaterThan(0);
    // 0x04034b50 little-endian.
    expect(buf.readUInt32LE(0)).toBe(0x04034b50);
  });

  it('produces a byte-for-byte identical archive across runs (deterministic)', () => {
    const src = join(dir, 'src'); mkdirSync(src, { recursive: true });
    writeFileSync(join(src, 'a.txt'), 'first');
    writeFileSync(join(src, 'b.txt'), 'second');
    const out1 = join(dir, '1.zip');
    const out2 = join(dir, '2.zip');
    writeZip(src, out1);
    // Touch the source files to ensure mtime-driven nondeterminism would
    // otherwise leak in.
    writeFileSync(join(src, 'a.txt'), 'first');
    writeZip(src, out2);
    expect(readFileSync(out1).equals(readFileSync(out2))).toBe(true);
  });

  it('skips .DS_Store and .git directories', () => {
    const src = join(dir, 'src'); mkdirSync(src, { recursive: true });
    writeFileSync(join(src, 'keep.txt'), 'ok');
    writeFileSync(join(src, '.DS_Store'), 'junk');
    mkdirSync(join(src, '.git')); writeFileSync(join(src, '.git/HEAD'), 'ref');
    const out = join(dir, 'out.zip');
    writeZip(src, out);
    // The central directory at the end of the zip names every entry —
    // grep for the strings we don't want to find there.
    const buf = readFileSync(out);
    expect(buf.includes('.DS_Store')).toBe(false);
    expect(buf.includes('HEAD')).toBe(false);
    expect(buf.includes('keep.txt')).toBe(true);
  });

  it.runIf(hasUnzip)('round-trips through the system `unzip` correctly', () => {
    const src = join(dir, 'src'); mkdirSync(src, { recursive: true });
    mkdirSync(join(src, 'nested'));
    writeFileSync(join(src, 'top.txt'), 'top-level');
    writeFileSync(join(src, 'nested/deep.txt'), 'deeper');
    const out = join(dir, 'roundtrip.zip');
    writeZip(src, out);

    const extractTo = join(dir, 'unzipped');
    mkdirSync(extractTo);
    const r = spawnSync('unzip', ['-q', out, '-d', extractTo], { stdio: 'pipe' });
    expect(r.status).toBe(0);
    expect(readFileSync(join(extractTo, 'top.txt'), 'utf8')).toBe('top-level');
    expect(readFileSync(join(extractTo, 'nested/deep.txt'), 'utf8')).toBe('deeper');
  });
});
