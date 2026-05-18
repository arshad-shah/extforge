/**
 * extforge/env — build-time .env loader and esbuild `define` helper.
 *
 * Plasmo parity: matches the `PLASMO_PUBLIC_*` flow but uses the
 * `EXTFORGE_PUBLIC_*` prefix.
 *
 * - At build time: load `.env`, `.env.local`, `.env.<NODE_ENV>`,
 *   `.env.<NODE_ENV>.local` (later wins), then merge over `process.env`.
 *   Every key starting with `EXTFORGE_PUBLIC_` is inlined into the bundle as
 *   `import.meta.env.<KEY>` and `process.env.<KEY>` via esbuild's `define`.
 * - At runtime: user code reads `import.meta.env.EXTFORGE_PUBLIC_FOO` (the
 *   `extforge/env` types augment `ImportMetaEnv` for autocompletion).
 *
 * Non-public keys are NEVER inlined into the bundle — they remain available
 * only to the dev server / build process (e.g. for plugin config).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const ENV_PREFIX = 'EXTFORGE_PUBLIC_';

export type EnvMode = 'development' | 'production' | 'test' | (string & {});

export interface LoadEnvOptions {
  /** Project root (where .env files live). */
  cwd: string;
  /** NODE_ENV to expand `.env.<mode>` files. Default: 'production'. */
  mode?: EnvMode;
  /** Process env to overlay last. Default: `process.env`. */
  processEnv?: Record<string, string | undefined>;
}

export interface LoadedEnv {
  /** Every key/value from .env files + processEnv (no filtering). */
  raw: Record<string, string>;
  /** Subset of `raw` whose keys begin with the EXTFORGE_PUBLIC_ prefix. */
  publicEnv: Record<string, string>;
  /** Files actually read, in order of precedence (low → high). */
  files: string[];
}

const DOTENV_LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/;

/** Tiny dotenv parser. Doesn't support multi-line values or variable interpolation. */
export function parseDotenv(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const m = DOTENV_LINE.exec(line);
    if (!m) continue;
    const key = m[1]!;
    let val = m[2] ?? '';
    // Strip a wrapping pair of quotes (single or double).
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    // Drop trailing inline comments only on unquoted values.
    if (!/^["']/.test(m[2] ?? '')) {
      const hashIdx = val.indexOf(' #');
      if (hashIdx !== -1) val = val.slice(0, hashIdx).trim();
    }
    out[key] = val;
  }
  return out;
}

/**
 * Load .env files in Vite/Plasmo precedence order:
 *   .env                 (lowest)
 *   .env.local
 *   .env.<mode>
 *   .env.<mode>.local    (highest)
 *   processEnv           (overlay)
 */
export function loadEnv(options: LoadEnvOptions): LoadedEnv {
  const mode = options.mode ?? 'production';
  const candidates = [
    '.env',
    '.env.local',
    `.env.${mode}`,
    `.env.${mode}.local`,
  ];

  const raw: Record<string, string> = {};
  const filesRead: string[] = [];

  for (const rel of candidates) {
    const abs = join(options.cwd, rel);
    if (!existsSync(abs)) continue;
    const text = readFileSync(abs, 'utf8');
    Object.assign(raw, parseDotenv(text));
    filesRead.push(abs);
  }

  // Overlay process.env. Only overlay actual strings (skip undefined).
  const procEnv = options.processEnv ?? process.env;
  for (const [k, v] of Object.entries(procEnv)) {
    if (typeof v === 'string') raw[k] = v;
  }

  const publicEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith(ENV_PREFIX)) publicEnv[k] = v;
  }

  return { raw, publicEnv, files: filesRead };
}

/**
 * Convert a `publicEnv` record into an esbuild `define` map. Builder integrates
 * this into its shared esbuild options.
 */
export function publicEnvToDefine(
  publicEnv: Record<string, string>,
  mode: EnvMode = 'production',
): Record<string, string> {
  const define: Record<string, string> = {};
  // Synthesize a single `import.meta.env` object literal.
  const envObj: Record<string, string> = { MODE: mode, PROD: String(mode === 'production'), DEV: String(mode === 'development') };
  for (const [k, v] of Object.entries(publicEnv)) envObj[k] = v;
  define['import.meta.env'] = JSON.stringify(envObj);

  // Per-key process.env.* aliases for code that reads them directly.
  for (const [k, v] of Object.entries(publicEnv)) {
    define[`process.env.${k}`] = JSON.stringify(v);
  }
  return define;
}
