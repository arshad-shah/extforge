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
  css:                'css hot swap',
  js:                 'js',
  'full-reload':      'full-reload',
  manifest:           'manifest',
  assets:             'assets',
  'protocol-mismatch':'protocol-mismatch',
};

export function formatReloadLog(
  ev: { type: ClientUpdate['type']; files: string[]; durationMs: number },
  clientCount: number,
): string {
  const reason = REASON_LABEL[ev.type] ?? ev.type;
  const target = clientCount === 1 ? '1 client' : `${clientCount} clients`;
  return `[hmr] reloaded ${ev.files.join(', ')} — ${reason} — ${ev.durationMs}ms (${target})`;
}
