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

/**
 * v2 — coarse {type, files, scriptIds} envelope. Currently emitted by the
 *      dev server. Triggers reload-style updates on the client.
 * v3 — fine-grained {type:'hmr-update', updates:[{id, hash, chunkUrl}]}
 *      envelope routed through the new module registry runtime
 *      (src/core/hmr/runtime.ts). The server doesn't emit v3 yet — the
 *      esbuild plugin that rewrites user modules into the registry is
 *      tracked as Phase 4 follow-up. Bumping this constant to 3 should
 *      happen alongside that change.
 */
export const HMR_PROTOCOL_VERSION = 2 as const;
export type HMRProtocolVersion = typeof HMR_PROTOCOL_VERSION;
