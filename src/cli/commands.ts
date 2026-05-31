/**
 * ExtForge CLI command tree.
 *
 * Built on @arshad-shah/clif. Kept separate from `index.ts` (the bin entry)
 * so the command tree is importable in tests without triggering `run()`.
 *
 * Handlers lazy-import their heavy dependencies so `extforge --help` and
 * `--version` stay fast and don't pull in esbuild / the builder.
 */

import { defineCommand } from '@arshad-shah/clif';
import { getVersion } from '../core/version.js';

const version = getVersion();

const init = defineCommand({
  name: 'init',
  description: 'Create a new browser extension project',
  args: {
    defaults: { type: 'boolean', description: 'Skip prompts, use defaults', default: false },
    dir:      { type: 'string', description: 'Target directory' },
  },
  async handler({ args }) {
    const { scaffold } = await import('../core/scaffold/index.js');
    const { createLogger } = await import('../core/logger/index.js');
    const result = await scaffold(
      {
        name: args.positional[0],
        defaults: args.flags.defaults,
        targetDir: args.flags.dir as string | undefined,
      },
      createLogger({ scope: 'extforge' }),
    );
    if (!result) process.exit(1);
  },
});

const dev = defineCommand({
  name: 'dev',
  description: 'Start development server with HMR',
  args: {
    browser: { type: 'string', description: 'Target browser', default: 'chrome' },
    port:    { type: 'string', description: 'HMR WebSocket port', default: '35729' },
    host:    { type: 'string', description: 'HMR host', default: 'localhost' },
    quiet:   { type: 'boolean', description: 'Suppress info-level output', default: false },
    verbose: { type: 'boolean', description: 'Verbose HMR output', default: false },
    json:    { type: 'boolean', description: 'Emit machine-readable JSON', default: false },
    once:    { type: 'boolean', description: 'Run a single build then exit', default: false },
  },
  async handler({ args }) {
    const { loadExtForgeConfig } = await import('../core/config.js');
    const { createLogger, LogLevel, jsonTransport } = await import('../core/logger/index.js');
    const { ALL_BROWSERS } = await import('../core/manifest/index.js');

    const log = createLogger({
      scope: 'extforge',
      level: args.flags.verbose ? LogLevel.Trace
           : args.flags.quiet   ? LogLevel.Warn
           :                      LogLevel.Debug,
      transports: args.flags.json ? [jsonTransport()] : undefined,
      silentHumanOutput: args.flags.json,
    });
    const root = process.cwd();
    const config = await loadExtForgeConfig(root);
    const browser = args.flags.browser;
    if (!ALL_BROWSERS.includes(browser as any)) {
      log.error(`Invalid browser: ${browser}. Options: ${ALL_BROWSERS.join(', ')}`);
      process.exit(1);
    }

    if (args.flags.once) {
      const { build } = await import('../core/builder/index.js');
      const result = await build(root, config, { browser: browser as any, dev: true }, log);
      process.exit(result.errors.length > 0 ? 1 : 0);
    }

    const { createHMRServer } = await import('../core/hmr/index.js');
    const { validateProject } = await import('../core/validator/index.js');

    const validation = validateProject(root, log.child('validate'), { manifest: config.manifest });
    if (!validation.valid) { log.error('Fix project errors first'); process.exit(1); }

    const server = createHMRServer({
      projectRoot: root, config, browser: browser as any,
      port: parseInt(args.flags.port, 10), host: args.flags.host, logger: log,
    });
    await server.start();

    const shutdown = async () => { log.info('Shutting down...'); await server.stop(); process.exit(0); };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  },
});

