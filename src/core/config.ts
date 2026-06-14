/**
 * ExtForge Configuration
 */

import { loadConfig, objectSource, configFileSource } from '@arshad-shah/config-kit';
import { loadConfigModule, resolveConfigFile, CONFIG_EXTENSIONS } from './config/loader.js';
import type { z, ZodError } from 'zod';
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
  // v1: config validation failures are hard errors by default. The opt-out
  // (`EXTFORGE_STRICT_CONFIG=0`) downgrades to a warning for users still
  // migrating; the internal `_strictConfig` override always forces strict.
  const forcedStrict = (overrides as { _strictConfig?: boolean })?._strictConfig === true;
  const optedOut = process.env['EXTFORGE_STRICT_CONFIG'] === '0' && !forcedStrict;

  // Resolved only so a validation error can cite the file; config-kit's
  // configFileSource does its own discovery for loading.
  const configFile = resolveConfigFile(cwd, 'extforge');

  // Keep the internal strict flag out of the merged config object.
  const cleanOverrides = overrides ? { ...overrides } : undefined;
  if (cleanOverrides) delete (cleanOverrides as { _strictConfig?: boolean })._strictConfig;

  const log = createLogger({ scope: 'config' });
  // Adapt ExtForge's logger to config-kit's structural ConfigLogger (whose
  // `error` also accepts an Error).
  const cfgLogger = {
    // config-kit emits a per-source "Loaded source" diagnostic at info; that's
    // debug-level detail for ExtForge, so it only shows under --verbose.
    info: (m: string, c?: Record<string, unknown>) => log.debug(m, c),
    warn: (m: string, c?: Record<string, unknown>) => log.warn(m, c),
    error: (m: string | Error, c?: Record<string, unknown>) => log.error(m instanceof Error ? m.message : m, c),
  };

  // config-kit owns discovery, deep-merge (defaults < file < overrides), and
  // validation. ExtForge supplies the schema, the TS-aware module loader, and
  // the strict/warn policy.
  const merged = await loadConfig<ExtForgeConfig>({
    schema: extForgeConfigSchema as unknown as { parse: (input: unknown) => ExtForgeConfig },
    sources: [
      objectSource(DEFAULT_CONFIG as Record<string, unknown>),
      configFileSource({
        name: 'extforge',
        cwd,
        extensions: [...CONFIG_EXTENSIONS],
        searchParents: false,
        load: (file) => loadConfigModule(file, cwd),
      }),
      ...(cleanOverrides ? [objectSource(cleanOverrides as Record<string, unknown>)] : []),
    ],
    mode: optedOut ? 'warn' : 'strict',
    logger: cfgLogger,
    // Surface the merged values to the error formatter: Zod 4 no longer carries
    // the rejected value on the issue, so we recover it from `ctx.merged`.
    includeValuesInErrors: true,
    onValidationError: (err, ctx) => formatZodError(err as ZodError, configFile, ctx.merged),
  });

  if (merged.browsers) {
    merged.browsers = Array.from(new Set(merged.browsers));
  }

  // Build the plugin list: built-ins first (so user plugins can override), then user plugins.
  const userPlugins = (merged.plugins ?? []) as ExtForgePlugin[];
  const builtins: ExtForgePlugin[] = [];
  if (merged.framework === 'react') builtins.push(presetReact());
  const allPlugins = [...builtins, ...userPlugins];

  // addEntry / emitFile are provided by the runner itself when it builds each
  // plugin's context, so they're not passed here.
  const runner = new PluginRunner(allPlugins, {
    config: Object.freeze({ ...merged }),
    paths: {
      root: cwd,
      src: resolve(cwd, merged.build?.srcDir ?? 'src'),
      dist: resolve(cwd, merged.build?.outDir ?? 'dist'),
    },
    logger: createLogger({ scope: 'plugins' }),
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
