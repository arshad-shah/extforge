import { defineCommand } from '@arshad-shah/clif';

export const build = defineCommand({
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
    const { buildAll, build: buildOne } = await import('../../core/builder/index.js');
    const { loadExtForgeConfig } = await import('../../core/config.js');
    const { createLogger, LogLevel, jsonTransport } = await import('../../core/logger/index.js');
    const { ALL_BROWSERS } = await import('../../core/manifest/index.js');

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
