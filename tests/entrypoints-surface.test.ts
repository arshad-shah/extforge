import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { build } from '../src/core/builder/index.js';
import type { ExtForgeConfig } from '../src/core/config.js';
import { discoverEntrypoints, unsupportedEntries } from '../src/core/entrypoints/discover.js';
import { ExtForgeError } from '../src/core/errors/index.js';
import { createLogger, LogLevel } from '../src/core/logger/index.js';
import { generateManifest } from '../src/core/manifest/generator.js';

const silent = createLogger({ level: LogLevel.Silent });

function write(root: string, rel: string, body: string): void {
  mkdirSync(join(root, rel, '..'), { recursive: true });
  writeFileSync(join(root, rel), body);
}
const page = (script: string) =>
  `<!doctype html><html><body><script type="module" src="${script}"></script></body></html>`;

/** One of every phase-3 kind. */
function makeProject(root: string): void {
  write(root, 'src/background.ts', 'console.log("bg");\n');
  write(root, 'src/devtools.html', page('./devtools.ts'));
  write(root, 'src/devtools.ts', 'console.log("devtools");\n');
  write(root, 'src/newtab/index.html', page('./main.ts'));
  write(root, 'src/newtab/main.ts', 'console.log("newtab");\n');
  write(root, 'src/offscreen.html', page('./offscreen.ts'));
  write(root, 'src/offscreen.ts', 'console.log("offscreen");\n');
  write(root, 'src/audio.offscreen.html', page('./audio.ts'));
  write(root, 'src/audio.ts', 'console.log("audio");\n');
  write(root, 'src/frame.sandbox.html', '<!doctype html><p>sandboxed</p>');
  write(root, 'src/welcome.html', page('./welcome.ts'));
  write(root, 'src/welcome.ts', 'console.log("welcome");\n');
  write(
    root,
    'src/widget.csui.tsx',
    "export default defineCSUI({ matches: ['https://example.com/*'] }, () => null);\n",
  );
  write(root, 'src/hook.injected.ts', 'console.log("page world");\n');
  write(root, 'src/scrape.unlisted.ts', 'console.log("unlisted");\n');
}

const manifest = {
  name: 'Surface',
  version: '0.0.1',
  description: 'test',
  manifestVersion: 3 as const,
  permissions: { required: [], optional: [], host: [] },
};
const config: ExtForgeConfig = { browsers: ['chrome', 'firefox'], manifest };

describe('phase 3 discovery', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'extforge-surface-'));
    makeProject(root);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('finds every kind with its output name', () => {
    const found = discoverEntrypoints(join(root, 'src'), silent).map((e) => [
      e.name,
      e.kind,
      e.format,
    ]);
    expect(found).toEqual([
      ['audio', 'offscreen', 'esm'],
      ['background', 'background', 'esm'],
      ['content-scripts/widget', 'csui', 'iife'],
      ['devtools', 'devtools', 'esm'],
      ['frame', 'sandbox', 'esm'],
      ['injected/hook', 'injected', 'iife'],
      ['newtab', 'newtab', 'esm'],
      ['offscreen', 'offscreen', 'esm'],
      ['scrape', 'unlisted', 'iife'],
      ['welcome', 'page', 'esm'],
    ]);
  });

  it('refuses two entries that would write the same file', () => {
    write(root, 'src/welcome.unlisted.ts', 'console.log(1);\n');
    expect(() => discoverEntrypoints(join(root, 'src'), silent)).toThrow(
      /would both be built to welcome\.js/,
    );
  });

  it('flags entries a browser cannot use', () => {
    write(root, 'src/history.html', page('./welcome.ts'));
    const eps = discoverEntrypoints(join(root, 'src'), silent);
    const firefox = unsupportedEntries(eps, 'firefox').join('\n');
    expect(firefox).toMatch(/history\.html: firefox doesn't support overriding the history page/);
    expect(firefox).toMatch(/frame\.html: firefox doesn't support manifest sandbox pages/);
    expect(firefox).toMatch(/offscreen\.html: firefox has no chrome\.offscreen API/);
    expect(unsupportedEntries(eps, 'chrome')).toEqual([]);
  });
});

describe('phase 3 builds', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'extforge-surfaceb-'));
    makeProject(root);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('fills devtools, the override, sandbox, CSUI and injected scripts into the Chrome manifest', async () => {
    await build(root, config, { browser: 'chrome', dev: false }, silent);
    const out = join(root, 'dist/chrome');
    const m = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
    expect(m.devtools_page).toBe('devtools.html');
    expect(m.chrome_url_overrides).toEqual({ newtab: 'newtab.html' });
    expect(m.sandbox).toEqual({ pages: ['frame.html'] });
    expect(m.content_scripts.map((c: { js: string[] }) => c.js)).toEqual([
      ['content-scripts/widget.js'],
    ]);
    expect(JSON.stringify(m.web_accessible_resources)).toContain('injected/hook.js');
    for (const f of [
      'devtools.html',
      'devtools.js',
      'newtab.html',
      'newtab.js',
      'offscreen.html',
      'audio.html',
      'frame.html',
      'welcome.html',
      'welcome.js',
      'content-scripts/widget.js',
      'injected/hook.js',
      'scrape.js',
    ]) {
      expect(existsSync(join(out, f)), f).toBe(true);
    }
    // Unlisted entries have no manifest key.
    expect(JSON.stringify(m)).not.toMatch(/scrape|welcome|audio|offscreen/);
  });

  it('builds unlisted scripts as classic scripts', async () => {
    await build(root, config, { browser: 'chrome', dev: false }, silent);
    const code = readFileSync(join(root, 'dist/chrome/scrape.js'), 'utf8');
    expect(code).not.toMatch(/^\s*(import|export)\b/m);
  });

  it('leaves out what Firefox cannot use', async () => {
    await build(root, config, { browser: 'firefox', dev: false }, silent);
    const m = JSON.parse(readFileSync(join(root, 'dist/firefox/manifest.json'), 'utf8'));
    expect(m.sandbox).toBeUndefined();
    expect(m.chrome_url_overrides).toEqual({ newtab: 'newtab.html' });
    expect(m.devtools_page).toBe('devtools.html');
  });

  it('fails when more than one browser page is overridden', async () => {
    write(root, 'src/history.html', page('./welcome.ts'));
    const err = await build(root, config, { browser: 'chrome', dev: false }, silent).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ExtForgeError);
    expect((err as Error).message).toMatch(
      /override only one browser page.*history\.html and newtab\.html/,
    );
  });
});

describe('manifest fields for hand-written configs', () => {
  it('emits devtools_page, filters overrides per browser and keeps sandbox to Chromium', () => {
    const cfg = {
      ...manifest,
      devtoolsPage: 'devtools.html',
      chromeUrlOverrides: { history: 'history.html' },
      sandbox: { pages: ['frame.html'] },
    };
    const chrome = generateManifest(cfg, 'chrome');
    expect(chrome.devtools_page).toBe('devtools.html');
    expect(chrome.chrome_url_overrides).toEqual({ history: 'history.html' });
    expect(chrome.sandbox).toEqual({ pages: ['frame.html'] });
    const firefox = generateManifest(cfg, 'firefox');
    expect(firefox.chrome_url_overrides).toBeUndefined();
    expect(firefox.sandbox).toBeUndefined();
  });
});
