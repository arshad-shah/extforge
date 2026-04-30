/**
 * Template Loader
 *
 * Reads .tpl files from the templates/ directory next to this file,
 * applies {{KEY}} interpolation, and returns the result.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'pathe';
import { fileURLToPath } from 'node:url';

// Resolve the templates dir relative to this source file.
// Works both when running from src/ (via tsx) and from dist/ (built).
function resolveTemplatesDir(): string {
  // When running unbundled via tsx, __dirname equivalent:
  const thisDir = dirname(fileURLToPath(import.meta.url));
  // Templates live at src/core/scaffold/templates/ in source,
  // or dist/core/scaffold/templates/ in built output.
  // We ship them alongside via tsup's "files" field in package.json.
  const candidates = [
    join(thisDir, 'templates'),                     // running from source
    join(thisDir, '..', '..', '..', 'src', 'core', 'scaffold', 'templates'), // from dist/
  ];
  return candidates[0]; // Always source-relative when using tsx
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
