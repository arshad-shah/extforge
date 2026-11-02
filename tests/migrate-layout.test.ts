import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { build } from '../src/core/builder/index.js';
import { loadExtForgeConfig } from '../src/core/config.js';
import { usesLegacyLayout } from '../src/core/entrypoints/discover.js';
import {
  applyMigration,
  planMigration,
  removeEntryKeys,
  rewriteSpecifiers,
} from '../src/core/entrypoints/migrate.js';
import { createLogger, LogLevel } from '../src/core/logger/index.js';

const silent = createLogger({ level: LogLevel.Silent });

function write(root: string, rel: string, body: string): void {
  mkdirSync(join(root, rel, '..'), { recursive: true });
  writeFileSync(join(root, rel), body);
}

/** The shape `extforge init` wrote before the named layout. */
const LEGACY_CONFIG = `import { defineConfig } from 'extforge';

export default defineConfig({
  browsers: ['chrome'],
  manifest: {
    name: 'Legacy',
    version: '0.1.0',
    description: 'x',
    manifestVersion: 3,
    permissions: { required: ['storage'], optional: [], host: [] },

    action: {
      defaultPopup: 'ui/popup/index.html',
      defaultTitle: 'Legacy',
    },

    background: { entrypoint: 'background/index.js' },

    contentScripts: [{
      matches: ['https://example.com/*'],
      js: ['content/index.js'],
      runAt: 'document_start',
      // allFrames: true,
    }],

    optionsPage: 'ui/options/index.html',
  },
});
`;

function makeLegacyProject(root: string): void {
  write(root, 'package.json', '{"type":"module"}');
  write(root, 'tsconfig.json', '{}');
  write(
    root,
    'extforge.config.ts',
    // A plain object, so the config loader needs no package resolution.
    LEGACY_CONFIG.replace("import { defineConfig } from 'extforge';\n\n", '').replace(
      'export default defineConfig({',
      'export default ({',
    ),
  );
  write(
    root,
    'src/background/index.ts',
    'import { shared } from "../lib/shared";\nconsole.log(shared);\n',
  );
  write(root, 'src/lib/shared.ts', 'export const shared = 1;\n');
  write(root, 'src/styles/globals.css', 'body { margin: 0; }\n');
  write(
    root,
    'src/ui/popup/index.html',
    '<!doctype html><link rel="stylesheet" href="../../styles/globals.css"><script type="module" src="./index.js"></script>',
  );
  write(
    root,
    'src/ui/popup/index.ts',
    'import { shared } from "../../lib/shared";\nconsole.log("popup", shared);\n',
  );
  write(
    root,
    'src/ui/options/index.html',
    '<!doctype html><script type="module" src="./index.js"></script>',
  );
  write(root, 'src/ui/options/index.ts', 'console.log("options");\n');
  write(
    root,
    'src/content/index.ts',
    'import { shared } from "../lib/shared";\n(globalThis as any).__ran = shared;\n',
  );
}

describe('rewriteSpecifiers', () => {
  const moves = [{ from: '/p/src/ui/popup', to: '/p/src/popup' }];

  it('fixes imports leaving a moved folder', () => {
    expect(
      rewriteSpecifiers(
        'import { x } from "../../lib/x";',
        '/p/src/ui/popup/a.ts',
        '/p/src/popup/a.ts',
        moves,
      ),
    ).toBe('import { x } from "../lib/x";');
  });

  it('fixes imports pointing into a moved folder', () => {
    expect(
      rewriteSpecifiers(
        "import p from '../ui/popup/util';",
        '/p/src/lib/a.ts',
        '/p/src/lib/a.ts',
        moves,
      ),
    ).toBe("import p from '../popup/util';");
  });

  it('leaves package and sibling imports alone', () => {
    const src = "import React from 'react';\nimport { y } from './y';\n";
    expect(rewriteSpecifiers(src, '/p/src/ui/popup/a.ts', '/p/src/popup/a.ts', moves)).toBe(src);
  });

  it('fixes HTML links and CSS imports', () => {
    expect(
      rewriteSpecifiers(
        '<link rel="stylesheet" href="../../styles/g.css">',
        '/p/src/ui/popup/index.html',
        '/p/src/popup/index.html',
        moves,
      ),
    ).toBe('<link rel="stylesheet" href="../styles/g.css">');
    expect(
      rewriteSpecifiers(
        "@import '../../styles/base.css';",
        '/p/src/ui/popup/a.css',
        '/p/src/popup/a.css',
        moves,
      ),
    ).toBe("@import '../styles/base.css';");
  });
});

