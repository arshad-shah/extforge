import type { Check } from '../index.js';
import { loadExtForgeConfig } from '../../config.js';
import { extForgeConfigSchema } from '../../config/schema.js';

export const configValidCheck: Check = {
  name: 'config-valid',
  async run({ cwd }) {
    let loaded: unknown;
    try {
      loaded = await loadExtForgeConfig(cwd);
    } catch {
      return { name: 'config-valid', status: 'fail', message: 'Could not load extforge.config' };
    }
    const parsed = extForgeConfigSchema.safeParse(loaded);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const path = firstIssue?.path.join('.') || '<root>';
      return {
        name: 'config-valid',
        status: 'fail',
        message: `extforge.config is invalid: ${path} — ${firstIssue?.message ?? 'validation error'}`,
        hint: 'Fix the fields above and re-run.',
      };
    }
    return { name: 'config-valid', status: 'pass', message: 'extforge.config is valid' };
  },
};
