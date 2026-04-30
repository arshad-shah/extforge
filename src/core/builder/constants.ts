/**
 * Builder Constants
 */

export const ESBUILD_TARGETS = ['chrome110', 'firefox115', 'safari16'];

export const ESBUILD_LOADERS: Record<string, string> = {
  '.tsx':   'tsx',
  '.ts':    'ts',
  '.css':   'css',
  '.svg':   'dataurl',
  '.png':   'dataurl',
  '.jpg':   'dataurl',
  '.gif':   'dataurl',
  '.woff':  'file',
  '.woff2': 'file',
};

/** Entry point paths to scan, relative to src/ */
export const ENTRY_SCANS = [
  { subPath: 'background',    outputKey: 'background/index' },
  { subPath: 'content',       outputKey: 'content/index' },
  { subPath: 'ui/popup',      outputKey: 'ui/popup/index' },
  { subPath: 'ui/options',    outputKey: 'ui/options/index' },
  { subPath: 'ui/sidepanel',  outputKey: 'ui/sidepanel/index' },
] as const;

/** HTML directories to copy */
export const HTML_DIRS = ['ui/popup', 'ui/options', 'ui/sidepanel'] as const;

/** Icon sizes to copy */
export const ICON_SIZES = [16, 32, 48, 128] as const;
