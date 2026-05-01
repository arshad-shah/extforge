/**
 * ExtForge Configuration
 */

import { loadConfig } from 'c12';
import type { z } from 'zod';
import type { ManifestConfig } from './manifest/index.js';
import { extForgeConfigSchema } from './config/schema.js';
import { formatZodError } from './config/format-errors.js';
import { existsSync } from 'node:fs';
import { join } from 'pathe';
import pc from 'picocolors';

// ─── Config shape (derived from Zod schema — single source of truth) ─────────

export interface ExtForgePlugin {
  name: string;
  setup?: (config: ExtForgeConfig) => void | Promise<void>;
  buildStart?: () => void | Promise<void>;
  buildEnd?: (result: unknown) => void | Promise<void>;
}

export type ExtForgeConfig = z.infer<typeof extForgeConfigSchema> & {
  // These fields are not strictly modeled in the schema today; declared here so callers see them.
  manifest?: ManifestConfig;
  plugins?: ExtForgePlugin[];
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
  const { config } = await loadConfig<ExtForgeConfig>({
    name: 'extforge', cwd,
    defaults: DEFAULT_CONFIG,
    overrides: overrides as ExtForgeConfig,
  });
  const merged = (config ?? DEFAULT_CONFIG) as ExtForgeConfig;
  const parsed = extForgeConfigSchema.safeParse(merged);
  if (!parsed.success) {
    const candidates = ['extforge.config.ts', 'extforge.config.js', 'extforge.config.mjs'];
    const file = candidates.map(f => join(cwd, f)).find(existsSync);
    const err = formatZodError(parsed.error, file);
    if (process.env['EXTFORGE_STRICT_CONFIG'] === '1' || (overrides as { _strictConfig?: boolean })?._strictConfig) {
      throw err;
    }
    console.error(pc.yellow('[extforge] Config validation warnings:'));
    console.error(pc.yellow(err.message));
    console.error(pc.yellow('These warnings will become errors in v0.4.0.'));
  }
  if (merged.browsers) {
    merged.browsers = Array.from(new Set(merged.browsers));
  }
  return merged;
}

export function defineConfig(config: ExtForgeConfig): ExtForgeConfig {
  return config;
}
