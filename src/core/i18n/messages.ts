import type { ParsedMessage } from './types.js';

/** Chrome message keys allow only `[A-Za-z0-9_]` — dots from the dot-path key become underscores. */
export function chromeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9_]/g, '_');
}

/** Builds the `_locales/<lang>/messages.json` object Chrome expects. */
export function buildMessagesJson(messages: ParsedMessage[]): Record<string, { message: string }> {
  const out: Record<string, { message: string }> = {};
  for (const m of messages) {
    out[chromeKey(m.key)] = { message: m.message };
  }
  return out;
}
