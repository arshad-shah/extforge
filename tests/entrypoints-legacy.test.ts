import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { build, buildContentScriptMap, createBuildContext } from '../src/core/builder/index.js';
import type { ExtForgeConfig } from '../src/core/config.js';
import { discoverLegacyEntrypoints } from '../src/core/entrypoints/index.js';
import { createLogger, LogLevel } from '../src/core/logger/index.js';

const silent = createLogger({ level: LogLevel.Silent });

function write(root: string, rel: string, body = 'console.log(1);\n'): void {
  mkdirSync(join(root, rel, '..'), { recursive: true });
  writeFileSync(join(root, rel), body);
}

describe('discoverLegacyEntrypoints', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'extforge-ep-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('finds every legacy entry with its kind and format', () => {
    write(root, 'src/background/index.ts');
    write(root, 'src/content.ts');
    write(root, 'src/ui/popup/index.tsx');
    write(root, 'src/ui/options/index.ts');
    write(root, 'src/injected/hook.ts');
    write(
      root,
      'src/contents/widget.csui.tsx',
      "export default defineCSUI({ matches: ['https://a.com/*'] }, () => null);\n",
    );

    const found = discoverLegacyEntrypoints(join(root, 'src'), silent).map((e) => [
      e.name,
      e.kind,
      e.format,
    ]);
    expect(found).toEqual([
      ['background/index', 'background', 'esm'],
      ['content/index', 'content', 'iife'],
      ['contents/widget', 'csui', 'iife'],
      ['injected/hook', 'injected', 'iife'],
      ['ui/options/index', 'options', 'esm'],
      ['ui/popup/index', 'popup', 'esm'],
    ]);
  });

  it('returns nothing for an empty src/', () => {
    mkdirSync(join(root, 'src'));
    expect(discoverLegacyEntrypoints(join(root, 'src'), silent)).toEqual([]);
  });
});

describe('content-script ids for targeted HMR', () => {
  let root: string;
  const config: ExtForgeConfig = {
    browsers: ['chrome'],
    manifest: {
      name: 'X',
      version: '0.0.1',
      description: 'x',
      manifestVersion: 3,
      permissions: { required: [], optional: [], host: [] },
      background: { entrypoint: 'background/index.js' },
      // Real configs name the built file, not the source.
      contentScripts: [{ matches: ['<all_urls>'], js: ['content/index.js'] }],
    },
  };
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'extforge-csid-'));
    write(root, 'src/background/index.ts');
    write(root, 'src/content/index.ts');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('maps a dist path in contentScripts[].js to the source file that produces it', () => {
    const map = buildContentScriptMap(root, config);
    expect(map.get(join(root, 'src/content/index.ts'))).toBe(0);
  });

  it('still accepts source paths in contentScripts[].js', () => {
    const map = buildContentScriptMap(root, {
      ...config,
      manifest: {
        ...config.manifest!,
        contentScripts: [{ matches: ['<all_urls>'], js: ['src/content/index.ts'] }],
      },
    });
    expect(map.get(join(root, 'src/content/index.ts'))).toBe(0);
  });

  it('assigns the script id in a real dev build', async () => {
    await build(root, config, { browser: 'chrome', dev: true, hmrPort: 35999 }, silent);
    const out = readFileSync(join(root, 'dist/chrome/content/index.js'), 'utf8');
    expect(out).toMatch(/globalThis\.__EXTFORGE_SCRIPT_ID__ = 0;/);
  });

  it('keeps content scripts out of the incremental dev context, which would rebuild them as ESM', async () => {
    const ctx = await createBuildContext(root, config, { browser: 'chrome', dev: true }, silent);
    try {
      await ctx.rebuild();
    } finally {
      await ctx.dispose();
    }
    expect(existsSync(join(root, 'dist/chrome/background/index.js'))).toBe(true);
    expect(existsSync(join(root, 'dist/chrome/content/index.js'))).toBe(false);
  });
});
