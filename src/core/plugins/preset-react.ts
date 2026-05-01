import type { ExtForgePluginV1 } from './types.js';

export interface PresetReactOptions {
  jsxImportSource?: string;
  jsxRuntime?: 'automatic' | 'classic';
}

export function presetReact(options: PresetReactOptions = {}): ExtForgePluginV1 {
  const importSource = options.jsxImportSource ?? 'react';
  const runtime = options.jsxRuntime ?? 'automatic';

  return {
    name: 'extforge:preset-react',
    apiVersion: 1,
    setup({ hooks, logger }) {
      hooks.onBuildEntry((entry) => ({
        ...entry,
        esbuildOptions: {
          ...(entry.esbuildOptions ?? {}),
          jsx: runtime === 'automatic' ? 'automatic' : 'transform',
          jsxImportSource: importSource,
        },
      }));
      logger.debug('preset-react ready');
    },
  };
}
