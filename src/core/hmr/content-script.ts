/**
 * Content-script HMR scaffolding.
 *
 * Plasmo punts on this: "content script output changes require extension
 * reload for consistency". ExtForge can do better by routing content scripts
 * through `chrome.scripting.registerContentScripts()` from the background SW
 * instead of the static manifest entry.
 *
 * The actual scripts injected at runtime live in `templates/` so they're
 * editable as plain TS files rather than embedded string literals.
 */

import { loadTemplate, loadTemplateRaw } from './template-loader.js';

export interface ContentScriptHMRDescriptor {
  /** Stable id — index in the user's `contentScripts` array. */
  id: number;
  /** Match patterns. */
  matches: string[];
  /** Path to the bundled JS, relative to the per-browser dist root. */
  js: string;
  /** Optional runAt timing. Default: 'document_idle'. */
  runAt?: 'document_start' | 'document_end' | 'document_idle';
}

/**
 * Generates a TypeScript-source background snippet that registers each
 * content script dynamically and re-registers them on HMR updates. Called by
 * the builder ONLY in dev mode AND only when the user has opted in via
 * `extforge.config.ts` `hmr.contentScripts: 'dynamic'`.
 */
export function generateContentScriptHMRBootstrap(
  descriptors: ContentScriptHMRDescriptor[],
): string {
  return loadTemplate('content-script-bootstrap.ts.tpl', {
    DESCRIPTORS_JSON: JSON.stringify(descriptors, null, 2),
  });
}

/**
 * Per-tab dispose registry runtime — the bit of code injected into every
 * dynamically-registered content script. User code calls
 * `__extforgeDispose__(() => cleanup())` to register teardown for HMR swaps.
 */
export const CONTENT_SCRIPT_HMR_RUNTIME: string = loadTemplateRaw('content-script-runtime.ts.tpl').trim();
