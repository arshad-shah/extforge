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
 * v2 — coarse {type, files, scriptIds} envelope. Server emits this for
 *      everything that can't be hot-applied: manifest, background, content
 *      scripts, asset/CSS changes. Client treats it as reload-style.
 * v3 — fine-grained {type:'hmr-update', updates:[{id, hash, file}]}
 *      envelope used for UI-only JS changes (popup/options/sidepanel) where
 *      the React Fast Refresh path can swap components without a reload.
 *      Client refetches `chrome-extension://<id>/<file>?t=<hash>` and the
 *      RFR-transformed import calls performReactRefresh() automatically.
 *      v2 clients see v3 envelopes, fail the isCompatibleEnvelope check,
 *      and ignore them (one warning) — safe to mix.
 */
export const HMR_PROTOCOL_VERSION = 3 as const;
export type HMRProtocolVersion = typeof HMR_PROTOCOL_VERSION;
