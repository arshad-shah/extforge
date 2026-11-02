import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { build, buildContentScriptMap, createBuildContext } from '../src/core/builder/index.js';
import type { ExtForgeConfig } from '../src/core/config.js';
import { discoverEntrypoints, fastRefreshTargets } from '../src/core/entrypoints/discover.js';
import { createLogger, LogLevel } from '../src/core/logger/index.js';

const silent = createLogger({ level: LogLevel.Silent });
const defineImport = `import { defineContentScript } from '${join(process.cwd(), 'src/core/entrypoints/define.ts')}';`;

function write(root: string, rel: string, body: string): void {
  mkdirSync(join(root, rel, '..'), { recursive: true });
  writeFileSync(join(root, rel), body);
}
const page = (script: string) =>
  `<!doctype html><html><body><script type="module" src="${script}"></script></body></html>`;

function makeProject(root: string): void {
  write(root, 'src/background.ts', 'console.log("bg");\n');
  write(root, 'src/popup.html', page('./popup.ts'));
  write(root, 'src/popup.ts', 'import { shared } from "./lib/shared";\nconsole.log(shared);\n');
  write(root, 'src/options/index.html', page('./main.tsx'));
  write(root, 'src/options/main.tsx', 'import { App } from "./App";\nconsole.log(App);\n');
  write(root, 'src/options/App.tsx', 'export const App = 1;\n');
  write(root, 'src/lib/shared.ts', 'export const shared = 1;\n');
  for (const name of ['a', 'b']) {
    write(
      root,
      `src/${name}.content.ts`,
      `${defineImport}\nexport default defineContentScript({ matches: ['https://${name}.com/*'], main() {} });\n`,
    );
  }
}

const config: ExtForgeConfig = {
  browsers: ['chrome'],
  manifest: {
    name: 'Dev',
    version: '0.0.1',
    description: 'test',
    manifestVersion: 3,
    permissions: { required: [], optional: [], host: [] },
  },
};

describe('named-layout Fast Refresh targets', () => {
  let root: string;
  let src: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'extforge-fr-'));
    makeProject(root);
    src = join(root, 'src');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const targets = (...files: string[]) =>
    fastRefreshTargets(
      files.map((f) => join(src, f)),
      discoverEntrypoints(src, silent),
      src,
    );

  it("hot-swaps a page's own script", () => {
    expect(targets('popup.ts')).toEqual(['popup.js']);
  });

  it("hot-swaps anything inside a page's folder", () => {
    expect(targets('options/App.tsx')).toEqual(['options.js']);
    expect(targets('options/App.tsx', 'popup.ts')).toEqual(['options.js', 'popup.js']);
  });

  it('rebuilds everything for shared code or non-page entries', () => {
    expect(targets('lib/shared.ts')).toBeUndefined();
    expect(targets('background.ts')).toBeUndefined();
    expect(targets('a.content.ts')).toBeUndefined();
    expect(targets('popup.ts', 'lib/shared.ts')).toBeUndefined();
  });
});

describe('named-layout dev builds', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'extforge-nldev-'));
    makeProject(root);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('gives each content script its own id', async () => {
    const map = buildContentScriptMap(root, config);
    expect([...map.values()]).toEqual([0, 1]);
    await build(root, config, { browser: 'chrome', dev: true, hmrPort: 35996 }, silent);
    const a = readFileSync(join(root, 'dist/chrome/content-scripts/a.js'), 'utf8');
    const b = readFileSync(join(root, 'dist/chrome/content-scripts/b.js'), 'utf8');
    expect(a).toMatch(/__EXTFORGE_SCRIPT_ID__ = 0;/);
    expect(b).toMatch(/__EXTFORGE_SCRIPT_ID__ = 1;/);
  });

  it('builds page scripts and the background in the incremental context, never content scripts', async () => {
    const ctx = await createBuildContext(root, config, { browser: 'chrome', dev: true }, silent);
    try {
      await ctx.rebuild();
    } finally {
      await ctx.dispose();
    }
    const out = join(root, 'dist/chrome');
    expect(existsSync(join(out, 'popup.js'))).toBe(true);
    expect(existsSync(join(out, 'options.js'))).toBe(true);
    expect(existsSync(join(out, 'background.js'))).toBe(true);
    expect(existsSync(join(out, 'content-scripts/a.js'))).toBe(false);
  });
});