describe('removeEntryKeys', () => {
  it('removes every entry key the old scaffold wrote and keeps the rest', () => {
    const out = removeEntryKeys(LEGACY_CONFIG, [
      'background.entrypoint',
      'action.defaultPopup',
      'optionsPage',
      'contentScripts',
    ]);
    expect(out).toBeDefined();
    for (const gone of [
      'entrypoint',
      'defaultPopup',
      'optionsPage',
      'contentScripts',
      'content/index.js',
    ]) {
      expect(out).not.toContain(gone);
    }
    expect(out).toContain("defaultTitle: 'Legacy'");
    expect(out).toContain("permissions: { required: ['storage']");
  });

  it('gives up rather than guessing when a key has an unexpected shape', () => {
    expect(
      removeEntryKeys('background: getBackground(),\n', ['background.entrypoint']),
    ).toBeUndefined();
  });
});

describe('planMigration', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'extforge-mig-'));
    makeLegacyProject(root);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('plans the moves, the content script options and the config keys', async () => {
    const config = await loadExtForgeConfig(root);
    const plan = planMigration(root, config.manifest);
    expect(plan.blockers).toEqual([]);
    expect(plan.moves.map((m) => [m.from.replace(root, ''), m.to.replace(root, '')])).toEqual([
      ['/src/ui/popup', '/src/popup'],
      ['/src/ui/options', '/src/options'],
      ['/src/content/index.ts', '/src/content.ts'],
    ]);
    expect(plan.contentScript?.options).toMatchObject({
      matches: ['https://example.com/*'],
      runAt: 'document_start',
    });
    expect(plan.configKeys).toEqual([
      'background.entrypoint',
      'action.defaultPopup',
      'optionsPage',
      'contentScripts',
    ]);
  });

  it('refuses content scripts with css, and changes nothing', async () => {
    const config = await loadExtForgeConfig(root);
    config.manifest!.contentScripts![0]!.css = ['styles/content.css'];
    const plan = planMigration(root, config.manifest);
    expect(plan.blockers.join('\n')).toMatch(/css/);
    expect(() => applyMigration(root, plan)).toThrow(/blockers/);
    expect(existsSync(join(root, 'src/ui/popup/index.ts'))).toBe(true);
  });
});

describe('migrating a legacy project end to end', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'extforge-mig-e2e-'));
    makeLegacyProject(root);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('moves files, fixes paths, rewrites the config, and builds in the named layout', async () => {
    const before = await loadExtForgeConfig(root);
    const plan = planMigration(root, before.manifest);
    applyMigration(root, plan);
    const configPath = join(root, 'extforge.config.ts');
    writeFileSync(
      configPath,
      removeEntryKeys(readFileSync(configPath, 'utf8'), plan.configKeys) as string,
    );

    expect(readFileSync(join(root, 'src/popup/index.ts'), 'utf8')).toContain(
      'from "../lib/shared"',
    );
    expect(readFileSync(join(root, 'src/popup/index.html'), 'utf8')).toContain(
      'href="../styles/globals.css"',
    );
    expect(existsSync(join(root, 'src/ui'))).toBe(false);
    expect(existsSync(join(root, 'src/content'))).toBe(false);
    const content = readFileSync(join(root, 'src/content.ts'), 'utf8');
    expect(content).toContain("import { defineContentScript } from 'extforge/entrypoints';");
    expect(content).toContain('from "./lib/shared"');

    const after = await loadExtForgeConfig(root);
    expect(usesLegacyLayout(after.manifest, join(root, 'src'))).toBe(false);

    // The import of extforge/entrypoints resolves through the repo in this test.
    writeFileSync(
      join(root, 'src/content.ts'),
      content.replace(
        "'extforge/entrypoints'",
        `'${join(process.cwd(), 'src/core/entrypoints/define.ts')}'`,
      ),
    );
    await build(root, after, { browser: 'chrome', dev: false }, silent);
    const m = JSON.parse(readFileSync(join(root, 'dist/chrome/manifest.json'), 'utf8'));
    expect(m.background.service_worker).toBe('background.js');
    expect(m.action).toMatchObject({ default_popup: 'popup.html', default_title: 'Legacy' });
    expect(m.options_page).toBe('options.html');
    expect(m.content_scripts).toEqual([
      {
        matches: ['https://example.com/*'],
        js: ['content-scripts/content.js'],
        run_at: 'document_start',
      },
    ]);
    expect(readFileSync(join(root, 'dist/chrome/popup.html'), 'utf8')).toContain(
      'href="./styles/globals.css"',
    );
  });
});
