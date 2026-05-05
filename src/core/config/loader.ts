/**
 * Config file loader — replaces c12 (which transitively pulls a vulnerable
 * tar via giget). Resolves and loads `<name>.config.{ts,mts,cts,js,mjs,cjs}`,
 * compiling TypeScript on the fly via esbuild when needed.
 *
 * Intentionally limited compared to c12: no `extends:` from URLs, no template
 * fetching, no rc-file merging. Those are not used by ExtForge.
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join, resolve, isAbsolute } from 'node:path/posix';
import { sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import * as esbuild from 'esbuild';
import { ExtForgeError } from '../errors/index.js';

export interface LoadConfigOptions<T> {
  /** Base name of the config file, e.g. `'extforge'` for `extforge.config.ts`. */
  name: string;
  /** Working directory where the config file lives. */
  cwd: string;
  /** Defaults merged underneath the loaded user config. */
  defaults: T;
  /** Extension order to probe; first match wins. */
  extensions?: readonly string[];
}

export interface LoadConfigResult<T> {
  /** The merged config: `{ ...defaults, ...userConfig }` (user wins). */
  config: T;
  /** Absolute path of the resolved config file, if any. */
  configFile?: string;
}

const DEFAULT_EXTENSIONS = ['.ts', '.mts', '.cts', '.mjs', '.js', '.cjs'] as const;

function toAbs(p: string): string {
  return isAbsolute(p) ? p : resolve(p);
}

function resolveConfigFile(cwd: string, name: string, exts: readonly string[]): string | undefined {
  for (const ext of exts) {
    const candidate = join(toAbs(cwd), `${name}.config${ext}`);
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
 * Shallow-merge defaults underneath user config (user wins). Adequate for
 * ExtForge's flat config; we deliberately don't deep-merge because that
 * surprised users in c12 (e.g. arrays getting concatenated).
 */
function mergeDefaults<T>(defaults: T, user: Partial<T> | undefined): T {
  if (!user) return defaults as T;
  return { ...(defaults as object), ...(user as object) } as T;
}

/**
 * Load a config file. Returns `{ config: defaults, configFile: undefined }`
 * if no file exists — callers can decide whether that's an error.
 */
export async function loadConfigFile<T>(opts: LoadConfigOptions<T>): Promise<LoadConfigResult<T>> {
  const exts = opts.extensions ?? DEFAULT_EXTENSIONS;
  const file = resolveConfigFile(opts.cwd, opts.name, exts);
  if (!file) {
    return { config: opts.defaults };
  }

  // Normalise to OS-native path (esbuild + Windows hates posix-only paths)
  const nativeFile = file.split('/').join(sep);

  let userConfig: Partial<T> | undefined;

  const ext = (() => {
    const m = /\.(ts|mts|cts|mjs|js|cjs)$/.exec(file);
    return m ? `.${m[1]}` : '';
  })();

  try {
    if (ext === '.ts' || ext === '.mts' || ext === '.cts') {
      const { tmpDir, outFile } = compileTsConfig(nativeFile, opts.cwd);
      try {
        const mod = await importEsm(outFile);
        userConfig = pickDefault<Partial<T>>(mod);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    } else if (ext === '.mjs') {
      const mod = await importEsm(nativeFile);
      userConfig = pickDefault<Partial<T>>(mod);
    } else if (ext === '.cjs') {
      const require = createRequire(pathToFileURL(__filenameSafe(nativeFile)).href);
      const mod = require(nativeFile);
      userConfig = pickDefault<Partial<T>>(mod);
    } else if (ext === '.js') {
      // Behaviour depends on the host package.json. ESM if "type": "module".
      if (isPackageEsm(opts.cwd)) {
        const mod = await importEsm(nativeFile);
        userConfig = pickDefault<Partial<T>>(mod);
      } else {
        const require = createRequire(pathToFileURL(__filenameSafe(nativeFile)).href);
        const mod = require(nativeFile);
        userConfig = pickDefault<Partial<T>>(mod);
      }
    }
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

  return {
    config: mergeDefaults(opts.defaults, userConfig),
    configFile: file,
  };
}

/**
 * `createRequire` needs a real URL of an existing file. We compute one from
 * the config file's directory rather than the file itself so we don't bind
 * `require` to a possibly-deleted temp.
 */
function __filenameSafe(file: string): string {
  // createRequire accepts a path or file:// URL; passing the path is fine.
  return file;
}
