/**
 * The single list of entrypoints the builder works from.
 *
 * Phase 1 of #96 (see docs/superpowers/specs/2026-11-02-entrypoint-discovery-design.md):
 * today's three discovery paths (fixed ENTRY_SCANS, src/injected, src/contents
 * CSUI) feed one `Entrypoint[]` with unchanged output keys. Later phases add
 * discovery of the new layout to the same list.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ENTRY_SCANS, INJECTED_DIR } from '../builder/constants.js';
import {
  type ContentScriptStaticOptions,
  type CSUIDiscovery,
  discoverCSUI,
} from '../csui/discovery.js';
import type { Logger } from '../logger/index.js';
import type { PageScript } from './discover.js';

export type EntrypointKind =
  | 'background'
  | 'content'
  | 'popup'
  | 'options'
  | 'sidepanel'
  | 'injected'
  | 'csui';

export interface Entrypoint {
  /** Output key: the built file's path in the browser's outDir, without extension. */
  name: string;
  kind: EntrypointKind;
  /** Absolute source path. */
  input: string;
  /** Content scripts, CSUI and injected scripts must be classic scripts. */
  format: 'esm' | 'iife';
  /** Statically extracted options, for CSUI entries. */
  csui?: CSUIDiscovery;
  /** Generated mode: options read from `defineContentScript()`. */
  contentScript?: ContentScriptStaticOptions;
  /** Generated mode: an HTML page; `input` is the HTML and `scripts` are what gets bundled. */
  page?: { html: string; scripts: PageScript[] };
}

const KIND_BY_KEY: Record<string, EntrypointKind> = {
  'background/index': 'background',
  'content/index': 'content',
  'ui/popup/index': 'popup',
  'ui/options/index': 'options',
  'ui/sidepanel/index': 'sidepanel',
};

/** Fixed-path entries: `src/<sub>.ts(x)` or `src/<sub>/index.ts(x)` for each ENTRY_SCANS row. */
export function discoverEntryPoints(srcDir: string): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const { subPath, outputKey } of ENTRY_SCANS) {
    for (const ext of ['.ts', '.tsx']) {
      const direct = join(srcDir, subPath + ext);
      const index = join(srcDir, subPath, `index${ext}`);
      if (existsSync(direct)) {
        entries[outputKey] = direct;
        break;
      }
      if (existsSync(index)) {
        entries[outputKey] = index;
        break;
      }
    }
  }
  return entries;
}

/** `src/injected/<name>.ts(x)` → `injected/<name>`, or a loose `src/injected.ts(x)` → `injected`. */
export function discoverInjectedEntries(srcDir: string, log: Logger): Record<string, string> {
  const entries: Record<string, string> = {};
  const dir = join(srcDir, INJECTED_DIR);
  const looseTs = join(srcDir, 'injected.ts');
  const looseTsx = join(srcDir, 'injected.tsx');

  if (existsSync(dir) && statSync(dir).isDirectory()) {
    if (existsSync(looseTs) || existsSync(looseTsx)) {
      log.warn(
        'Both src/injected/ and src/injected.ts(x) exist; using directory mode and ignoring the loose file.',
      );
    }
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isFile()) continue;
      const m = /^(.+)\.tsx?$/.exec(e.name);
      if (!m) continue;
      entries[`injected/${m[1]}`] = join(dir, e.name);
    }
    return entries;
  }

  if (existsSync(looseTs)) entries.injected = looseTs;
  else if (existsSync(looseTsx)) entries.injected = looseTsx;
  return entries;
}

/**
 * Split discovered entries into ESM and IIFE buckets.
 * MV3 requires content scripts to be IIFE; injected scripts must be IIFE because
 * they're loaded into page context via a <script src> tag (no module semantics).
 * Background and UI entries remain ESM.
 *
 * Pure function — does not mutate inputs.
 */
export function partitionEntriesForFormat(
  allEntries: Record<string, string>,
  injectedEntries: Record<string, string>,
): { esmEntries: Record<string, string>; iifeEntries: Record<string, string> } {
  const esmEntries: Record<string, string> = { ...allEntries };
  const iifeEntries: Record<string, string> = { ...injectedEntries };

  if (esmEntries['content/index']) {
    iifeEntries['content/index'] = esmEntries['content/index'];
    delete esmEntries['content/index'];
  }

  return { esmEntries, iifeEntries };
}

/** Every entrypoint the current (legacy) layout defines, sorted by output key. */
export function discoverLegacyEntrypoints(srcDir: string, log: Logger): Entrypoint[] {
  const out: Entrypoint[] = [];
  for (const [name, input] of Object.entries(discoverEntryPoints(srcDir))) {
    const kind = KIND_BY_KEY[name] as EntrypointKind;
    out.push({ name, kind, input, format: kind === 'content' ? 'iife' : 'esm' });
  }
  for (const [name, input] of Object.entries(discoverInjectedEntries(srcDir, log))) {
    out.push({ name, kind: 'injected', input, format: 'iife' });
  }
  for (const csui of discoverCSUI(srcDir)) {
    out.push({ name: csui.entryKey, kind: 'csui', input: csui.file, format: 'iife', csui });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** `{ outputKey: absoluteInput }` for one format, as esbuild's `entryPoints` wants. */
export function entryPointsFor(
  entrypoints: Entrypoint[],
  format: 'esm' | 'iife',
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of entrypoints) {
    if (e.format !== format) continue;
    // A page bundles the scripts its HTML loads, not the HTML itself.
    if (e.page) for (const s of e.page.scripts) out[s.name] = s.input;
    else out[e.name] = e.input;
  }
  return out;
}
