// Release-time script: extracts the webextensions slice of MDN browser-compat-data
// into a committed data.json so the runtime doesn't need to ship the full BCD.
// Run: pnpm compat:rebuild
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const bcd = require('@mdn/browser-compat-data') as { webextensions?: { api?: unknown } };

interface ApiSupport {
  chrome?: string | false;
  firefox?: string | false;
  edge?: string | false;
  safari?: string | false;
}

function pickVersion(s: unknown): string | false {
  if (!s) return false;
  const arr = Array.isArray(s) ? s : [s];
  const main = arr[0] as { version_added?: string | boolean | null } | undefined;
  if (!main) return false;
  if (main.version_added === false) return false;
  if (typeof main.version_added === 'string') return main.version_added;
  if (main.version_added === true) return 'yes';
  return false;
}

function walk(node: unknown, prefix: string, out: Record<string, ApiSupport>): void {
  if (!node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  if (obj.__compat) {
    const compat = obj.__compat as { support?: Record<string, unknown> };
    const supp = compat.support ?? {};
    out[prefix] = {
      chrome:  pickVersion(supp.chrome),
      firefox: pickVersion(supp.firefox),
      edge:    pickVersion(supp.edge),
      safari:  pickVersion(supp.safari_ios) || pickVersion(supp.safari),
    };
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === '__compat') continue;
    walk(v, prefix ? `${prefix}.${k}` : k, out);
  }
}

const out: Record<string, ApiSupport> = {};
const root = bcd.webextensions?.api ?? {};
walk(root, '', out);

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, 'data.json');
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`Wrote ${Object.keys(out).length} APIs to ${outPath}`);