const build = defineCommand({
  name: 'build',
  description: 'Build extension for production',
  args: {
    browser:   { type: 'string', description: 'Single browser target' },
    dev:       { type: 'boolean', description: 'Development build', default: false },
    sourcemap: { type: 'boolean', description: 'Include source maps', default: false },
    strict:    { type: 'boolean', description: 'Treat compat warnings as errors', default: false },
    quiet:     { type: 'boolean', description: 'Suppress info-level output', default: false },
    json:      { type: 'boolean', description: 'Emit machine-readable JSON', default: false },
  },
  async handler({ args }) {
    const { buildAll, build: buildOne } = await import('../core/builder/index.js');
    const { loadExtForgeConfig } = await import('../core/config.js');
    const { createLogger, LogLevel, jsonTransport } = await import('../core/logger/index.js');
    const { ALL_BROWSERS } = await import('../core/manifest/index.js');

    const log = createLogger({
      scope: 'extforge',
      level: args.flags.quiet ? LogLevel.Warn : LogLevel.Info,
      transports: args.flags.json ? [jsonTransport()] : undefined,
      silentHumanOutput: args.flags.json,
    });
    const config = await loadExtForgeConfig(process.cwd());
    const isDev = args.flags.dev;
    const sm = args.flags.sourcemap || isDev;
    const strictCompat = args.flags.strict;
    const browser = args.flags.browser as string | undefined;

    if (browser) {
      if (!ALL_BROWSERS.includes(browser as any)) { log.error(`Invalid browser: ${browser}`); process.exit(1); }
      const r = await buildOne(process.cwd(), config, { browser: browser as any, dev: isDev, sourcemap: sm, strictCompat }, log);
      if (r.errors.length > 0) process.exit(1);
    } else {
      const results = await buildAll(process.cwd(), config, { dev: isDev, sourcemap: sm, strictCompat }, log);
      if (results.some(r => r.errors.length > 0)) process.exit(1);
    }
  },
});

const validate = defineCommand({
  name: 'validate',
  description: 'Validate project structure and config',
  args: {
    quiet: { type: 'boolean', description: 'Suppress info-level output', default: false },
    json:  { type: 'boolean', description: 'Emit machine-readable JSON', default: false },
  },
  async handler({ args }) {
    const { validateProject } = await import('../core/validator/index.js');
    const { loadExtForgeConfig } = await import('../core/config.js');
    const { createLogger, LogLevel, jsonTransport } = await import('../core/logger/index.js');
    const log = createLogger({
      scope: 'extforge',
      level: args.flags.quiet ? LogLevel.Warn : LogLevel.Info,
      transports: args.flags.json ? [jsonTransport()] : undefined,
    });

    const config = await loadExtForgeConfig(process.cwd());
    const result = validateProject(process.cwd(), log, { manifest: config.manifest });

    if (!result.valid) process.exit(1);
    else log.success('All checks passed');
  },
});

const doctor = defineCommand({
  name: 'doctor',
  description: 'Diagnose project & environment',
  args: {
    json:  { type: 'boolean', description: 'Emit JSON', default: false },
    quiet: { type: 'boolean', description: 'Suppress info-level output', default: false },
  },
  async handler({ args }) {
    const { runDoctor } = await import('../core/doctor/index.js');
    const { nodeVersionCheck } = await import('../core/doctor/checks/node-version.js');
    const { configValidCheck } = await import('../core/doctor/checks/config-valid.js');
    const { iconsPresentCheck } = await import('../core/doctor/checks/icons-present.js');
    const { portFreeCheck } = await import('../core/doctor/checks/port-free.js');
    const { distGitignoredCheck } = await import('../core/doctor/checks/dist-gitignored.js');
    const { permissionsKnownCheck } = await import('../core/doctor/checks/permissions-known.js');
    const { browserOverridesCheck } = await import('../core/doctor/checks/browser-overrides.js');
    const { scriptsPresentCheck } = await import('../core/doctor/checks/scripts-present.js');
    const { compatCheck } = await import('../core/doctor/checks/compat.js');
    const { createLogger, LogLevel } = await import('../core/logger/index.js');

    const checks = [
      nodeVersionCheck, configValidCheck, iconsPresentCheck, portFreeCheck,
      distGitignoredCheck, permissionsKnownCheck, browserOverridesCheck,
      scriptsPresentCheck, compatCheck,
    ];
    const report = await runDoctor(checks, { cwd: process.cwd() });

    if (args.flags.json) {
      process.stdout.write(JSON.stringify({ v: 1, ...report }, null, 2) + '\n');
      process.exit(report.exitCode);
    }
    const log = createLogger({ scope: 'doctor', level: args.flags.quiet ? LogLevel.Warn : LogLevel.Info });
    for (const r of report.results) {
      const fn = r.status === 'pass' ? log.success.bind(log)
              : r.status === 'warn' ? log.warn.bind(log)
              : r.status === 'fail' ? log.error.bind(log)
              : log.info.bind(log);
      fn(`${r.name}: ${r.message}`);
      if (r.hint) log.info(`  hint: ${r.hint}`);
    }
    log.summary('Summary', [
      { label: 'pass', value: String(report.summary.pass) },
      { label: 'warn', value: String(report.summary.warn) },
      { label: 'fail', value: String(report.summary.fail) },
    ]);
    process.exit(report.exitCode);
  },
});

