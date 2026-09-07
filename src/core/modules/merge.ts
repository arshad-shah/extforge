import type { ManifestObject } from '../plugins/types.js';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Merges `patch` into `base` for `ctx.extendManifest()`: arrays are
 * concatenated and de-duplicated (so two modules each adding `permissions`
 * don't clobber each other), plain objects merge recursively, and everything
 * else (strings, numbers, booleans) overwrites — matching how a single
 * module author would expect their patch to layer on top of what came
 * before.
 */
export function deepMergeManifest(base: ManifestObject, patch: ManifestObject): ManifestObject {
  if (!isPlainObject(patch)) return base;
  const result: ManifestObject = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const existing = result[key];
    if (Array.isArray(value) && Array.isArray(existing)) {
      result[key] = [...new Set([...existing, ...value])];
    } else if (isPlainObject(value) && isPlainObject(existing)) {
      result[key] = deepMergeManifest(existing, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}
