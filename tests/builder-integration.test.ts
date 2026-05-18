import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, buildAll } from '../src/core/builder/index.js';
import type { ExtForgeConfig } from '../src/core/config.js';
import { createLogger, LogLevel } from '../src/core/logger/index.js';

const silent = createLogger({ level: LogLevel.Silent });

function makeProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'extforge-bi-'));
  mkdirSync(join(root, 'src/background'), { recursive: true });
  writeFileSync(join(root, 'src/background/index.ts'),
    'export const start = () => 1;\n');
  // validateProject (used by buildAll) requires these files at the root.
  writeFileSync(join(root, 'package.json'), '{}');
  writeFileSync(join(root, 'tsconfig.json'), '{}');
  writeFileSync(join(root, 'extforge.config.ts'), 'export default {}');
  return root;
}

const baseManifest = {
  name: 'TestExt',
  version: '0.0.1',
  description: 'test',
  manifestVersion: 3 as const,
  permissions: { required: [], optional: [], host: [] },
};

describe('builder.build', () => {
  let root: string;

  beforeEach(() => { root = makeProject(); });
  afterEach(() => { try { rmSync(root, { recursive: true, force: true }); } catch {} });

  it('emits a manifest.json under dist/<browser>/ with the configured name', async () => {
    const cfg: ExtForgeConfig = {
      browsers: ['chrome'],
      manifest: { ...baseManifest, background: { entrypoint: 'background/index.js' } },
    };
    await build(root, cfg, { browser: 'chrome', dev: false }, silent);
    const manifest = JSON.parse(readFileSync(join(root, 'dist/chrome/manifest.json'), 'utf8'));
    expect(manifest.name).toBe('TestExt');
    expect(manifest.background).toBeDefined();
  });

  it('uses browser_specific_settings for firefox', async () => {
    const cfg: ExtForgeConfig = {
      browsers: ['firefox'],
      manifest: { ...baseManifest, background: { entrypoint: 'background/index.js' } },
    };
    await build(root, cfg, { browser: 'firefox', dev: false }, silent);
    const manifest = JSON.parse(readFileSync(join(root, 'dist/firefox/manifest.json'), 'utf8'));
    expect(manifest.browser_specific_settings).toBeDefined();
  });

  it('copies HTML when src/ui/popup/index.html exists', async () => {
    mkdirSync(join(root, 'src/ui/popup'), { recursive: true });
    writeFileSync(join(root, 'src/ui/popup/index.html'),
      '<!doctype html><html><body><div id="root"></div><script type="module" src="./index.js"></script></body></html>');
    writeFileSync(join(root, 'src/ui/popup/index.ts'),
      'document.querySelector("#root")!.textContent = "hi";');
    const cfg: ExtForgeConfig = {
      browsers: ['chrome'],
      manifest: { ...baseManifest, action: { defaultPopup: 'ui/popup/index.html' } },
    };
    await build(root, cfg, { browser: 'chrome', dev: false }, silent);
    expect(existsSync(join(root, 'dist/chrome/ui/popup/index.html'))).toBe(true);
  });

  it('discovers injected scripts under src/injected/', async () => {
    mkdirSync(join(root, 'src/injected'), { recursive: true });
    writeFileSync(join(root, 'src/injected/probe.ts'), 'console.log("hi");');
    const cfg: ExtForgeConfig = {
      browsers: ['chrome'],
      manifest: { ...baseManifest, background: { entrypoint: 'background/index.js' } },
    };
    await build(root, cfg, { browser: 'chrome', dev: false }, silent);
    expect(existsSync(join(root, 'dist/chrome/injected/probe.js'))).toBe(true);
  });

  it('includes the HMR client banner in dev mode', async () => {
    const cfg: ExtForgeConfig = {
      browsers: ['chrome'],
      manifest: { ...baseManifest, background: { entrypoint: 'background/index.js' } },
    };
    await build(root, cfg, { browser: 'chrome', dev: true, hmrPort: 35729, hmrHost: 'localhost' }, silent);
    const bundled = readFileSync(join(root, 'dist/chrome/background/index.js'), 'utf8');
    // The HMR client connects via WebSocket to the configured port.
    expect(bundled).toContain('35729');
    expect(bundled).toContain('ws://localhost');
  });

  it('does NOT include the HMR client in production builds', async () => {
    const cfg: ExtForgeConfig = {
      browsers: ['chrome'],
      manifest: { ...baseManifest, background: { entrypoint: 'background/index.js' } },
    };
    await build(root, cfg, { browser: 'chrome', dev: false }, silent);
    const bundled = readFileSync(join(root, 'dist/chrome/background/index.js'), 'utf8');
    expect(bundled).not.toContain('ws://localhost');
  });
});

