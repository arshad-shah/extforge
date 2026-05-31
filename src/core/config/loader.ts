/**
 * Config file module loader.
 *
 * Discovery, deep-merge, and validation now live in `@arshad-shah/config-kit`
 * (see `loadExtForgeConfig`); this module owns the one piece config-kit
 * delegates to a host: turning a resolved config file path into its default
 * export, compiling TypeScript on the fly via esbuild when needed.
 *
 * Intentionally limited: no `extends:` from URLs, no template fetching, no
 * rc-file merging. Those are not used by ExtForge.
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join, resolve, isAbsolute, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import * as esbuild from 'esbuild';
import { ExtForgeError } from '../errors/index.js';

/** Extensions probed for `<name>.config.<ext>`, in priority order (first match wins). */
export const CONFIG_EXTENSIONS = ['ts', 'mts', 'cts', 'mjs', 'js', 'cjs', 'json'] as const;

function toAbs(p: string): string {
  return isAbsolute(p) ? p : resolve(p);
}

/** Resolve the first existing `<name>.config.<ext>` in `cwd`, or `undefined`. */
export function resolveConfigFile(
  cwd: string,
  name: string,
  exts: readonly string[] = CONFIG_EXTENSIONS,
): string | undefined {
  for (const ext of exts) {
    const candidate = join(toAbs(cwd), `${name}.config.${ext}`);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

/**
 * Compile a TS/MTS/CTS file to a cached ESM file via esbuild and return its
 * absolute path. We write inside the project's node_modules/.cache/ so Node's
 * module resolver still sees the project's dependencies (most importantly,
 * any `import { defineConfig } from 'extforge'` in the user's config).
 *
 * Caller must delete the temp dir when done.
 */
function compileTsConfig(file: string, cwd: string): { tmpDir: string; outFile: string } {
  const cacheRoot = join(toAbs(cwd), 'node_modules', '.cache', 'extforge');
  mkdirSync(cacheRoot, { recursive: true });
  const tmpDir = mkdtempSync(join(cacheRoot, 'config-'));
  const outFile = join(tmpDir, 'config.mjs');
  try {
    esbuild.buildSync({
      entryPoints: [file],
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node20',
      // Don't try to bundle node_modules into the config — keep them external.
      packages: 'external',
      outfile: outFile,
      logLevel: 'silent',
    });
  } catch (err) {
    rmSync(tmpDir, { recursive: true, force: true });
    const e = err as { errors?: Array<{ text?: string; location?: { file?: string; line?: number; column?: number } }> };
    const e0 = e?.errors?.[0];
    throw new ExtForgeError({
      code: 'EXT_CONFIG_INVALID',
      message: e0?.text ?? `Failed to compile config: ${file}`,
      file: e0?.location?.file ?? file,
      line: e0?.location?.line,
      column: e0?.location?.column,
      hint: 'Fix the syntax error in your extforge.config and re-run.',
      cause: err,
    });
  }
  return { tmpDir, outFile };
}

/**
 * Detect whether the host package.json has `"type": "module"` so we know
 * how to load `.js` files (ESM dynamic import vs CJS require).
 */
function isPackageEsm(cwd: string): boolean {
  const pkgPath = join(toAbs(cwd), 'package.json');
  if (!existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { type?: string };
    return pkg.type === 'module';
  } catch {
    return false;
  }
}

async function importEsm(file: string): Promise<unknown> {
  // Cache-bust to force reload across test runs that mutate the same temp file
  // path. The host process keeps a module cache by URL.
  const url = pathToFileURL(file).href + `?t=${Date.now()}`;
  return await import(url);
}

function pickDefault<T>(mod: unknown): T {
  if (mod && typeof mod === 'object' && 'default' in mod) {
    const def = (mod as { default: unknown }).default;
    return (def ?? mod) as T;
  }
  return mod as T;
}

/**
 * Load a resolved config file and return its default export. Used as the
 * `load` callback for config-kit's `configFileSource`, so config-kit handles
 * discovery + deep-merge + validation while ExtForge keeps the TS-compilation
 * and ESM/CJS resolution rules it needs.
 */
export async function loadConfigModule<T = unknown>(file: string, cwd: string): Promise<T> {
  const nativeFile = file.split('/').join(sep);
  const ext = (() => {
    const m = /\.(ts|mts|cts|mjs|js|cjs|json)$/.exec(file);
    return m ? `.${m[1]}` : '';
  })();

  try {
    if (ext === '.json') {
      return JSON.parse(readFileSync(nativeFile, 'utf8')) as T;
    }
    if (ext === '.ts' || ext === '.mts' || ext === '.cts') {
      const { tmpDir, outFile } = compileTsConfig(nativeFile, cwd);
      try {
        return pickDefault<T>(await importEsm(outFile));
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    }
    if (ext === '.mjs') {
      return pickDefault<T>(await importEsm(nativeFile));
    }
    if (ext === '.cjs') {
      const require = createRequire(pathToFileURL(nativeFile).href);
      return pickDefault<T>(require(nativeFile));
    }
    // .js — ESM if the host package.json says so, CJS otherwise.
    if (isPackageEsm(cwd)) {
      return pickDefault<T>(await importEsm(nativeFile));
    }
    const require = createRequire(pathToFileURL(nativeFile).href);
    return pickDefault<T>(require(nativeFile));
  } catch (err) {
    if (err instanceof ExtForgeError) throw err;
    throw new ExtForgeError({
      code: 'EXT_CONFIG_INVALID',
      message: err instanceof Error ? err.message : String(err),
      file,
      hint: 'Check your extforge.config for runtime errors during evaluation.',
      cause: err,
    });
  }
}
