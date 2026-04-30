#!/usr/bin/env node

/**
 * ExtForge CLI
 *
 * Version read dynamically from package.json via getVersion().
 */

import { defineCommand, runMain } from 'citty';
import { getVersion } from '../core/version.js';
import { withErrorHandler } from './error-handler.js';

const version = getVersion();

const main = defineCommand({
  meta: { name: 'extforge', version, description: '⚡ Lightning-fast browser extension build system' },
  subCommands: {

    init: defineCommand({
      meta: { name: 'init', description: 'Create a new browser extension project' },
      args: {
        name:     { type: 'positional', description: 'Project name', required: false },
        defaults: { type: 'boolean', description: 'Skip prompts, use defaults', default: false },
        dir:      { type: 'string', description: 'Target directory' },
      },
      async run({ args }) {
        const { scaffold } = await import('../core/scaffold/index.js');
        const { createLogger } = await import('../core/logger/index.js');
        const result = await scaffold(
          { name: args.name as string | undefined, defaults: args.defaults as boolean, targetDir: args.dir as string | undefined },
          createLogger({ scope: 'extforge' }),
        );
        if (!result) process.exit(1);
      },
    }),

    dev: defineCommand({
      meta: { name: 'dev', description: 'Start development server with HMR' },
      args: {
        browser: { type: 'string', description: 'Target browser', default: 'chrome' },
        port:    { type: 'string', description: 'HMR WebSocket port', default: '35729' },
        host:    { type: 'string', description: 'HMR host', default: 'localhost' },
      },
      async run({ args }) {
        const { createHMRServer } = await import('../core/hmr/index.js');
        const { loadExtForgeConfig } = await import('../core/config.js');
        const { createLogger, LogLevel } = await import('../core/logger/index.js');
        const { validateProject } = await import('../core/validator/index.js');
        const { ALL_BROWSERS } = await import('../core/manifest/index.js');

        const log = createLogger({ scope: 'extforge', level: LogLevel.Debug });
        const root = process.cwd();
        const validation = validateProject(root, log.child('validate'));
        if (!validation.valid) { log.error('Fix project errors first'); process.exit(1); }

        const config = await loadExtForgeConfig(root);
        const browser = args.browser as string;
        if (!ALL_BROWSERS.includes(browser as any)) {
          log.error(`Invalid browser: ${browser}. Options: ${ALL_BROWSERS.join(', ')}`);
          process.exit(1);
        }

        const server = createHMRServer({
          projectRoot: root, config, browser: browser as any,
          port: parseInt(args.port as string, 10), host: args.host as string, logger: log,
        });
        await server.start();

        const shutdown = async () => { log.info('Shutting down...'); await server.stop(); process.exit(0); };
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
      },
    }),

    build: defineCommand({
      meta: { name: 'build', description: 'Build extension for production' },
      args: {
        browser:   { type: 'string', description: 'Single browser target' },
        dev:       { type: 'boolean', description: 'Development build', default: false },
        sourcemap: { type: 'boolean', description: 'Include source maps', default: false },
      },
      async run({ args }) {
        const { buildAll, build } = await import('../core/builder/index.js');
        const { loadExtForgeConfig } = await import('../core/config.js');
        const { createLogger } = await import('../core/logger/index.js');
        const { ALL_BROWSERS } = await import('../core/manifest/index.js');

        const log = createLogger({ scope: 'extforge' });
        const config = await loadExtForgeConfig(process.cwd());
        const isDev = args.dev as boolean;
        const sm = (args.sourcemap as boolean) || isDev;

        if (args.browser) {
          if (!ALL_BROWSERS.includes(args.browser as any)) { log.error(`Invalid browser: ${args.browser}`); process.exit(1); }
          const r = await build(process.cwd(), config, { browser: args.browser as any, dev: isDev, sourcemap: sm }, log);
          if (r.errors.length > 0) process.exit(1);
        } else {
          const results = await buildAll(process.cwd(), config, { dev: isDev, sourcemap: sm }, log);
          if (results.some(r => r.errors.length > 0)) process.exit(1);
        }
      },
    }),

    validate: defineCommand({
      meta: { name: 'validate', description: 'Validate project structure and config' },
      async run() {
        const { validateProject } = await import('../core/validator/index.js');
        const { loadExtForgeConfig } = await import('../core/config.js');
        const { validateManifestConfig } = await import('../core/manifest/index.js');
        const { createLogger } = await import('../core/logger/index.js');
        const log = createLogger({ scope: 'extforge' });

        const result = validateProject(process.cwd(), log);
        try {
          const config = await loadExtForgeConfig(process.cwd());
          if (config.manifest) {
            const mr = validateManifestConfig(config.manifest);
            for (const e of mr.errors) log.error(`Manifest: ${e}`);
            for (const w of mr.warnings) log.warn(`Manifest: ${w}`);
          }
        } catch (err) { log.error(`Config: ${err instanceof Error ? err.message : String(err)}`); }

        if (!result.valid) process.exit(1);
        else log.success('All checks passed');
      },
    }),

    package: defineCommand({
      meta: { name: 'package', description: 'Create .zip archives for stores' },
      args: { browser: { type: 'string', description: 'Single browser' } },
      async run({ args }) {
        const { existsSync, mkdirSync } = await import('node:fs');
        const { execSync } = await import('node:child_process');
        const { join } = await import('pathe');
        const { loadExtForgeConfig } = await import('../core/config.js');
        const { createLogger } = await import('../core/logger/index.js');
        const { ALL_BROWSERS } = await import('../core/manifest/index.js');

        const log = createLogger({ scope: 'extforge' });
        const config = await loadExtForgeConfig(process.cwd());
        const browsers = args.browser ? [args.browser as string] : (config.browsers ?? ALL_BROWSERS);
        const pkgDir = join(process.cwd(), 'packages');
        mkdirSync(pkgDir, { recursive: true });

        for (const b of browsers) {
          const dist = join(process.cwd(), 'dist', b);
          if (!existsSync(dist)) { log.warn(`No build for ${b} — run \`extforge build\` first`); continue; }
          const name = `${config.manifest?.name ?? 'extension'}-${b}-v${config.manifest?.version ?? '0.0.0'}.zip`;
          try { execSync(`cd "${dist}" && zip -r "${join(pkgDir, name)}" ./*`, { stdio: 'pipe' }); log.success(`Packaged ${b} → packages/${name}`); }
          catch { log.error(`Failed to package ${b}`); }
        }
      },
    }),

    icons: defineCommand({
      meta: { name: 'icons', description: 'Generate PNG icons from SVG' },
      async run() {
        const { existsSync } = await import('node:fs');
        const { join } = await import('pathe');
        const { execSync } = await import('node:child_process');
        const { createLogger } = await import('../core/logger/index.js');

        const log = createLogger({ scope: 'extforge' });
        const svg = join(process.cwd(), 'icons/icon.svg');
        if (!existsSync(svg)) { log.error('No icons/icon.svg found'); process.exit(1); }

        const sizes = [16, 32, 48, 128];
        try {
          for (const s of sizes) {
            execSync(`npx sharp-cli -i "${svg}" -o "${join(process.cwd(), `icons/icon-${s}.png`)}" resize ${s} ${s}`, { stdio: 'pipe' });
            log.success(`Generated icon-${s}.png`);
          }
        } catch {
          log.warn('sharp-cli not available — trying cairosvg...');
          try {
            const py = sizes.map(s => `cairosvg.svg2png(url="${svg}", write_to="icons/icon-${s}.png", output_width=${s}, output_height=${s})`).join('\n');
            execSync(`python3 -c "import cairosvg\n${py}"`, { cwd: process.cwd(), stdio: 'pipe' });
          } catch {
            log.error('Install sharp-cli (npm i -g sharp-cli) or cairosvg (pip install cairosvg)');
          }
        }
      },
    }),
  },
});

withErrorHandler(() => runMain(main));