describe('builder.build content scripts and CSUI', () => {
  let root: string;
  beforeEach(() => { root = makeProject(); });
  afterEach(() => { try { rmSync(root, { recursive: true, force: true }); } catch {} });

  it('emits a content-script IIFE bundle', async () => {
    mkdirSync(join(root, 'src/content'), { recursive: true });
    writeFileSync(join(root, 'src/content/index.ts'),
      'console.log("content script");');
    const cfg: ExtForgeConfig = {
      browsers: ['chrome'],
      manifest: {
        ...baseManifest,
        background: { entrypoint: 'background/index.js' },
        contentScripts: [{ matches: ['<all_urls>'], js: ['content/index.js'] }],
      },
    };
    await build(root, cfg, { browser: 'chrome', dev: false }, silent);
    const bundled = readFileSync(join(root, 'dist/chrome/content/index.js'), 'utf8');
    // IIFE format wraps in a self-invoking function.
    expect(bundled).toMatch(/\(\(\)\s*=>/);
  });

  it('auto-discovers src/contents/*.csui.tsx and writes a content_scripts entry', async () => {
    mkdirSync(join(root, 'src/contents'), { recursive: true });
    // Use a plain function shape so the bundler doesn't need to resolve
    // `extforge/csui` from the temp project. The discovery scan only
    // reads source text for the `matches: [...]` shape.
    // The discovery scanner reads source text for `defineCSUI({ matches: [...] })`.
    // Real projects import defineCSUI from extforge/csui; for this test we
    // stub the package locally so esbuild can resolve it.
    mkdirSync(join(root, 'node_modules/extforge'), { recursive: true });
    writeFileSync(join(root, 'node_modules/extforge/package.json'), JSON.stringify({
      name: 'extforge',
      type: 'module',
      exports: { './csui': './csui.js' },
    }));
    writeFileSync(join(root, 'node_modules/extforge/csui.js'),
      'export function defineCSUI(options, render) { return { options, render }; }\n');
    writeFileSync(join(root, 'src/contents/widget.csui.tsx'),
      "import { defineCSUI } from 'extforge/csui';\n" +
      "export default defineCSUI({ matches: ['*://*/*'] }, () => {});\n");
    const cfg: ExtForgeConfig = {
      browsers: ['chrome'],
      manifest: { ...baseManifest, background: { entrypoint: 'background/index.js' } },
    };
    await build(root, cfg, { browser: 'chrome', dev: false }, silent);
    const manifest = JSON.parse(readFileSync(join(root, 'dist/chrome/manifest.json'), 'utf8'));
    expect(manifest.content_scripts).toBeDefined();
    expect(manifest.content_scripts).toContainEqual(expect.objectContaining({
      matches: ['*://*/*'],
      js: ['contents/widget.js'],
    }));
  });

  it('honors sourcemap=true on a production build', async () => {
    const cfg: ExtForgeConfig = {
      browsers: ['chrome'],
      manifest: { ...baseManifest, background: { entrypoint: 'background/index.js' } },
    };
    await build(root, cfg, { browser: 'chrome', dev: false, sourcemap: true }, silent);
    const bundled = readFileSync(join(root, 'dist/chrome/background/index.js'), 'utf8');
    expect(bundled).toContain('sourceMappingURL');
  });
});

describe('builder.buildAll', () => {
  let root: string;

  beforeEach(() => { root = makeProject(); });
  afterEach(() => { try { rmSync(root, { recursive: true, force: true }); } catch {} });

  it('builds every browser in config.browsers in sequence', async () => {
    const cfg: ExtForgeConfig = {
      browsers: ['chrome', 'firefox'],
      manifest: { ...baseManifest, background: { entrypoint: 'background/index.js' } },
    };
    const results = await buildAll(root, cfg, { dev: false }, silent);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.errors.length === 0)).toBe(true);
    expect(existsSync(join(root, 'dist/chrome/manifest.json'))).toBe(true);
    expect(existsSync(join(root, 'dist/firefox/manifest.json'))).toBe(true);
  });
});
