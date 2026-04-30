/**
 * ExtForge Configuration
 */

import { loadConfig } from 'c12';
import { defu } from 'defu';
import type { Browser, ManifestConfig } from './manifest/index.js';

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
  return defu(config ?? {}, DEFAULT_CONFIG) as ExtForgeConfig;
}

export function defineConfig(config: ExtForgeConfig): ExtForgeConfig {
  return config;
}
