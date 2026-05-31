import { defineCommand } from '@arshad-shah/clif';

export const upgrade = defineCommand({
  name: 'upgrade',
  description: 'Check for deprecated config (codemods land later)',
  async handler() {
    const { loadExtForgeConfig } = await import('../../core/config.js');
    const { createLogger } = await import('../../core/logger/index.js');
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
