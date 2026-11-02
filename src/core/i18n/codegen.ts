import type { ParsedMessage } from './types.js';

/**
 * Generates the default locale's keys as the global `ExtForgeI18nMessageKeys`
 * interface: one entry per key, with an `args` tuple sized to the message's
 * placeholder arity so `t()` calls are arity-checked.
 *
 * It must be a plain global interface, not `declare module 'extforge/i18n'`.
 * The output lands in `.extforge/modules.d.ts`, a script file, where that
 * block would declare a new ambient module that hides the real one.
 */
export function generateDts(messages: ParsedMessage[]): string {
  const entries = messages
    .map((m) => {
      const args = Array.from({ length: m.arity }, () => 'string').join(', ');
      return `  ${JSON.stringify(m.key)}: { args: [${args}] };`;
    })
    .join('\n');
  return [
    '/** Message keys for `t()` from extforge/i18n. */',
    'interface ExtForgeI18nMessageKeys {',
    entries,
    '}',
  ].join('\n');
}
