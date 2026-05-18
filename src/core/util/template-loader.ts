/**
 * Shared template-loader factory.
 *
 * Both `scaffold/` (user-facing project files) and `hmr/` (runtime
 * snippets injected into the browser bundle) ship `.tpl` files alongside
 * their source. This module produces a `{ loadTemplate, loadTemplateRaw,
 * setTemplatesDir }` triple parameterised by the relative subdirectory,
 * so each consumer points at its own folder while reusing the same
 * runtime-location resolution + `{{VAR}}` interpolation logic.
 *
 * Why a factory rather than a single loader: tsup bundles the source
 * into chunks at unpredictable depths under `dist/`. The candidate
 * walker probes a handful of relative paths off `import.meta.url` and
 * picks the first one that exists. Each consumer needs its own probe
 * because the answer is consumer-specific.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface TemplateLoader {
  /** Read a template and interpolate `{{KEY}}` placeholders. */
  loadTemplate(filename: string, vars?: Record<string, string>): string;
  /** Read a template without interpolation (static copy). */
  loadTemplateRaw(filename: string): string;
  /** Override the templates dir — useful for tests. */
  setTemplatesDir(dir: string): void;
  /** Inspect the currently-resolved templates dir (lazy on first use). */
  getTemplatesDir(): string;
}

export interface TemplateLoaderOptions {
  /** Directory of the consuming module (typically `dirname(fileURLToPath(import.meta.url))`). */
  callerDir: string;
  /**
   * Relative path under each candidate to test. e.g.
   * `'scaffold/templates'` for scaffold, `'hmr/templates'` for HMR.
   */
  subPath: string;
}

/**
 * Build a loader for one templates directory. The candidates cover:
 *   - running from source via tsx (subPath sits next to the caller),
 *   - running from a bundled dist chunk at varying depth,
 *   - the dev `pnpm test` case where source is under `src/`.
 */
export function createTemplateLoader(opts: TemplateLoaderOptions): TemplateLoader {
  const { callerDir, subPath } = opts;
  // The leaf folder name (e.g. 'templates') is also valid alongside the
  // caller for the running-from-source case.
  const leaf = subPath.split('/').pop() ?? subPath;

  function resolve(): string {
    const candidates = [
      join(callerDir, leaf),                                       // source layout
      join(callerDir, subPath),                                    // bundled at root
      join(callerDir, '..', subPath),                              // one level down
      join(callerDir, '..', '..', subPath),                        // two levels down
      join(callerDir, '..', '..', '..', subPath),                  // three levels
      join(callerDir, '..', '..', '..', 'src', subPath),           // dev fallback
    ];
    for (const c of candidates) if (existsSync(c)) return c;
    return candidates[0]!;
  }

  let dir: string | undefined;
  function getTemplatesDir(): string {
    if (!dir) dir = resolve();
    return dir;
  }

  return {
    getTemplatesDir,
    setTemplatesDir(d: string) { dir = d; },
    loadTemplate(filename: string, vars: Record<string, string> = {}): string {
      let content = readFileSync(join(getTemplatesDir(), filename), 'utf-8');
      for (const [k, v] of Object.entries(vars)) {
        content = content.replaceAll(`{{${k}}}`, v);
      }
      return content;
    },
    loadTemplateRaw(filename: string): string {
      return readFileSync(join(getTemplatesDir(), filename), 'utf-8');
    },
  };
}
