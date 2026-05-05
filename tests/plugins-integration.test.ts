import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path/posix';
import { build } from '../src/core/builder/index.js';
import { loadExtForgeConfig } from '../src/core/config.js';
import { createLogger, LogLevel } from '../src/core/logger/index.js';

describe('plugin integration', () => {
  it('builds a JSX file when framework=react via presetReact()', async () => {
    const root = mkdtempSync(join(tmpdir(), 'extforge-plugins-'));
    mkdirSync(join(root, 'src', 'ui', 'popup'), { recursive: true });
    mkdirSync(join(root, 'icons'), { recursive: true });
    // minimal icon set so any icon checks pass
    for (const s of [16, 32, 48, 128]) writeFileSync(join(root, `icons/icon-${s}.png`), '');
    // popup entry at the path discoverEntryPoints expects: src/ui/popup/index.tsx
    writeFileSync(
      join(root, 'src', 'ui', 'popup', 'index.tsx'),
      'export const App = () => <div>hi</div>;',
    );
    writeFileSync(
      join(root, 'extforge.config.ts'),
      // Mark react as external so esbuild doesn't try to bundle it from node_modules.
      // The output will still contain "react/jsx-runtime" import statements — which
      // proves that presetReact() injected the jsx/jsxImportSource esbuild options.
      `export default {
         browsers: ['chrome'],
         framework: 'react',
         manifest: {
           name: 'x', version: '0.0.1', description: '', manifestVersion: 3,
           permissions: { required: [], optional: [], host: [] },
         },
         plugins: [{
           name: 'test-external-react', apiVersion: 1,
           setup({ hooks }) {
             hooks.onBuildEntry((entry) => ({
               ...entry,
               esbuildOptions: {
                 ...(entry.esbuildOptions ?? {}),
                 external: ['react', 'react-dom', 'react/jsx-runtime'],
               },
             }));
           },
         }],
       }`,
    );

    const config = await loadExtForgeConfig(root);
    expect((config as any).__pluginRunner).toBeDefined();

    const result = await build(root, config, { browser: 'chrome', dev: false }, createLogger({ level: LogLevel.Silent }));
    expect(result.errors).toHaveLength(0);

    // The bundled output lives at dist/chrome/ui/popup/index.js
    const popupOut = join(root, 'dist/chrome/ui/popup/index.js');
    if (!existsSync(popupOut)) {
      const distDir = join(root, 'dist/chrome');
      const found: string[] = [];
      const scan = (d: string) => {
        if (!existsSync(d)) return;
        for (const e of readdirSync(d, { withFileTypes: true })) {
          const full = join(d, e.name);
          if (e.isDirectory()) scan(full);
          else if (e.name.endsWith('.js')) found.push(full);
        }
      };
      scan(distDir);
      throw new Error(`Expected dist/chrome/ui/popup/index.js — found: ${found.join(', ')}`);
    }
    const out = readFileSync(popupOut, 'utf8');
    // presetReact injects jsx:'automatic' and jsxImportSource:'react'; the output
    // will reference react/jsx-runtime as an external import.
    expect(out).toMatch(/jsx-runtime|React\.createElement/);
  }, 30_000);

  it('manifest transform from a user plugin is applied', async () => {
    const root = mkdtempSync(join(tmpdir(), 'extforge-plugins2-'));
    mkdirSync(join(root, 'src'), { recursive: true });
    mkdirSync(join(root, 'icons'), { recursive: true });
    for (const s of [16, 32, 48, 128]) writeFileSync(join(root, `icons/icon-${s}.png`), '');
    writeFileSync(join(root, 'src/background.ts'), 'console.log(1)');
    writeFileSync(
      join(root, 'extforge.config.ts'),
      `export default {
         browsers: ['chrome'],
         framework: 'vanilla',
         manifest: {
           name: 'x', version: '0.0.1', description: '', manifestVersion: 3,
           permissions: { required: [], optional: [], host: [] },
           background: { entrypoint: 'background/index.js' },
         },
         plugins: [{
           name: 'description-stamp', apiVersion: 1,
           setup({ hooks }) { hooks.onManifestTransform((m) => ({ ...m, description: 'stamped' })); },
         }],
       };`,
    );
    const config = await loadExtForgeConfig(root);
    await build(root, config, { browser: 'chrome', dev: false }, createLogger({ level: LogLevel.Silent }));
    const manifestPath = join(root, 'dist/chrome/manifest.json');
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(manifest.description).toBe('stamped');
  }, 30_000);
});
