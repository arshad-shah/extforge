/**
 * ExtForge esbuild pass-through.
 *
 * `build.esbuild` in `extforge.config.ts` is an escape hatch: options declared
 * there are merged into every entry build, so a project can reach past the
 * defaults ExtForge picks (add a loader, drop a global, widen `target`) without
 * writing a plugin.
 *
 * Merging is not a blind spread. Three of esbuild's options are records whose
 * built-in entries a project almost never wants to discard — overriding
 * `loader` to add `.css: 'text'` must not delete the eight other loaders
 * ExtForge configures — so those merge key-by-key. `plugins` concatenates after
 * the builder's own. Everything else replaces.
 *
 * A handful of options belong to the builder. Honouring a project's `format`
 * would emit an ESM content script that no browser will inject; honouring
 * `metafile: false` would strip the data the build report reads. Those are
 * refused, with {@link collectReservedEsbuildKeys} surfacing them once per
 * build so the silence is explained rather than mysterious.
 */

import type * as esbuild from 'esbuild';

/**
 * esbuild options owned by the builder. A project override is dropped rather
 * than honoured — each of these silently corrupts the output.
 */
export const RESERVED_ESBUILD_KEYS: readonly string[] = [
  'entryPoints',
  'outdir',
  'outfile',
  'format',
  'splitting',
  'metafile',
  'write',
  'banner',
];

/**
 * Record-valued esbuild options. A project override merges into the built-in
 * entries key-by-key instead of replacing the whole record.
 */
export const MERGED_ESBUILD_KEYS: readonly string[] = ['define', 'loader', 'alias'];

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Names in `overrides` that the builder owns, in declaration order. Empty when
 * the project overrode nothing reserved. Callers log this once per build;
 * {@link applyEsbuildOverrides} drops the same keys silently so the warning
 * isn't repeated for every entry.
 */
export function collectReservedEsbuildKeys(
  overrides: Record<string, unknown> | undefined,
): string[] {
  if (!overrides) return [];
  return Object.keys(overrides).filter((key) => RESERVED_ESBUILD_KEYS.includes(key));
}

/**
 * Merge a project's `build.esbuild` options over the builder's base options.
 *
 * Reserved keys are dropped. `define` / `loader` / `alias` merge into the base
 * record; `plugins` is appended after the builder's own; every other key
 * replaces the base value.
 *
 * @param base - Options the builder assembled for this entry.
 * @param overrides - `config.build.esbuild`, if the project declared any.
 * @returns A new options object; `base` is not mutated.
 */
export function applyEsbuildOverrides(
  base: esbuild.BuildOptions,
  overrides: Record<string, unknown> | undefined,
): esbuild.BuildOptions {
  if (!overrides) return base;

  const merged: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(overrides)) {
    if (RESERVED_ESBUILD_KEYS.includes(key)) continue;

    if (key === 'plugins') {
      const basePlugins = Array.isArray(base.plugins) ? base.plugins : [];
      const userPlugins = Array.isArray(value) ? value : [];
      merged.plugins = [...basePlugins, ...userPlugins];
      continue;
    }

    if (MERGED_ESBUILD_KEYS.includes(key) && isPlainRecord(value)) {
      const baseRecord = merged[key];
      merged[key] = isPlainRecord(baseRecord) ? { ...baseRecord, ...value } : { ...value };
      continue;
    }

    merged[key] = value;
  }

  return merged as esbuild.BuildOptions;
}
