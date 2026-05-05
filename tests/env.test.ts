import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDotenv, loadEnv, publicEnvToDefine, ENV_PREFIX } from '../src/core/env/index.js';

describe('parseDotenv', () => {
  it('parses simple KEY=value', () => {
    expect(parseDotenv('FOO=bar')).toEqual({ FOO: 'bar' });
  });
  it('strips wrapping double quotes', () => {
    expect(parseDotenv('FOO="bar"')).toEqual({ FOO: 'bar' });
  });
  it('strips wrapping single quotes', () => {
    expect(parseDotenv("FOO='bar'")).toEqual({ FOO: 'bar' });
  });
  it('honors export prefix', () => {
    expect(parseDotenv('export FOO=bar')).toEqual({ FOO: 'bar' });
  });
  it('ignores blank lines and # comments', () => {
    expect(parseDotenv('# a comment\n\nFOO=bar')).toEqual({ FOO: 'bar' });
  });
  it('drops trailing # comments only on unquoted values', () => {
    expect(parseDotenv('FOO=bar # comment')).toEqual({ FOO: 'bar' });
    expect(parseDotenv('FOO="bar # not a comment"')).toEqual({ FOO: 'bar # not a comment' });
  });
  it('skips malformed lines', () => {
    expect(parseDotenv('=oops\nFOO=bar')).toEqual({ FOO: 'bar' });
  });
});

describe('loadEnv', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'env-test-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns empty when no .env files exist', () => {
    const r = loadEnv({ cwd: dir, processEnv: {} });
    expect(r.publicEnv).toEqual({});
    expect(r.files).toEqual([]);
  });

  it('precedence: .env < .env.local < .env.<mode> < .env.<mode>.local', () => {
    writeFileSync(join(dir, '.env'),                    'EXTFORGE_PUBLIC_X=base');
    writeFileSync(join(dir, '.env.local'),              'EXTFORGE_PUBLIC_X=local');
    writeFileSync(join(dir, '.env.production'),         'EXTFORGE_PUBLIC_X=prod');
    writeFileSync(join(dir, '.env.production.local'),   'EXTFORGE_PUBLIC_X=prod-local');
    const r = loadEnv({ cwd: dir, mode: 'production', processEnv: {} });
    expect(r.publicEnv['EXTFORGE_PUBLIC_X']).toBe('prod-local');
  });

  it('processEnv overlays everything from disk', () => {
    writeFileSync(join(dir, '.env'), 'EXTFORGE_PUBLIC_X=disk');
    const r = loadEnv({ cwd: dir, processEnv: { EXTFORGE_PUBLIC_X: 'process' } });
    expect(r.publicEnv['EXTFORGE_PUBLIC_X']).toBe('process');
  });

  it('only EXTFORGE_PUBLIC_* keys appear in publicEnv', () => {
    writeFileSync(join(dir, '.env'), 'EXTFORGE_PUBLIC_OK=yes\nEXTFORGE_SECRET=no\nFOO=bar');
    const r = loadEnv({ cwd: dir, processEnv: {} });
    expect(Object.keys(r.publicEnv)).toEqual(['EXTFORGE_PUBLIC_OK']);
    expect(r.raw['EXTFORGE_SECRET']).toBe('no'); // raw still has it
  });
});

describe('publicEnvToDefine', () => {
  it('synthesises import.meta.env and process.env aliases', () => {
    const def = publicEnvToDefine({ EXTFORGE_PUBLIC_FOO: 'bar' }, 'production');
    expect(def['process.env.EXTFORGE_PUBLIC_FOO']).toBe('"bar"');
    const env = JSON.parse(def['import.meta.env']!) as Record<string, unknown>;
    expect(env['EXTFORGE_PUBLIC_FOO']).toBe('bar');
    expect(env['MODE']).toBe('production');
    expect(env['PROD']).toBe('true');
    expect(env['DEV']).toBe('false');
  });
});

describe('ENV_PREFIX', () => {
  it('is the documented prefix', () => {
    expect(ENV_PREFIX).toBe('EXTFORGE_PUBLIC_');
  });
});
