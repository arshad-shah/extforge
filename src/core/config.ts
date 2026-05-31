/**
 * ExtForge Configuration
 */

import { loadConfigFile, mergeConfig } from './config/loader.js';
import type { z } from 'zod';
import type { ManifestConfig } from './manifest/index.js';
import { extForgeConfigSchema } from './config/schema.js';
import { formatZodError } from './config/format-errors.js';
import { resolve } from 'node:path';
import { PluginRunner } from './plugins/runner.js';
import { presetReact } from './plugins/preset-react.js';
import { createLogger } from './logger/index.js';

export type { ExtForgePlugin } from './plugins/types.js';
import type { ExtForgePlugin } from './plugins/types.js';

// ─── Config shape (derived from Zod schema — single source of truth) ─────────

export type ExtForgeConfig = z.infer<typeof extForgeConfigSchema> & {
  // These fields are not strictly modeled in the schema today; declared here so callers see them.
  manifest?: ManifestConfig;
  plugins?: ExtForgePlugin[];
  /** @internal Plugin runner attached by loadExtForgeConfig. Not part of the public API. */
  __pluginRunner?: PluginRunner;
};

// ─── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_CONFIG: ExtForgeConfig = {
  browsers: ['chrome', 'firefox'],
  build: { outDir: 'dist', srcDir: 'src', sourcemap: false },
  dev: { port: 35729, host: 'localhost', debounce: 150, open: false },
  framework: 'react',
  css: 'tailwind',
  plugins: [],
};

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loadExtForgeConfig(
  cwd: string = process.cwd(),
  overrides?: Partial<ExtForgeConfig>,
): Promise<ExtForgeConfig> {
  const { config: loaded, configFile } = await loadConfigFile<ExtForgeConfig>({
    name: 'extforge',
    cwd,
    defaults: DEFAULT_CONFIG,
  });
  // Overrides win over file-loaded values. Deep-merge nested objects so a
  // partial override (e.g. `{ dev: { port: 9000 } }`) doesn't drop the
  // siblings that came from defaults / the config file.
  const merged: ExtForgeConfig = mergeConfig(loaded, overrides);
  const parsed = extForgeConfigSchema.safeParse(merged);
  if (!parsed.success) {
    const err = formatZodError(parsed.error, configFile);
    if (process.env['EXTFORGE_STRICT_CONFIG'] === '1' || (overrides as { _strictConfig?: boolean })?._strictConfig) {
      throw err;
    }
    // Non-strict: warn loudly. Plugins downstream will receive `merged`
    // (the unvalidated config) — they're free to defensively pick the
    // fields they care about. The eventual transition to errors is
    // announced in the warning so users have time to migrate.
    const log = createLogger({ scope: 'config' });
    log.warn('Config validation warnings:');
    log.warn(err.message);
    log.warn('These warnings will become errors in a future major release. Set EXTFORGE_STRICT_CONFIG=1 to fail fast today.');
  }
  if (merged.browsers) {
    merged.browsers = Array.from(new Set(merged.browsers));
  }

  // Build the plugin list: built-ins first (so user plugins can override), then user plugins.
  const userPlugins = (merged.plugins ?? []) as ExtForgePlugin[];
  const builtins: ExtForgePlugin[] = [];
  if (merged.framework === 'react') builtins.push(presetReact());
  const allPlugins = [...builtins, ...userPlugins];

  const runner = new PluginRunner(allPlugins, {
    config: Object.freeze({ ...merged }),
    paths: {
      root: cwd,
      src: resolve(cwd, merged.build?.srcDir ?? 'src'),
      dist: resolve(cwd, merged.build?.outDir ?? 'dist'),
    },
    logger: createLogger({ scope: 'plugins' }),
    addEntry: () => {
      throw new Error('PluginContext.addEntry is not yet implemented (planned for a future release); use onBuildEntry to modify existing entries.');
    },
    emitFile: () => {
      throw new Error('PluginContext.emitFile is not yet implemented (planned for a future release).');
    },
  });
  await runner.setup();
  await runner.fireConfigResolved(merged);

  Object.defineProperty(merged, '__pluginRunner', {
    value: runner,
    enumerable: false,
    writable: false,
    configurable: false,
  });

  return merged;
}

export function defineConfig(config: ExtForgeConfig): ExtForgeConfig {
  return config;
}
