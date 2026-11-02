/**
 * Generated-mode discovery (#96 phase 2): entrypoints found in `src/` by name.
 *
 * Only reserved names, entry suffixes and pages count, so ordinary code in
 * `src/` (`lib/index.ts`, `components/…`) is never mistaken for an entry:
 *
 *   background.ts | background/index.ts           → background.js
 *   popup|options|sidepanel: <n>.html | <n>/index.html  → <n>.html + <n>.js
 *   content.ts                                     → content-scripts/content.js
 *   <x>.content.ts | <x>.content/index.ts          → content-scripts/<x>.js
 *
 * Injected scripts and CSUI keep their current discovery and output keys
 * until phase 3. See docs/superpowers/specs/2026-11-02-entrypoint-discovery-design.md.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { extractContentScriptOptions } from '../csui/discovery.js';
import type { Logger } from '../logger/index.js';
import type { ManifestConfig } from '../manifest/types.js';
import { discoverInjectedEntries, discoverLegacyEntrypoints, type Entrypoint } from './index.js';

export const PAGE_KINDS = ['popup', 'options', 'sidepanel'] as const;
export type PageKind = (typeof PAGE_KINDS)[number];

/** A page's module scripts, resolved to source files, and the output names they get. */
export interface PageScript {
  /** The `src` attribute as written. */
  src: string;
  /** Absolute source file it resolves to. */
  input: string;
  /** Output key of the built script (`popup`, `popup-2`, …). */
  name: string;
}

