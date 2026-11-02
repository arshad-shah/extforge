/**
 * extforge/i18n — typed `chrome.i18n` wrapper.
 *
 * Source of truth is `locales/<lang>.yml` (or `.yaml` / `.json`), compiled by
 * ExtForge's build into `_locales/<lang>/messages.json` plus generated key
 * types in `.extforge/modules.d.ts` (include it in your tsconfig):
 *
 *   interface ExtForgeI18nMessageKeys {
 *     'popup.title': { args: [] };
 *     'popup.greeting': { args: [string] };
 *   }
 *
 * The generated file is a script, not a module, so it fills a *global*
 * interface. A `declare module 'extforge/i18n'` block there would replace this
 * module instead of extending it. `MessageKeys` extends the global one and
 * can still be augmented by hand with `declare module 'extforge/i18n'` from a
 * module file.
 *
 * `t('popup.title')` and `t('popup.greeting', ['Sam'])` are then both typed
 * and arity-checked — an unknown key or a wrong substitution count is a
 * compile error, matching the `extforge/messaging` `MessageMap` pattern.
 */

declare global {
  // biome-ignore lint/suspicious/noEmptyInterface: filled by the generated .extforge/modules.d.ts.
  interface ExtForgeI18nMessageKeys {}
}

// biome-ignore lint/suspicious/noEmptyInterface: augmentation slot for hand-written keys.
export interface MessageKeys extends ExtForgeI18nMessageKeys {}

type Key = keyof MessageKeys & string;
type Args<K extends Key> = MessageKeys[K] extends { args: infer A } ? A : readonly string[];

interface ChromeI18n {
  getMessage(key: string, substitutions?: string | string[]): string;
}

/** Dot-path key → chrome message key (Chrome only allows `[A-Za-z0-9_]`). */
function chromeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9_]/g, '_');
}

/**
 * Looks up a message by its dot-path key (matching the source locale file)
 * and substitutes `$1`, `$2`, … placeholders. Falls back to the resolved
 * chrome-style key when `chrome.i18n` isn't available — e.g. unit tests
 * running outside an extension context.
 */
export function t<K extends Key>(
  key: K,
  ...substitutions: Args<K> extends readonly [] ? [] : [Args<K>]
): string {
  const resolvedKey = chromeKey(key);
  const api = (globalThis as { chrome?: { i18n?: ChromeI18n } }).chrome?.i18n;
  if (!api) return resolvedKey;
  return api.getMessage(resolvedKey, substitutions[0] as string[] | undefined) || resolvedKey;
}
