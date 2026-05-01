import type { Check } from '../index.js';
import { loadExtForgeConfig } from '../../config.js';
import { isExtForgeError } from '../../errors/index.js';

export const configValidCheck: Check = {
  name: 'config-valid',
  async run({ cwd }) {
    try {
      await loadExtForgeConfig(cwd);
      return { name: 'config-valid', status: 'pass', message: 'extforge.config is valid' };
    } catch (err) {
      if (isExtForgeError(err)) {
        return { name: 'config-valid', status: 'fail', message: err.message.split('\n')[0]!, hint: err.hint };
      }
      return { name: 'config-valid', status: 'fail', message: String(err) };
    }
  },
};