const SCRIPT_EXTS = ['.ts', '.tsx', '.js', '.jsx'];
const MODULE_SCRIPT_RE = /<script\b([^>]*?)\bsrc\s*=\s*(["'])([^"']+)\2([^>]*)>/gi;

/** Folders only the legacy layout uses: their output paths are part of today's contract. */
export const LEGACY_ONLY_DIRS = ['ui', 'content'] as const;

/**
 * Whether a project stays on the legacy layout: its config hand-writes entry
 * paths, or it has a legacy-only folder (`src/ui/`, `src/content/`). Either
 * means something (the config, or a plugin's manifest transform) may depend on
 * today's output paths, so nothing about its build changes.
 */
export function usesLegacyLayout(manifest: ManifestConfig | undefined, srcDir: string): boolean {
  if (!manifest) return true;
  const handWritten = Boolean(
    manifest.background?.entrypoint ||
      manifest.action?.defaultPopup ||
      manifest.optionsPage ||
      manifest.sidePanel?.defaultPath ||
      manifest.contentScripts?.some((c) => (c.js?.length ?? 0) > 0),
  );
  return (
    handWritten ||
    LEGACY_ONLY_DIRS.some(
      (d) => existsSync(join(srcDir, d)) && statSync(join(srcDir, d)).isDirectory(),
    )
  );
}

function firstExisting(paths: string[]): string | undefined {
  return paths.find((p) => existsSync(p) && statSync(p).isFile());
}

const withExts = (base: string, exts: string[]) => exts.map((e) => base + e);

/**
 * `<script type="module" src="…">` tags with a relative src. A `./index.js`
 * that doesn't exist resolves to a sibling `.ts`/`.tsx` with the same name,
 * so HTML can point at either the source or the built file name.
 */
export function pageScripts(htmlPath: string, pageName: string): PageScript[] {
  const html = readFileSync(htmlPath, 'utf8');
  const scripts: PageScript[] = [];
  for (const m of html.matchAll(MODULE_SCRIPT_RE)) {
    const attrs = `${m[1]} ${m[4]}`;
    const src = m[3] as string;
    if (!/\btype\s*=\s*(["'])module\1/i.test(attrs)) continue;
    if (/^([a-z]+:)?\/\//i.test(src) || src.startsWith('/')) continue;
    const abs = resolve(dirname(htmlPath), src);
    const stem = abs.replace(/\.(js|jsx|ts|tsx|mjs)$/, '');
    const input = firstExisting([abs, ...withExts(stem, SCRIPT_EXTS)]);
    if (!input) continue;
    scripts.push({
      src,
      input,
      name: scripts.length === 0 ? pageName : `${pageName}-${scripts.length + 1}`,
    });
  }
  return scripts;
}

/** Every generated-mode entrypoint in `srcDir`. Throws when two files claim one entry. */
export function discoverEntrypoints(srcDir: string, log: Logger): Entrypoint[] {
  const out: Entrypoint[] = [];
  const rel = (p: string) => relative(srcDir, p);
  const claim = (kind: string, found: string[]): string | undefined => {
    if (found.length > 1) {
      throw new Error(
        `Two files define the ${kind} entrypoint: ${found.map(rel).join(' and ')}. Keep one.`,
      );
    }
    return found[0];
  };

  const background = claim(
    'background',
    [
      firstExisting(withExts(join(srcDir, 'background'), ['.ts', '.tsx'])),
      firstExisting(withExts(join(srcDir, 'background', 'index'), ['.ts', '.tsx'])),
    ].filter((p): p is string => p !== undefined),
  );
  if (background)
    out.push({ name: 'background', kind: 'background', input: background, format: 'esm' });

  for (const kind of PAGE_KINDS) {
    const html = claim(
      kind,
      [join(srcDir, `${kind}.html`), join(srcDir, kind, 'index.html')].filter((p) => existsSync(p)),
    );
    if (!html) continue;
    const scripts = pageScripts(html, kind);
    if (scripts.length === 0) {
      log.warn(
        `${rel(html)} has no <script type="module" src="…"> that resolves to a file in src/.`,
      );
    }
    out.push({
      name: kind,
      kind,
      input: html,
      format: 'esm',
      page: { html, scripts },
    });
  }

  // Content scripts: content.ts, <x>.content.ts, <x>.content/index.ts
  const contentFiles = new Map<string, string[]>();
  const addContent = (name: string, file: string) =>
    contentFiles.set(name, [...(contentFiles.get(name) ?? []), file]);
  const plainContent = firstExisting(withExts(join(srcDir, 'content'), ['.ts', '.tsx']));
  if (plainContent) addContent('content', plainContent);
  for (const e of existsSync(srcDir) ? readdirSync(srcDir, { withFileTypes: true }) : []) {
    const file = /^(.+)\.content\.(ts|tsx)$/.exec(e.name);
    if (e.isFile() && file) addContent(file[1] as string, join(srcDir, e.name));
    const folder = /^(.+)\.content$/.exec(e.name);
    if (e.isDirectory() && folder) {
      const index = firstExisting(withExts(join(srcDir, e.name, 'index'), ['.ts', '.tsx']));
      if (index) addContent(folder[1] as string, index);
    }
  }
  for (const [name, files] of [...contentFiles].sort(([a], [b]) => a.localeCompare(b))) {
    const input = claim(`"${name}" content script`, files) as string;
    out.push({
      name: `content-scripts/${name}`,
      kind: 'content',
      input,
      format: 'iife',
      contentScript: extractContentScriptOptions(
        readFileSync(input, 'utf8'),
        'defineContentScript',
      ),
    });
  }

  // Injected and CSUI: unchanged until phase 3.
  for (const [name, input] of Object.entries(discoverInjectedEntries(srcDir, log))) {
    out.push({ name, kind: 'injected', input, format: 'iife' });
  }
  for (const e of discoverLegacyEntrypoints(srcDir, log)) {
    if (e.kind === 'csui') out.push(e);
  }

  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The manifest fields generated mode fills in from discovered entries, as a
 * `ManifestConfig` patch so the existing per-browser generator does the rest
 * (Firefox `scripts`, `options_ui`, `sidebar_action`, …).
 */
export function manifestFromEntrypoints(
  entrypoints: Entrypoint[],
  log: Logger,
): Partial<ManifestConfig> {
  const patch: Partial<ManifestConfig> = {};
  for (const e of entrypoints) {
    if (e.kind === 'background') patch.background = { entrypoint: `${e.name}.js` };
    if (e.kind === 'popup') patch.action = { defaultPopup: `${e.name}.html` };
    if (e.kind === 'options') patch.optionsPage = `${e.name}.html`;
    if (e.kind === 'sidepanel') patch.sidePanel = { defaultPath: `${e.name}.html` };
  }
  const scripts = entrypoints.filter((e) => e.kind === 'content');
  const contentScripts: NonNullable<ManifestConfig['contentScripts']> = [];
  for (const e of scripts) {
    const o = e.contentScript ?? {};
    for (const key of o.unresolvedOptions ?? []) {
      log.warn(
        `${e.name}: \`${key}\` in defineContentScript() isn't a literal, so it was left out of the manifest.`,
      );
    }
    if (!o.matches?.length) {
      log.warn(
        `${e.name}: no \`matches\` found in defineContentScript({ matches: [...] }); it is built but not added to the manifest.`,
      );
      continue;
    }
    contentScripts.push({
      matches: o.matches,
      js: [`${e.name}.js`],
      ...(o.excludeMatches && { excludeMatches: o.excludeMatches }),
      ...(o.runAt && { runAt: o.runAt }),
      ...(o.allFrames !== undefined && { allFrames: o.allFrames }),
      ...(o.matchAboutBlank !== undefined && { matchAboutBlank: o.matchAboutBlank }),
      ...(o.world && { world: o.world }),
    });
  }
  if (contentScripts.length > 0) patch.contentScripts = contentScripts;
  return patch;
}

/** The page's HTML with each module script's src pointing at its built output. */
export function rewritePageHtml(html: string, scripts: PageScript[]): string {
  let out = html;
  for (const s of scripts) {
    out = out.replace(
      new RegExp(`(\\bsrc\\s*=\\s*["'])${s.src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(["'])`),
      `$1./${s.name}.js$2`,
    );
  }
  return out;
}

/**
 * `config.manifest` with the discovered entries filled in. Keys the config
 * sets itself win; discovered content scripts are added after configured ones.
 */
export function applyDiscoveredEntries(
  manifest: ManifestConfig,
  entrypoints: Entrypoint[],
  log: Logger,
): ManifestConfig {
  const found = manifestFromEntrypoints(entrypoints, log);
  return {
    ...manifest,
    ...(found.background && !manifest.background?.entrypoint && { background: found.background }),
    ...(found.action && {
      action: {
        ...found.action,
        ...manifest.action,
        defaultPopup: manifest.action?.defaultPopup ?? found.action.defaultPopup,
      },
    }),
    ...(found.optionsPage && !manifest.optionsPage && { optionsPage: found.optionsPage }),
    ...(found.sidePanel && !manifest.sidePanel?.defaultPath && { sidePanel: found.sidePanel }),
    ...(found.contentScripts && {
      contentScripts: [...(manifest.contentScripts ?? []), ...found.contentScripts],
    }),
  };
}

/** Marker on an entry path: build it through a wrapper that calls the default export's `main()`. */
export const CALL_MAIN_SUFFIX = '?extforge-main';

/**
 * esbuild plugin for `defineContentScript()` files: the entry becomes
 * `import def from '<file>'; def.main()`, so the file itself stays a plain
 * module (importable from tests) and runs when injected.
 */
export const callMainPlugin = {
  name: 'extforge-call-main',
  setup(build: {
    onResolve: (o: { filter: RegExp }, cb: (a: { path: string }) => unknown) => void;
    onLoad: (
      o: { filter: RegExp; namespace: string },
      cb: (a: { path: string }) => unknown,
    ) => void;
  }) {
    build.onResolve({ filter: /\?extforge-main$/ }, (args) => ({
      path: args.path.slice(0, -CALL_MAIN_SUFFIX.length),
      namespace: 'extforge-main',
    }));
    build.onLoad({ filter: /.*/, namespace: 'extforge-main' }, (args) => ({
      contents:
        `import entry from ${JSON.stringify(args.path)};\n` +
        "if (entry && typeof entry.main === 'function') entry.main();\n",
      resolveDir: dirname(args.path),
      loader: 'ts',
    }));
  },
};
