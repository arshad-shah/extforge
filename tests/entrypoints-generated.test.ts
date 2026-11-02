import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { build } from '../src/core/builder/index.js';
import type { ExtForgeConfig } from '../src/core/config.js';
import { discoverEntrypoints, usesLegacyLayout } from '../src/core/entrypoints/discover.js';
import { ExtForgeError } from '../src/core/errors/index.js';
import { createLogger, LogLevel } from '../src/core/logger/index.js';

const silent = createLogger({ level: LogLevel.Silent });
const defineImport = `import { defineContentScript } from '${join(process.cwd(), 'src/core/entrypoints/define.ts')}';`;

function write(root: string, rel: string, body: string): void {
  mkdirSync(join(root, rel, '..'), { recursive: true });
  writeFileSync(join(root, rel), body);
}

const page = (script: string) =>
  `<!doctype html><html><body><div id="root"></div><script type="module" src="${script}"></script></body></html>`;

/** A project in the new layout: entries named in src/, no entry paths in the config. */
function makeProject(root: string): void {
  write(root, 'src/background.ts', 'console.log("bg");\n');
  write(root, 'src/popup.html', page('./popup.ts'));
  write(root, 'src/popup.ts', 'document.title = "popup";\n');
  write(root, 'src/options/index.html', page('./main.ts'));
  write(root, 'src/options/main.ts', 'document.title = "options";\n');
  write(
    root,
    'src/youtube.content.ts',
    `${defineImport}
export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  runAt: 'document_start',
  main() { (globalThis as any).__ran = 'youtube'; },
});
`,
  );
  write(root, 'src/lib/index.ts', 'export const shared = 1;\n');
  write(root, 'src/lib/page.html', '<p>not an entry</p>');
}

const manifest = {
  name: 'Gen',
  version: '0.0.1',
  description: 'test',
  manifestVersion: 3 as const,
  permissions: { required: [], optional: [], host: [] },
};

describe('generated-mode discovery', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'extforge-gen-'));
    makeProject(root);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('finds entries by reserved name and suffix, and nothing else', () => {
    const found = discoverEntrypoints(join(root, 'src'), silent).map((e) => [
      e.name,
      e.kind,
      e.format,
    ]);
    expect(found).toEqual([
      ['background', 'background', 'esm'],
      ['content-scripts/youtube', 'content', 'iife'],
      ['options', 'options', 'esm'],
      ['popup', 'popup', 'esm'],
    ]);
  });

  it('reads defineContentScript options statically', () => {
    const yt = discoverEntrypoints(join(root, 'src'), silent).find((e) => e.kind === 'content');
    expect(yt?.contentScript).toMatchObject({
      matches: ['*://*.youtube.com/*'],
      runAt: 'document_start',
    });
  });

  it('refuses two files for one entry', () => {
    write(root, 'src/popup/index.html', page('./x.ts'));
    expect(() => discoverEntrypoints(join(root, 'src'), silent)).toThrow(
      /Two files define the popup entrypoint: popup\.html and popup\/index\.html/,
    );
  });
});

describe('usesLegacyLayout', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'extforge-mode-'));
    mkdirSync(join(root, 'src'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('is legacy when the config hand-writes entry paths', () => {
    expect(
      usesLegacyLayout(
        { ...manifest, background: { entrypoint: 'background/index.js' } },
        join(root, 'src'),
      ),
    ).toBe(true);
    expect(
      usesLegacyLayout(
        { ...manifest, contentScripts: [{ matches: ['<all_urls>'], js: ['content/index.js'] }] },
        join(root, 'src'),
      ),
    ).toBe(true);
  });

  it('is legacy when a legacy-only folder exists, even without entry paths', () => {
    mkdirSync(join(root, 'src/ui/popup'), { recursive: true });
    expect(usesLegacyLayout(manifest, join(root, 'src'))).toBe(true);
  });

  it('is generated otherwise', () => {
    expect(usesLegacyLayout(manifest, join(root, 'src'))).toBe(false);
  });
});

