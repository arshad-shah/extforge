import type { ParsedMessage } from './types.js';

const PLACEHOLDER_RE = /\$([1-9])\b/g;

/** Highest positional placeholder (`$1`…`$9`) referenced in `message`, or 0 if none. */
export function countArity(message: string): number {
  let max = 0;
  for (const match of message.matchAll(PLACEHOLDER_RE)) {
    max = Math.max(max, Number(match[1]));
  }
  return max;
}

/**
 * Flattens a nested locale source (parsed YAML/JSON) into dot-path messages,
 * e.g. `{ popup: { title: "x" } }` → `[{ key: 'popup.title', message: 'x', arity: 0 }]`.
 */
export function flattenMessages(data: unknown, prefix = ''): ParsedMessage[] {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(
      `Locale source must be a mapping of keys to strings or nested mappings${
        prefix ? ` (at "${prefix}")` : ''
      }.`,
    );
  }
  const out: ParsedMessage[] = [];
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      out.push({ key: path, message: value, arity: countArity(value) });
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      out.push(...flattenMessages(value, path));
    } else {
      throw new Error(
        `Locale key "${path}" must be a string or a nested mapping, got ${
          Array.isArray(value) ? 'array' : typeof value
        }.`,
      );
    }
  }
  return out;
}
