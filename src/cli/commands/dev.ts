import { defineCommand } from '@arshad-shah/clif';
import { join, resolve } from 'node:path';

export const dev = defineCommand({
  name: 'dev',
  description: 'Start development server with HMR',
  args: {
    browser: { type: 'string', description: 'Target browser', default: 'chrome' },
    port: { type: 'string', description: 'HMR WebSocket port', default: '35729' },
    host: { type: 'string', description: 'HMR host', default: 'localhost' },
    quiet: { type: 'boolean', description: 'Suppress info-level output', default: false },
    verbose: { type: 'boolean', description: 'Verbose HMR output', default: false },
    json: { type: 'boolean', description: 'Emit machine-readable JSON', default: false },
    once: { type: 'boolean', description: 'Run a single build then exit', default: false },
    open: {
      type: 'boolean',
      description: 'Launch a browser with the extension installed',
      default: false,
    },
  },
  async handler({ args }) {
    const { loadExtForgeConfig } = await import('../../core/config.js');
    const { createLogger, LogLevel, jsonTransport } = await import('../../core/logger/index.js');
    const { ALL_BROWSERS } = await import('../../core/manifest/index.js');

    const log = createLogger({
      scope: 'extforge',
      level: args.flags.verbose
        ? LogLevel.Trace
        : args.flags.quiet
          ? LogLevel.Warn
          : LogLevel.Debug,
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
      const { build } = await import('../../core/builder/index.js');
      const result = await build(root, config, { browser: browser as any, dev: true }, log);
      process.exit(result.errors.length > 0 ? 1 : 0);
    }

    const { createHMRServer } = await import('../../core/hmr/index.js');
    const { validateProject } = await import('../../core/validator/index.js');

    const validation = validateProject(root, log.child('validate'), { manifest: config.manifest });
    if (!validation.valid) {
      log.error('Fix project errors first');
      process.exit(1);
    }

    const server = createHMRServer({
      projectRoot: root,
      config,
      browser: browser as any,
      port: parseInt(args.flags.port, 10),
      host: args.flags.host,
      logger: log,
    });
    await server.start();

    let launchedProcess: import('node:child_process').ChildProcess | undefined;
    if (args.flags.open || config.dev?.open === true) {
      const { launchDevBrowser } = await import('../../core/launcher/index.js');
      const profileBase = config.dev?.profileDir
        ? resolve(root, config.dev.profileDir)
        : resolve(root, '.extforge', 'profile');
      const profileDir = join(profileBase, browser);
      const distDir = join(root, config.build?.outDir ?? 'dist', browser);
      const result = await launchDevBrowser({
        browser: browser as any,
        projectRoot: root,
        distDir,
        profileDir,
        binary: config.dev?.browserBinary,
        startUrls: config.dev?.startUrls,
      });
      if (result.launched) {
        launchedProcess = result.process;
        log.success(`Opened ${browser} with the extension loaded (profile: ${profileDir})`);
      } else {
        log.warn(result.warning ?? `Could not launch ${browser} automatically.`);
        log.info(`Load unpacked from: ${distDir}`);
      }
    }

    const shutdown = async () => {
      log.info('Shutting down...');
      if (launchedProcess && !launchedProcess.killed) {
        launchedProcess.kill();
      }
      await server.stop();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  },
});
