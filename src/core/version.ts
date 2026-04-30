/**
 * Reads the ExtForge version from package.json — single source of truth.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'pathe';
import { fileURLToPath } from 'node:url';

let _version: string | undefined;

export function getVersion(): string {
  if (_version) return _version;

  const thisDir = dirname(fileURLToPath(import.meta.url));
  // Walk up from src/core/ or dist/core/ to find package.json
  const candidates = [
    join(thisDir, '..', '..', 'package.json'),         // src/core/ → root
    join(thisDir, '..', '..', '..', 'package.json'),   // dist/core/ → root
  ];

  for (const p of candidates) {
    try {
      const pkg = JSON.parse(readFileSync(p, 'utf-8'));
      _version = pkg.version ?? '0.0.0';
      if (typeof _version !== 'string') {
        _version = '0.0.0';
      }
      return _version;
    } catch { /* try next */ }
  }

  _version = '0.0.0';
  return _version;
}
