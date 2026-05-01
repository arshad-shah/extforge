import type { Check } from '../index.js';
import { loadExtForgeConfig } from '../../config.js';

export const browserOverridesCheck: Check = {
  name: 'browser-overrides',
  async run({ cwd }) {
    try {
      const cfg = await loadExtForgeConfig(cwd);
      const browsers = new Set(cfg.browsers ?? []);
      const overrides = (cfg.manifest as { browsers?: Record<string, unknown> })?.browsers ?? {};
      const stray = Object.keys(overrides).filter(b => !browsers.has(b as never));
      if (stray.length === 0) return { name: 'browser-overrides', status: 'pass', message: 'Overrides match declared browsers' };
      return { name: 'browser-overrides', status: 'warn', message: `Overrides for non-target browsers: ${stray.join(', ')}` };
    } catch { return { name: 'browser-overrides', status: 'info', message: 'Skipped (config invalid)' }; }
  },
};
