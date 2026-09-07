import type { ParsedMessage } from './types.js';

/**
 * Generates a `declare module 'extforge/i18n'` augmentation from the default
 * locale's messages — one `MessageKeys` entry per key, with an `args` tuple
 * sized to the message's placeholder arity so `t()` calls are arity-checked.
 */
export function generateDts(messages: ParsedMessage[]): string {
  const entries = messages
    .map((m) => {
      const args = Array.from({ length: m.arity }, () => 'string').join(', ');
      return `    ${JSON.stringify(m.key)}: { args: [${args}] };`;
    })
    .join('\n');
  return [
    "declare module 'extforge/i18n' {",
    '  interface MessageKeys {',
    entries,
    '  }',
    '}',
  ].join('\n');
}
