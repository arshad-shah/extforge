/**
 * ExtForge Configuration
 */

import { loadConfig } from 'c12';
import type { Browser, ManifestConfig } from './manifest/index.js';
import { extForgeConfigSchema } from './config/schema.js';
import { formatZodError } from './config/format-errors.js';
import { existsSync } from 'node:fs';
import { join } from 'pathe';

// ─── Config shape ────────────────────────────────────────────────────────────

export interface ExtForgeConfig {
  root?: string;
  browsers?: Browser[];
  manifest?: ManifestConfig;
  build?: { outDir?: string; srcDir?: string; sourcemap?: boolean; esbuild?: Record<string, unknown> };
  dev?: { port?: number; host?: string; debounce?: number; open?: boolean };
  framework?: 'react' | 'vue' | 'svelte' | 'solid' | 'vanilla';
  css?: 'tailwind' | 'vanilla' | 'none';
  plugins?: ExtForgePlugin[];
}

export interface ExtForgePlugin {
  name: string;
  setup?: (config: ExtForgeConfig) => void | Promise<void>;
  buildStart?: () => void | Promise<void>;
  buildEnd?: (result: unknown) => void | Promise<void>;
}

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
    throw formatZodError(parsed.error, file);
  }
  if (merged.browsers) {
    merged.browsers = Array.from(new Set(merged.browsers));
  }
  return merged;
}

export function defineConfig(config: ExtForgeConfig): ExtForgeConfig {
  return config;
}