const upgrade = defineCommand({
  name: 'upgrade',
  description: 'Check for deprecated config (codemods land later)',
  async handler() {
    const { loadExtForgeConfig } = await import('../core/config.js');
    const { createLogger } = await import('../core/logger/index.js');
    const log = createLogger({ scope: 'upgrade' });
    try {
      await loadExtForgeConfig(process.cwd());
      log.success('Your extforge.config is up to date.');
    } catch (err) {
      log.error('Config is invalid; fix it before running upgrade.');
      throw err;
    }
  },
});

const pkg = defineCommand({
  name: 'package',
  description: 'Create .zip archives for stores',
  args: { browser: { type: 'string', description: 'Single browser' } },
  async handler({ args }) {
    const { existsSync, mkdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { loadExtForgeConfig } = await import('../core/config.js');
    const { createLogger } = await import('../core/logger/index.js');
    const { ALL_BROWSERS } = await import('../core/manifest/index.js');
    const { archiveFilename, packageBrowser } = await import('./package-cmd.js');

    const log = createLogger({ scope: 'extforge' });
    const config = await loadExtForgeConfig(process.cwd());
    const browser = args.flags.browser as string | undefined;
    const browsers = browser ? [browser] : (config.browsers ?? ALL_BROWSERS);
    const pkgDir = join(process.cwd(), 'packages');
    mkdirSync(pkgDir, { recursive: true });

    for (const b of browsers) {
      const dist = join(process.cwd(), 'dist', b);
      if (!existsSync(dist)) { log.warn(`No build for ${b} — run \`extforge build\` first`); continue; }
      const name = archiveFilename(config.manifest?.name, config.manifest?.version, b);
      const archive = join(pkgDir, name);
      try {
        await packageBrowser({ dist, archive, log });
        log.success(`Packaged ${b} → packages/${name}`);
      } catch (err) {
        log.error(`Failed to package ${b}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  },
});

const icons = defineCommand({
  name: 'icons',
  description: 'Generate PNG icons from SVG',
  async handler() {
    const { existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { spawnSync } = await import('node:child_process');
    const { createLogger } = await import('../core/logger/index.js');

    const log = createLogger({ scope: 'extforge' });
    const svg = join(process.cwd(), 'icons/icon.svg');
    if (!existsSync(svg)) { log.error('No icons/icon.svg found'); process.exit(1); }

    const sizes = [16, 32, 48, 128];
    const sharpOk = sizes.every((s) => {
      const out = join(process.cwd(), `icons/icon-${s}.png`);
      const r = spawnSync('npx', ['sharp-cli', '-i', svg, '-o', out, 'resize', String(s), String(s)], {
        stdio: 'pipe', shell: false,
      });
      if (r.status === 0) {
        log.success(`Generated icon-${s}.png`);
        return true;
      }
      return false;
    });
    if (sharpOk) return;

    log.warn('sharp-cli not available — trying cairosvg...');
    const pyLines = sizes
      .map((s) => `cairosvg.svg2png(url=sys.argv[1], write_to=sys.argv[${sizes.indexOf(s) + 2}], output_width=${s}, output_height=${s})`)
      .join('\n');
    const pyScript = `import sys, cairosvg\n${pyLines}\n`;
    const pyArgs = ['-c', pyScript, svg, ...sizes.map((s) => join(process.cwd(), `icons/icon-${s}.png`))];
    const r = spawnSync('python3', pyArgs, { cwd: process.cwd(), stdio: 'pipe', shell: false });
    if (r.status !== 0) {
      log.error('Install sharp-cli (npm i -g sharp-cli) or cairosvg (pip install cairosvg)');
    }
  },
});

/** Root ExtForge command. `--help` / `--version` are handled by clif. */
export const main = defineCommand({
  name: 'extforge',
  version,
  description: 'The build system for Manifest V3 browser extensions',
  commands: [init, dev, build, validate, doctor, upgrade, pkg, icons],
});
