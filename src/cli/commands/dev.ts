import { join, resolve } from 'node:path';
import { defineCommand } from '@arshad-shah/clif';

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
    'debug-port': {
      type: 'string',
      description: 'Open a CDP port on the launched browser so tools can drive it (Chromium only)',
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

    /*
     * A CDP port for the browser `--open` starts.
     *
     * Without one there is no way to reach that browser, so anything
     * automated — a Playwright run, a screenshot script — has to launch a
     * second one and reproduce the profile, the flags and the extension path
     * by hand. With it, the tests drive the same browser the developer is
     * looking at.
     *
     * Only meaningful alongside `--open`; asking for it without one is a
     * misunderstanding worth naming rather than ignoring.
     */
    const debugPortFlag = args.flags['debug-port'];
    let debugPort: number | undefined;
    if (debugPortFlag !== undefined) {
      const parsed = Number(debugPortFlag);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        log.error(`Invalid --debug-port: ${debugPortFlag}. Expected a port between 1 and 65535.`);
        process.exit(1);
      }
      debugPort = parsed;
    } else if (typeof config.dev?.debugPort === 'number') {
      debugPort = config.dev.debugPort;
    }

    const willOpen = args.flags.open || config.dev?.open === true;
    if (debugPort !== undefined && !willOpen) {
      log.warn('--debug-port has no effect without --open: there is no browser to attach to.');
    }

    let launchedProcess: import('node:child_process').ChildProcess | undefined;
    if (willOpen) {
      const { launchDevBrowser } = await import('../../core/launcher/index.js');
      const profileBase = config.dev?.profileDir
        ? resolve(root, config.dev.profileDir)
        : resolve(root, '.extforge', 'profile');
      const profileDir = join(profileBase, browser);
      // The dev build (createHMRServer -> build()/createBuildContext()) never
      // threads config.build.outDir through, so it always lands in
      // `dist/<browser>` regardless of that setting. Match it here.
      const distDir = join(root, 'dist', browser);
      const result = await launchDevBrowser({
        browser: browser as import('../../core/manifest/types.js').Browser,
        projectRoot: root,
        distDir,
        profileDir,
        binary: config.dev?.browserBinary,
        startUrls: config.dev?.startUrls,
        debugPort,
      });
      if (result.launched) {
        launchedProcess = result.process;
        log.success(`Opened ${browser} with the extension loaded (profile: ${profileDir})`);
        if (result.installedId) {
          log.info(`Installed extension: ${result.installedId}`);
        }
        if (result.debugPort !== undefined) {
          // The endpoint, spelled out. It is what a script needs to connect
          // and it is the fastest way to see the port is actually open.
          log.info(`CDP endpoint: http://127.0.0.1:${result.debugPort}`);
        }
        if (result.notice) log.warn(result.notice);
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
