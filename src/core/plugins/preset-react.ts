import type { ExtForgePluginV1 } from './types.js';

/** Options for `presetReact()`. */
export interface PresetReactOptions {
  /** JSX import source. Defaults to "react". Set to "preact" to use Preact. */
  jsxImportSource?: string;
  /** JSX runtime: "automatic" emits jsx-runtime imports; "classic" emits React.createElement calls. Defaults to "automatic". */
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
