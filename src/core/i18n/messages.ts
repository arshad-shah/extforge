import type { ParsedMessage } from './types.js';

/** Chrome message keys allow only `[A-Za-z0-9_]` — dots from the dot-path key become underscores. */
export function chromeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9_]/g, '_');
}

/**
 * Builds the `_locales/<lang>/messages.json` object Chrome expects.
 *
 * Throws if two source keys land on the same Chrome key, either because the
 * dot-path flattening makes them equal (`popup.title` / `popup_title`) or
 * because they differ only by case, which Chrome ignores. Without this,
 * one message would silently overwrite the other.
 */
export function buildMessagesJson(messages: ParsedMessage[]): Record<string, { message: string }> {
  const out: Record<string, { message: string }> = {};
  const seen = new Map<string, string>();
  for (const m of messages) {
    const key = chromeKey(m.key);
    const folded = key.toLowerCase();
    const previous = seen.get(folded);
    if (previous !== undefined) {
      throw new Error(
        `i18n: keys "${previous}" and "${m.key}" both become "${key}" in messages.json ` +
          '(Chrome keys allow only letters, digits and _, and ignore case). Rename one of them.',
      );
    }
    seen.set(folded, m.key);
    out[key] = { message: m.message };
  }
  return out;
}
