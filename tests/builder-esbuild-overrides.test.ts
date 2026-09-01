import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyEsbuildOverrides,
  collectReservedEsbuildKeys,
} from '../src/core/builder/esbuild-overrides.js';
import { build } from '../src/core/builder/index.js';
import type { ExtForgeConfig } from '../src/core/config.js';
import { createLogger, LogLevel } from '../src/core/logger/index.js';

const silent = createLogger({ level: LogLevel.Silent });

const baseManifest = {
  name: 'TestExt',
  version: '0.0.1',
  description: 'test',
  manifestVersion: 3 as const,
  permissions: { required: [], optional: [], host: [] },
};

function makeProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'extforge-esbo-'));
  mkdirSync(join(root, 'src/background'), { recursive: true });
  writeFileSync(join(root, 'package.json'), '{}');
  writeFileSync(join(root, 'tsconfig.json'), '{}');
  writeFileSync(join(root, 'extforge.config.ts'), 'export default {}');
  return root;
}

describe('applyEsbuildOverrides', () => {
  it('returns the base untouched when the project declared no overrides', () => {
    const base = { bundle: true, target: ['chrome120'] };
    expect(applyEsbuildOverrides(base, undefined)).toBe(base);
  });

  it('merges `loader` key-by-key instead of replacing the built-in map', () => {
    const base = { loader: { '.ts': 'ts', '.css': 'css', '.png': 'dataurl' } } as const;
    const merged = applyEsbuildOverrides({ ...base }, { loader: { '.css': 'text' } });
    expect(merged.loader).toEqual({ '.ts': 'ts', '.css': 'text', '.png': 'dataurl' });
  });

  it('merges `define` and `alias` the same way', () => {
    const merged = applyEsbuildOverrides(
      { define: { __DEV__: 'false' }, alias: { '@': '/src' } },
      { define: { API: '"x"' }, alias: { '~': '/lib' } },
    );
    expect(merged.define).toEqual({ __DEV__: 'false', API: '"x"' });
    expect(merged.alias).toEqual({ '@': '/src', '~': '/lib' });
  });

  it('replaces non-record options', () => {
    const merged = applyEsbuildOverrides(
      { target: ['chrome120'], minify: true },
      {
        target: ['chrome131'],
        minify: false,
      },
    );
    expect(merged.target).toEqual(['chrome131']);
    expect(merged.minify).toBe(false);
  });

  it('appends project plugins after the builder’s own', () => {
    const builtin = { name: 'builtin', setup() {} };
    const user = { name: 'user', setup() {} };
    const merged = applyEsbuildOverrides({ plugins: [builtin] }, { plugins: [user] });
    expect(merged.plugins?.map((p) => p.name)).toEqual(['builtin', 'user']);
  });

  it('drops builder-owned options rather than honouring them', () => {
    const base = { format: 'iife' as const, metafile: true, outdir: '/dist' };
    const merged = applyEsbuildOverrides(base, {
      format: 'esm',
      metafile: false,
      outdir: '/elsewhere',
      entryPoints: { evil: '/tmp/evil.ts' },
    });
    expect(merged.format).toBe('iife');
    expect(merged.metafile).toBe(true);
    expect(merged.outdir).toBe('/dist');
    expect(merged.entryPoints).toBeUndefined();
  });

  it('does not mutate the base options', () => {
    const base = { loader: { '.css': 'css' } } as const;
    const snapshot = structuredClone(base);
    applyEsbuildOverrides({ ...base }, { loader: { '.css': 'text' } });
    expect(base).toEqual(snapshot);
  });
});

describe('collectReservedEsbuildKeys', () => {
  it('is empty for no overrides and for overrides the project owns', () => {
    expect(collectReservedEsbuildKeys(undefined)).toEqual([]);
    expect(collectReservedEsbuildKeys({ loader: { '.css': 'text' }, target: ['esnext'] })).toEqual(
      [],
    );
  });

  it('names every builder-owned option, in declaration order', () => {
    expect(collectReservedEsbuildKeys({ format: 'esm', loader: {}, metafile: false })).toEqual([
      'format',
      'metafile',
    ]);
  });
});

describe('build() honours config.build.esbuild', () => {
  let root: string;

  beforeEach(() => {
    root = makeProject();
  });
  afterEach(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {}
  });

  // Regression: `build.esbuild` was accepted by the config schema and published
  // in the generated config reference, but the builder never read it. This
  // fails on the previous code, where the `.css` loader stayed `css` and the
  // stylesheet was emitted as a sibling file instead of inlined as a string.
  it('applies a `loader` override to a real build', async () => {
    writeFileSync(join(root, 'src/background/sheet.css'), '.probe{color:red}\n');
    writeFileSync(
      join(root, 'src/background/index.ts'),
      "import sheet from './sheet.css';\nexport const start = () => sheet;\n",
    );
    const cfg: ExtForgeConfig = {
      browsers: ['chrome'],
      build: { esbuild: { loader: { '.css': 'text' } } },
      manifest: { ...baseManifest, background: { entrypoint: 'background/index.js' } },
    };

    await build(root, cfg, { browser: 'chrome', dev: false }, silent);

    const bundle = readFileSync(join(root, 'dist/chrome/background/index.js'), 'utf8');
    expect(bundle).toContain('.probe{color:red}');
  });

  it('keeps the built-in loaders that the override did not name', async () => {
    writeFileSync(join(root, 'src/background/sheet.css'), '.probe{color:red}\n');
    writeFileSync(
      join(root, 'src/background/index.ts'),
      "import sheet from './sheet.css';\nexport const start = (): string => sheet;\n",
    );
    const cfg: ExtForgeConfig = {
      browsers: ['chrome'],
      build: { esbuild: { loader: { '.css': 'text' } } },
      manifest: { ...baseManifest, background: { entrypoint: 'background/index.js' } },
    };

    // The `.ts` loader is not named by the override; if the record had been
    // replaced wholesale, esbuild could not parse the TypeScript annotation
    // above and the build would throw.
    await expect(
      build(root, cfg, { browser: 'chrome', dev: false }, silent),
    ).resolves.toBeDefined();
  });

  it('ignores a builder-owned option instead of breaking the output format', async () => {
    writeFileSync(join(root, 'src/background/index.ts'), 'export const start = () => 1;\n');
    const cfg: ExtForgeConfig = {
      browsers: ['chrome'],
      build: { esbuild: { outdir: join(root, 'hijacked') } },
      manifest: { ...baseManifest, background: { entrypoint: 'background/index.js' } },
    };

    await build(root, cfg, { browser: 'chrome', dev: false }, silent);

    const manifest = JSON.parse(readFileSync(join(root, 'dist/chrome/manifest.json'), 'utf8'));
    expect(manifest.name).toBe('TestExt');
  });
});
