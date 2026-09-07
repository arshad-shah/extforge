/**
 * extforge/i18n — typed `chrome.i18n` wrapper.
 *
 * Source of truth is `locales/<lang>.yml` (or `.yaml` / `.json`), compiled by
 * ExtForge's build into `_locales/<lang>/messages.json` plus a generated
 * `MessageKeys` augmentation (see `.extforge/modules.d.ts`):
 *
 *   declare module 'extforge/i18n' {
 *     interface MessageKeys {
 *       'popup.title': { args: [] };
 *       'popup.greeting': { args: [string] };
 *     }
 *   }
 *
 * `t('popup.title')` and `t('popup.greeting', ['Sam'])` are then both typed
 * and arity-checked — an unknown key or a wrong substitution count is a
 * compile error, matching the `extforge/messaging` `MessageMap` pattern.
 */

// biome-ignore lint/suspicious/noEmptyInterface: augmentation slot — generated codegen merges keys into it.
export interface MessageKeys {}

type Key = keyof MessageKeys & string;
type Args<K extends Key> = MessageKeys[K] extends { args: infer A } ? A : readonly string[];

interface ChromeI18n {
  getMessage(key: string, substitutions?: string | string[]): string;
}

/** Dot-path key → chrome message key (Chrome only allows `[A-Za-z0-9_]`). */
function chromeKey(key: string): string {
  return key.replace(/\./g, '_');
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
