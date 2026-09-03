// Pure functions used by both the dev server (Node) and the in-page client
// (template-injected). Tested directly via vitest.

import { HMR_PROTOCOL_VERSION } from './constants.js';

export interface ClientUpdate {
  v?: number;
  type: 'css' | 'js' | 'full-reload' | 'manifest' | 'assets' | 'protocol-mismatch';
  files: string[];
  scriptIds?: number[];
  timestamp?: number;
}

export function shouldClientReload(update: ClientUpdate, ownScriptId: number | undefined): boolean {
  if (update.type !== 'js') return true;
  if (!update.scriptIds || update.scriptIds.length === 0) return true;
  if (ownScriptId === undefined) return true;
  return update.scriptIds.includes(ownScriptId);
}

const BACKOFF: readonly number[] = [250, 500, 1000, 2000, 4000, 8000] as const;

export function nextBackoffDelay(attempt: number): number {
  if (attempt < 1) return BACKOFF[0]!;
  return BACKOFF[Math.min(attempt - 1, BACKOFF.length - 1)]!;
}

export function isCompatibleEnvelope(update: ClientUpdate): boolean {
  if (update.v === undefined) return true;
  return update.v <= HMR_PROTOCOL_VERSION;
}

const REASON_LABEL: Record<string, string> = {
  css: 'css hot swap',
  js: 'js',
  'full-reload': 'full-reload',
  manifest: 'manifest',
  assets: 'assets',
  'protocol-mismatch': 'protocol-mismatch',
};

export function formatReloadLog(
  ev: { type: ClientUpdate['type']; files: string[]; durationMs: number },
  clientCount: number,
): string {
  const reason = REASON_LABEL[ev.type] ?? ev.type;
  const target = clientCount === 1 ? '1 client' : `${clientCount} clients`;
  return `[hmr] reloaded ${ev.files.join(', ')} — ${reason} — ${ev.durationMs}ms (${target})`;
}

// ─── Extension reload relay (issue #88) ──────────────────────────────────────
//
// MV3 evicts an idle service worker after ~30s. A worker that holds its own
// WebSocket therefore loses it on every eviction, reconnects on `close`, and
// churns forever without a single file having changed. The worker holds no
// socket at all now: pages and content scripts already have a live socket, and
// they relay the reload request to the worker with `chrome.runtime.sendMessage`
// — which is also what wakes the worker up to serve it.

/** Wire type of the message a client sends to the worker to ask for a reload. */
export const RELOAD_RELAY_TYPE = 'extforge:hmr-reload' as const;

export interface ReloadRelayMessage {
  type: typeof RELOAD_RELAY_TYPE;
  /** The update type that triggered it — `full-reload`, `manifest`, `assets`. */
  reason: string;
}

export function createReloadRelayMessage(reason: string): ReloadRelayMessage {
  return { type: RELOAD_RELAY_TYPE, reason };
}

export function isReloadRelayMessage(message: unknown): message is ReloadRelayMessage {
  if (typeof message !== 'object' || message === null) return false;
  return (message as { type?: unknown }).type === RELOAD_RELAY_TYPE;
}

/**
 * How the reload was actually carried out.
 *
 * - `direct`      — this context could call `chrome.runtime.reload()` itself
 *                   (an extension page: popup, options, sidepanel).
 * - `relayed`     — handed to the service worker over `chrome.runtime`
 *                   (a content script, which has no `runtime.reload`).
 * - `page-reload` — no extension context reachable; refreshed the page.
 * - `unavailable` — nothing could be done; the caller was warned.
 */
export type ReloadOutcome = 'direct' | 'relayed' | 'page-reload' | 'unavailable';

export interface ReloadEnv {
  /** `chrome.runtime.reload`, when this context is allowed to call it. */
  reloadExtension?: () => void;
  /**
   * Sends the relay message to the service worker. Omitted when relaying is
   * not wanted (e.g. the v3 hot-update fallback, which must not escalate a
   * UI-only change into a whole-extension reload).
   */
  sendMessage?: (message: ReloadRelayMessage) => void;
  /** `location.reload`, when there is a document to refresh. */
  reloadPage?: () => void;
  /** Diagnostics sink. The dev loop must never fail silently. */
  warn?: (message: string) => void;
}

/**
 * Reload the extension from whichever context we happen to be in, degrading
 * one step at a time. Every step is guarded: an invalidated context makes
 * `chrome.runtime.reload()` throw, and we still want the page refresh below it.
 */
export function requestExtensionReload(reason: string, env: ReloadEnv): ReloadOutcome {
  if (env.reloadExtension) {
    try {
      env.reloadExtension();
      return 'direct';
    } catch (err) {
      env.warn?.(`chrome.runtime.reload() failed (${errText(err)}); trying the relay`);
    }
  }
  if (env.sendMessage) {
    try {
      env.sendMessage(createReloadRelayMessage(reason));
      return 'relayed';
    } catch (err) {
      env.warn?.(
        `could not reach the background service worker to reload the extension (${errText(err)}); ` +
          `reload it manually from the extensions page`,
      );
    }
  }
  if (env.reloadPage) {
    env.reloadPage();
    return 'page-reload';
  }
  env.warn?.(
    `no way to apply a "${reason}" update from this context; reload the extension manually`,
  );
  return 'unavailable';
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * The service worker half of the relay. Returns a `chrome.runtime.onMessage`
 * handler that reloads the extension on the first relay message it sees and
 * ignores everything else — including duplicates, since every open tab's
 * content script relays the same change at the same moment.
 */
export function createServiceWorkerReloadRelay(deps: {
  reload: () => void;
  log?: (message: string) => void;
}): (message: unknown) => boolean {
  let reloading = false;
  return (message: unknown): boolean => {
    if (!isReloadRelayMessage(message)) return false;
    if (reloading) return true;
    reloading = true;
    deps.log?.(`reloading extension (${message.reason})`);
    deps.reload();
    return true;
  };
}