describe('generated-mode build', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'extforge-genb-'));
    makeProject(root);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const config: ExtForgeConfig = { browsers: ['chrome', 'firefox'], manifest };

  it('writes flat outputs and fills the manifest from what it found', async () => {
    await build(root, config, { browser: 'chrome', dev: false }, silent);
    const out = join(root, 'dist/chrome');
    const m = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));

    expect(m.background).toEqual({ service_worker: 'background.js', type: 'module' });
    expect(m.action.default_popup).toBe('popup.html');
    expect(m.options_page).toBe('options.html');
    expect(m.content_scripts).toEqual([
      {
        matches: ['*://*.youtube.com/*'],
        js: ['content-scripts/youtube.js'],
        run_at: 'document_start',
      },
    ]);
    for (const f of [
      'background.js',
      'popup.html',
      'popup.js',
      'options.html',
      'options.js',
      'content-scripts/youtube.js',
    ]) {
      expect(existsSync(join(out, f)), f).toBe(true);
    }
    expect(existsSync(join(out, 'lib'))).toBe(false);
  });

  it('points each page at its built script', async () => {
    await build(root, config, { browser: 'chrome', dev: false }, silent);
    const html = readFileSync(join(root, 'dist/chrome/options.html'), 'utf8');
    expect(html).toContain('src="./options.js"');
    expect(html).not.toContain('main.ts');
  });

  it('runs main() from defineContentScript when the content script loads', async () => {
    await build(root, config, { browser: 'chrome', dev: false }, silent);
    const code = readFileSync(join(root, 'dist/chrome/content-scripts/youtube.js'), 'utf8');
    const sandbox: Record<string, unknown> = {};
    sandbox.globalThis = sandbox;
    runInNewContext(code, sandbox);
    expect(sandbox.__ran).toBe('youtube');
  });

  it('uses the per-browser manifest rules (Firefox background scripts, options_ui)', async () => {
    await build(root, config, { browser: 'firefox', dev: false }, silent);
    const m = JSON.parse(readFileSync(join(root, 'dist/firefox/manifest.json'), 'utf8'));
    expect(m.background.scripts).toEqual(['background.js']);
    expect(m.options_ui.page).toBe('options.html');
  });

  it('warns and leaves out a content script without matches, but still builds it', async () => {
    write(
      root,
      'src/nomatch.content.ts',
      `${defineImport}\nexport default defineContentScript({ main() {} } as any);\n`,
    );
    const warnings: string[] = [];
    const log = createLogger({
      level: LogLevel.Warn,
      silentHumanOutput: true,
      transports: [(entry) => warnings.push(String(entry.message))],
    });
    await build(root, config, { browser: 'chrome', dev: false }, log);
    const m = JSON.parse(readFileSync(join(root, 'dist/chrome/manifest.json'), 'utf8'));
    expect(m.content_scripts.map((c: { js: string[] }) => c.js[0])).toEqual([
      'content-scripts/youtube.js',
    ]);
    expect(existsSync(join(root, 'dist/chrome/content-scripts/nomatch.js'))).toBe(true);
    expect(warnings.some((w) => /content-scripts\/nomatch: no `matches`/.test(w))).toBe(true);
  });

  it('turns a discovery conflict into a build error', async () => {
    write(root, 'src/popup/index.html', page('./x.ts'));
    await expect(
      build(root, config, { browser: 'chrome', dev: false }, silent),
    ).rejects.toBeInstanceOf(ExtForgeError);
  });

  it('leaves a legacy project exactly as before', async () => {
    const legacy = mkdtempSync(join(tmpdir(), 'extforge-leg-'));
    try {
      write(legacy, 'src/background/index.ts', 'console.log(1);\n');
      write(legacy, 'src/ui/popup/index.ts', 'console.log(2);\n');
      write(legacy, 'src/ui/popup/index.html', page('./index.js'));
      await build(
        legacy,
        { browsers: ['chrome'], manifest },
        { browser: 'chrome', dev: false },
        silent,
      );
      expect(existsSync(join(legacy, 'dist/chrome/ui/popup/index.js'))).toBe(true);
      expect(existsSync(join(legacy, 'dist/chrome/ui/popup/index.html'))).toBe(true);
      expect(existsSync(join(legacy, 'dist/chrome/popup.html'))).toBe(false);
    } finally {
      rmSync(legacy, { recursive: true, force: true });
    }
  });
});

describe('validator with named entrypoints', () => {
  it('does not report NO_ENTRYPOINTS for a popup-only new-layout project', async () => {
    const { validateProject } = await import('../src/core/validator/index.js');
    const root = mkdtempSync(join(tmpdir(), 'extforge-val-'));
    try {
      write(root, 'src/popup.html', page('./popup.ts'));
      write(root, 'src/popup.ts', 'console.log(1);\n');
      const result = validateProject(root, silent);
      expect(result.issues.map((i) => i.code)).not.toContain('NO_ENTRYPOINTS');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('page stylesheet links', () => {
  it('rewrites a relative link into src/ to the same path under the output root', async () => {
    const { rewritePageHtml } = await import('../src/core/entrypoints/discover.js');
    const src = '/p/src';
    const html =
      '<link rel="stylesheet" href="../styles/globals.css"><link href="https://cdn/x.css" rel="stylesheet"><link rel="icon" href="../../outside.png">';
    expect(rewritePageHtml(html, [], { htmlPath: '/p/src/popup/index.html', srcDir: src })).toBe(
      '<link rel="stylesheet" href="./styles/globals.css"><link href="https://cdn/x.css" rel="stylesheet"><link rel="icon" href="../../outside.png">',
    );
    expect(
      rewritePageHtml('<link rel="stylesheet" href="./styles/a.css">', [], {
        htmlPath: '/p/src/popup.html',
        srcDir: src,
      }),
    ).toBe('<link rel="stylesheet" href="./styles/a.css">');
  });
});
