/**
 * Template Loader
 *
 * Reads .tpl files from the templates/ directory next to this file,
 * applies {{KEY}} interpolation, and returns the result.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve the templates dir relative to this source file.
// Works both when running from src/ (via tsx) and from dist/ (built).
function resolveTemplatesDir(): string {
  // tsup bundles scaffold/* into one chunk, so this file's runtime location
  // is not always dist/core/scaffold/. We copy templates to a single known
  // location (dist/core/scaffold/templates/) via tsup's onSuccess hook, then
  // try a small set of candidates that cover: running from source via tsx,
  // running from a built dist, and the bundled-chunk case.
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(thisDir, 'templates'),                                          // src/core/scaffold/templates (tsx)
    join(thisDir, 'core', 'scaffold', 'templates'),                      // dist/<root>/ (bundled chunk)
    join(thisDir, '..', 'core', 'scaffold', 'templates'),                // dist/<sibling>/
    join(thisDir, '..', '..', 'core', 'scaffold', 'templates'),          // dist/<a>/<b>/
    join(thisDir, '..', '..', '..', 'core', 'scaffold', 'templates'),    // deeper nesting
    join(thisDir, '..', '..', '..', 'src', 'core', 'scaffold', 'templates'), // dev fallback
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  // Fall back to the first candidate so the eventual readFileSync reports
  // a meaningful path in the error.
  return candidates[0];
}

let _templatesDir: string | undefined;

function getTemplatesDir(): string {
  if (!_templatesDir) _templatesDir = resolveTemplatesDir();
  return _templatesDir;
}

/** Override the templates directory (useful for tests) */
export function setTemplatesDir(dir: string): void {
  _templatesDir = dir;
}

/**
 * Read a template file and interpolate {{KEY}} placeholders.
 *
 * @param filename  e.g. 'background.ts.tpl'
 * @param vars      e.g. { NAME: 'my-ext', VERSION: '0.1.0' }
 * @returns         interpolated content
 */
export function loadTemplate(
  filename: string,
  vars: Record<string, string> = {},
): string {
  const filePath = join(getTemplatesDir(), filename);
  let content = readFileSync(filePath, 'utf-8');

  for (const [key, value] of Object.entries(vars)) {
    content = content.replaceAll(`{{${key}}}`, value);
  }

  return content;
}

/**
 * Read a template file without interpolation (static copy).
 */
export function loadTemplateRaw(filename: string): string {
  const filePath = join(getTemplatesDir(), filename);
  return readFileSync(filePath, 'utf-8');
}
