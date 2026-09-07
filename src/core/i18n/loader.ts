import { readdirSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { load as parseYaml } from 'js-yaml';
import { flattenMessages } from './parser.js';
import type { ParsedMessage } from './types.js';

const SUPPORTED_EXTENSIONS = new Set(['.yml', '.yaml', '.json']);

/**
 * Reads every `<locale>.yml` / `.yaml` / `.json` file in `localesDir` and
 * flattens each into dot-path messages, keyed by locale (the filename minus
 * extension, e.g. `en.yml` → `en`). Returns an empty map if the directory
 * doesn't exist.
 */
export function loadLocales(localesDir: string): Map<string, ParsedMessage[]> {
  const result = new Map<string, ParsedMessage[]>();
  let entries: string[];
  try {
    entries = readdirSync(localesDir);
  } catch {
    return result;
  }
  for (const entry of entries) {
    const ext = extname(entry);
    if (!SUPPORTED_EXTENSIONS.has(ext)) continue;
    const locale = basename(entry, ext);
    const raw = readFileSync(join(localesDir, entry), 'utf8');
    let data: unknown;
    try {
      data = ext === '.json' ? JSON.parse(raw) : parseYaml(raw);
    } catch (err) {
      throw new Error(
        `Failed to parse locale file "${entry}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    result.set(locale, flattenMessages(data));
  }
  return result;
}
