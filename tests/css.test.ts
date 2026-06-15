import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveCssProcessor,
  isCssPreset,
  processStylesheet,
  CSS_PRESETS,
  type CssProcessor,
  type CssTransformContext,
} from '../src/core/builder/css.js';
import { PluginRunner } from '../src/core/plugins/runner.js';
import { createLogger, LogLevel } from '../src/core/logger/index.js';
import type { ExtForgePluginV1 } from '../src/core/plugins/types.js';

const log = createLogger({ level: LogLevel.Silent });

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'extforge-css-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

function write(rel: string, contents: string): string {
  const p = join(dir, rel);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, contents);
  return p;
}

async function run(processor: CssProcessor, input: string, output: string): Promise<string> {
  await processStylesheet(input, output, processor, undefined, { root: dir, srcDir: dir, dev: true }, log);
  return existsSync(output) ? readFileSync(output, 'utf8') : '';
}

describe('resolveCssProcessor', () => {
  it('normalises preset strings into a bare processor', () => {
    expect(resolveCssProcessor('vanilla')).toEqual({ name: 'vanilla' });
    expect(resolveCssProcessor('none')).toEqual({ name: 'none' });
  });

  it('defaults to tailwind when css is undefined', () => {
    expect(resolveCssProcessor(undefined)).toEqual({ name: 'tailwind' });
  });

  it('passes a custom processor object through unchanged', () => {
    const proc: CssProcessor = { name: 'sass', command: 'sass', args: ['{input}', '{output}'] };
    expect(resolveCssProcessor(proc)).toBe(proc);
  });
});

describe('isCssPreset', () => {
  it('recognises every built-in preset', () => {
    for (const p of CSS_PRESETS) expect(isCssPreset(p)).toBe(true);
  });
  it('rejects unknown strings and objects', () => {
    expect(isCssPreset('sass')).toBe(false);
    expect(isCssPreset({ name: 'tailwind' })).toBe(false);
  });
});

describe('processStylesheet — built-in presets', () => {
  it('copies the source through for the vanilla preset', async () => {
    const input = write('src/styles.css', '.a { color: red; }');
    const out = await run({ name: 'vanilla' }, input, join(dir, 'out/styles.css'));
    expect(out).toBe('.a { color: red; }');
  });

  it('copies the source through for the none preset', async () => {
    const input = write('src/styles.css', 'body{}');
    const out = await run({ name: 'none' }, input, join(dir, 'out/styles.css'));
    expect(out).toBe('body{}');
  });

  it('is a no-op when the input file does not exist', async () => {
    const output = join(dir, 'out/missing.css');
    await processStylesheet(join(dir, 'nope.css'), output, { name: 'none' }, undefined, { root: dir, srcDir: dir, dev: true }, log);
    expect(existsSync(output)).toBe(false);
  });
});

describe('processStylesheet — custom processors', () => {
  it('applies a programmatic transform', async () => {
    const input = write('src/styles.css', '.a{}');
    const processor: CssProcessor = {
      name: 'upper',
      transform: (ctx) => ctx.code.toUpperCase(),
    };
    const out = await run(processor, input, join(dir, 'out/styles.css'));
    expect(out).toBe('.A{}');
  });

  it('leaves CSS untouched when a transform returns nothing', async () => {
    const input = write('src/styles.css', '.keep{}');
    const processor: CssProcessor = { name: 'noop', transform: () => undefined };
    const out = await run(processor, input, join(dir, 'out/styles.css'));
    expect(out).toBe('.keep{}');
  });

  it('hands the transform the resolved context', async () => {
    const input = write('src/styles.css', 'x');
    let seen: CssTransformContext | undefined;
    const processor: CssProcessor = {
      name: 'spy',
      transform: (ctx) => { seen = ctx; return ctx.code; },
    };
    await run(processor, input, join(dir, 'out/styles.css'));
    expect(seen).toMatchObject({ code: 'x', file: input, dev: true, root: dir });
  });

  it('runs a CLI command in stdin→stdout mode (no {output})', async () => {
    const input = write('src/styles.css', 'hello world');
    const processor: CssProcessor = { name: 'cat', command: 'cat' };
    const out = await run(processor, input, join(dir, 'out/styles.css'));
    expect(out).toBe('hello world');
  });

  it('runs a CLI command and post-processes with a transform', async () => {
    const input = write('src/styles.css', 'abc');
    const processor: CssProcessor = {
      name: 'cat+upper',
      command: 'cat',
      transform: (ctx) => ctx.code.toUpperCase(),
    };
    const out = await run(processor, input, join(dir, 'out/styles.css'));
    expect(out).toBe('ABC');
  });

  it('falls back to the source when a CLI command fails', async () => {
    const input = write('src/styles.css', 'original');
    const processor: CssProcessor = { name: 'broken', command: 'false' };
    const out = await run(processor, input, join(dir, 'out/styles.css'));
    expect(out).toBe('original');
  });
});

describe('onCssTransform plugin chain', () => {
  const baseCtx = {
    config: { browsers: ['chrome'] } as any,
    paths: { root: '/p', src: '/p/src', dist: '/p/dist' },
    logger: log,
    addEntry: () => {},
    emitFile: () => {},
  };
  const ctx: CssTransformContext = {
    code: '.a{}', file: '/p/src/a.css', outFile: '/p/dist/a.css', root: '/p', srcDir: '/p/src', dev: false,
  };

  it('chains every hook, feeding the previous output forward', async () => {
    const a: ExtForgePluginV1 = { name: 'a', apiVersion: 1, setup({ hooks }) { hooks.onCssTransform((c) => c.code + '/*a*/'); } };
    const b: ExtForgePluginV1 = { name: 'b', apiVersion: 1, setup({ hooks }) { hooks.onCssTransform((c) => c.code + '/*b*/'); } };
    const r = new PluginRunner([a, b], baseCtx);
    await r.setup();
    expect(await r.fireCssTransform(ctx)).toBe('.a{}/*a*//*b*/');
  });

  it('treats a non-string return as "no change"', async () => {
    const a: ExtForgePluginV1 = { name: 'a', apiVersion: 1, setup({ hooks }) { hooks.onCssTransform(() => undefined); } };
    const r = new PluginRunner([a], baseCtx);
    await r.setup();
    expect(await r.fireCssTransform(ctx)).toBe('.a{}');
  });

  it('returns the source unchanged with no hooks registered', async () => {
    const r = new PluginRunner([], baseCtx);
    await r.setup();
    expect(await r.fireCssTransform(ctx)).toBe('.a{}');
  });
});
