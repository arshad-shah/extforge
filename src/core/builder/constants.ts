/**
 * Builder Constants
 */

// Refresh these alongside MV3 floors. Chrome MV3 service workers required
// Chrome 88+ (Nov 2020); Firefox MV3 shipped in 109. Safari 17 shipped MV3
// in 2023 with full WebExtension parity. Picking the floors gives us the
// widest install base without forcing legacy transforms that bloat output.
export const ESBUILD_TARGETS = ['chrome120', 'firefox128', 'safari17', 'edge120'];

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

/** Directory under src/ for multi-entry injected (page-context) scripts */
export const INJECTED_DIR = 'injected';
