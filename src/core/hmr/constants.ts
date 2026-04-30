/**
 * HMR Constants
 */

/** Extensions that qualify as CSS-only hot-injectable updates */
export const CSS_EXTENSIONS = new Set(['.css', '.scss', '.less']);

/** Extensions that qualify as static asset updates */
export const ASSET_EXTENSIONS = new Set(['.png', '.jpg', '.gif', '.svg', '.woff', '.woff2']);

/** Path fragments that indicate a background script change (requires full reload) */
export const BACKGROUND_PATTERNS = ['/background/', '/background.'] as const;

/** Path fragments that indicate an injected (page-context) script change (requires full reload) */
export const INJECTED_PATTERNS = ['/injected/', '/injected.'] as const;

/** Path fragments that indicate a manifest/config change */
export const MANIFEST_PATTERNS = ['extforge.config', 'manifest'] as const;

/** Default debounce delay in ms */
export const DEBOUNCE_MS = 150;

/** Default WS port */
export const DEFAULT_HMR_PORT = 35729;

/** Reconnect ceiling for port bumping */
export const MAX_PORT_RETRIES = 10;

/** Chokidar ignored globs */
export const WATCH_IGNORED = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.git/**',
  '**/.*',
] as const;
