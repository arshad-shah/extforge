import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { build } from '../src/core/builder/index.js';
import type { ExtForgeConfig } from '../src/core/config.js';
import { ExtForgeError } from '../src/core/errors/index.js';
import { createLogger, LogLevel } from '../src/core/logger/index.js';

const silent = createLogger({ level: LogLevel.Silent });

/** Background plus a content script that pulls in ~20 KB of string data. */
function makeProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'extforge-budget-'));
  mkdirSync(join(root, 'src/background'), { recursive: true });
  mkdirSync(join(root, 'src/content'), { recursive: true });
  mkdirSync(join(root, 'src/lib'), { recursive: true });
  writeFileSync(join(root, 'src/background/index.ts'), 'console.log("bg");\n');
  writeFileSync(
    join(root, 'src/lib/heavy.ts'),
    `export const HEAVY = ${JSON.stringify('x'.repeat(20_000))};\n`,
  );
  writeFileSync(
    join(root, 'src/content/index.ts'),
    'import { HEAVY } from "../lib/heavy";\nconsole.log(HEAVY.length);\n',
  );
  return root;
}

const config = (budgets?: Record<string, string>): ExtForgeConfig => ({
  browsers: ['chrome'],
  build: budgets ? { budgets } : undefined,
  manifest: {
    name: 'BudgetExt',
    version: '0.0.1',
    description: 'test',
    manifestVersion: 3,
    permissions: { required: [], optional: [], host: [] },
    background: { entrypoint: 'background/index.js' },
    contentScripts: [{ matches: ['<all_urls>'], js: ['content/index.js'] }],
  },
});

describe('bundle budgets in a real build', () => {
  let root: string;
  beforeEach(() => {
    root = makeProject();
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('reports a size for every entrypoint, content scripts included', async () => {
    const result = await build(root, config(), { browser: 'chrome', dev: false }, silent);
    const names = result.entries.map((e) => e.name);
    expect(names).toEqual(['background/index', 'content/index']);
    const content = result.entries.find((e) => e.name === 'content/index');
    expect(content?.bytes).toBeGreaterThan(20_000);
    expect(content?.inputs[0]?.path).toMatch(/src\/lib\/heavy\.ts$/);
  });

  it('fails a production build over budget, naming the entry and its biggest input', async () => {
    const err = await build(
      root,
      config({ 'content/*': '5kb', '**': '1mb' }),
      { browser: 'chrome', dev: false },
      silent,
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExtForgeError);
    expect((err as ExtForgeError).code).toBe('EXT_BUDGET_EXCEEDED');
    expect((err as Error).message).toMatch(/content\/index: .*budget 5\.0 KB \(content\/\*\)/);
    expect((err as Error).message).toMatch(/heavy\.ts/);
  });

  it('passes when within budget, and never fails a dev build', async () => {
    await expect(
      build(root, config({ '**': '1mb' }), { browser: 'chrome', dev: false }, silent),
    ).resolves.toBeDefined();
    await expect(
      build(root, config({ '**': '1kb' }), { browser: 'chrome', dev: true }, silent),
    ).resolves.toBeDefined();
  });

  it('--analyze writes a treemap and the merged metafile next to the browser builds', async () => {
    await build(root, config(), { browser: 'chrome', dev: false, analyze: true }, silent);
    const html = join(root, 'dist/.extforge/stats-chrome.html');
    const meta = join(root, 'dist/.extforge/meta-chrome.json');
    expect(existsSync(html)).toBe(true);
    expect(readFileSync(html, 'utf8')).toContain('content/index');
    const outputs = Object.keys(JSON.parse(readFileSync(meta, 'utf8')).outputs);
    expect(outputs.some((p) => p.endsWith('content/index.js'))).toBe(true);
    expect(outputs.some((p) => p.endsWith('background/index.js'))).toBe(true);
  });
});
