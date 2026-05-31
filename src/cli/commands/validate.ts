import { defineCommand } from '@arshad-shah/clif';

export const validate = defineCommand({
  name: 'validate',
  description: 'Validate project structure and config',
  args: {
    quiet: { type: 'boolean', description: 'Suppress info-level output', default: false },
    json:  { type: 'boolean', description: 'Emit machine-readable JSON', default: false },
  },
  async handler({ args }) {
    const { validateProject } = await import('../../core/validator/index.js');
    const { loadExtForgeConfig } = await import('../../core/config.js');
    const { createLogger, LogLevel, jsonTransport } = await import('../../core/logger/index.js');
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
