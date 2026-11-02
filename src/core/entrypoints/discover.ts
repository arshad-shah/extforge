/**
 * Generated-mode discovery (#96): entrypoints found in `src/` by name.
 *
 * Only reserved names, entry suffixes and HTML directly in `src/` count, so
 * ordinary code (`lib/index.ts`, `components/…`) is never mistaken for an entry.
 *
 *   background.ts | background/index.ts              → background.js
 *   popup|options|sidepanel|devtools|newtab|history|bookmarks
 *     <n>.html | <n>/index.html                       → <n>.html + <n>.js
 *   offscreen.html | <x>.offscreen.html | …/index.html → <x>.html (no manifest key)
 *   <x>.sandbox.html | <x>.sandbox/index.html        → <x>.html, sandbox.pages
 *   any other <x>.html in src/                       → <x>.html (unlisted page)
 *   content.ts | <x>.content.ts | <x>.content/index.ts → content-scripts/<x>.js
 *   <x>.csui.tsx                                     → content-scripts/<x>.js (CSUI)
 *   <x>.injected.ts                                  → injected/<x>.js (main world)
 *   <x>.unlisted.ts | <x>.unlisted/index.ts          → <x>.js (classic script, no manifest key)
 *
 * The folders `src/injected/` and `src/contents/` keep working with their
 * existing output keys. See docs/superpowers/specs/2026-11-02-entrypoint-discovery-design.md.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { describeCSUI, extractContentScriptOptions } from '../csui/discovery.js';
import type { Logger } from '../logger/index.js';
import { BROWSER_FEATURES } from '../manifest/constants.js';
import type { Browser, ManifestConfig } from '../manifest/types.js';
import { discoverInjectedEntries, discoverLegacyEntrypoints, type Entrypoint } from './index.js';

export const PAGE_KINDS = [
  'popup',
  'options',
  'sidepanel',
  'devtools',
  'newtab',
  'history',
  'bookmarks',
] as const;
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
  return !manifest || legacyLayoutReasons(manifest, srcDir).length > 0;
}

/** What keeps a project on the legacy layout, for the deprecation warning. */
export function legacyLayoutReasons(manifest: ManifestConfig, srcDir: string): string[] {
  const reasons: string[] = [];
  if (manifest.background?.entrypoint) reasons.push('manifest.background.entrypoint');
  if (manifest.action?.defaultPopup) reasons.push('manifest.action.defaultPopup');
  if (manifest.optionsPage) reasons.push('manifest.optionsPage');
  if (manifest.sidePanel?.defaultPath) reasons.push('manifest.sidePanel.defaultPath');
  if (manifest.contentScripts?.some((c) => (c.js?.length ?? 0) > 0))
    reasons.push('manifest.contentScripts[].js');
  for (const d of LEGACY_ONLY_DIRS) {
    if (existsSync(join(srcDir, d)) && statSync(join(srcDir, d)).isDirectory())
      reasons.push(`src/${d}/`);
  }
  return reasons;
}

let warnedLegacyLayout = false;

/** Warn once per process that the legacy layout is deprecated, naming what keeps the project on it. */
export function warnLegacyLayout(
  manifest: ManifestConfig | undefined,
  srcDir: string,
  log: Logger,
): void {
  if (warnedLegacyLayout || !manifest) return;
  const reasons = legacyLayoutReasons(manifest, srcDir);
  if (reasons.length === 0) return;
  warnedLegacyLayout = true;
  log.warn(
    `This project uses the legacy entrypoint layout (${reasons.join(', ')}). It keeps working for all of 1.x and is removed in 2.0. ` +
      'Run `extforge migrate-layout` to see the changes, or read https://extforge.arshadshah.com/guides/migrate-named-layout/',
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

/** Every generated-mode entrypoint in `srcDir`. Throws when two files claim one entry or output. */
export function discoverEntrypoints(srcDir: string, log: Logger): Entrypoint[] {
  const out: Entrypoint[] = [];
  const rel = (p: string) => relative(srcDir, p);
  const claim = (what: string, found: string[]): string | undefined => {
    if (found.length > 1) {
      throw new Error(
        `Two files define the ${what} entrypoint: ${found.map(rel).join(' and ')}. Keep one.`,
      );
    }
    return found[0];
  };
  const listing = existsSync(srcDir) ? readdirSync(srcDir, { withFileTypes: true }) : [];
  const files = listing.filter((e) => e.isFile()).map((e) => e.name);
  const dirs = listing.filter((e) => e.isDirectory()).map((e) => e.name);
  const indexIn = (dir: string, exts: string[]) =>
    firstExisting(withExts(join(srcDir, dir, 'index'), exts));

  // Collect candidates by entry key, so any duplicate claim is reported.
  const candidates = new Map<string, { kind: Entrypoint['kind']; name: string; files: string[] }>();
  const add = (key: string, kind: Entrypoint['kind'], name: string, file: string | undefined) => {
    if (!file) return;
    const c = candidates.get(key) ?? { kind, name, files: [] };
    c.files.push(file);
    candidates.set(key, c);
  };

  add(
    'background',
    'background',
    'background',
    firstExisting(withExts(join(srcDir, 'background'), ['.ts', '.tsx'])),
  );
  add('background', 'background', 'background', indexIn('background', ['.ts', '.tsx']));
  add(
    'content',
    'content',
    'content',
    firstExisting(withExts(join(srcDir, 'content'), ['.ts', '.tsx'])),
  );

  const reservedPages = new Set<string>([...PAGE_KINDS, 'offscreen']);
  for (const kind of [...PAGE_KINDS, 'offscreen'] as const) {
    if (files.includes(`${kind}.html`)) add(kind, kind, kind, join(srcDir, `${kind}.html`));
    if (dirs.includes(kind) && existsSync(join(srcDir, kind, 'index.html')))
      add(kind, kind, kind, join(srcDir, kind, 'index.html'));
  }

  const SUFFIXES: Array<{ re: RegExp; kind: Entrypoint['kind']; html?: true; prefix?: string }> = [
    { re: /^(.+)\.content$/, kind: 'content' },
    { re: /^(.+)\.csui$/, kind: 'csui' },
    { re: /^(.+)\.injected$/, kind: 'injected' },
    { re: /^(.+)\.unlisted$/, kind: 'unlisted' },
    { re: /^(.+)\.offscreen$/, kind: 'offscreen', html: true },
    { re: /^(.+)\.sandbox$/, kind: 'sandbox', html: true },
  ];
  const claimedHtml = new Set<string>();
  for (const name of files) {
    const dot = name.lastIndexOf('.');
    const stem = name.slice(0, dot);
    const ext = name.slice(dot);
    for (const s of SUFFIXES) {
      const m = s.re.exec(stem);
      if (!m) continue;
      const isHtml = ext === '.html';
      if (Boolean(s.html) !== isHtml || (!isHtml && !['.ts', '.tsx'].includes(ext))) continue;
      add(`${s.kind}:${m[1]}`, s.kind, m[1] as string, join(srcDir, name));
      if (isHtml) claimedHtml.add(name);
    }
  }
  for (const dir of dirs) {
    for (const s of SUFFIXES) {
      const m = s.re.exec(dir);
      if (!m) continue;
      const file = s.html
        ? existsSync(join(srcDir, dir, 'index.html'))
          ? join(srcDir, dir, 'index.html')
          : undefined
        : indexIn(dir, ['.ts', '.tsx']);
      add(`${s.kind}:${m[1]}`, s.kind, m[1] as string, file);
    }
  }
  // Any other HTML directly in src/ is an unlisted page.
  for (const name of files) {
    if (!name.endsWith('.html') || claimedHtml.has(name)) continue;
    const stem = name.slice(0, -'.html'.length);
    if (reservedPages.has(stem)) continue;
    add(`page:${stem}`, 'page', stem, join(srcDir, name));
  }
  // A plain content.ts and a content.content.ts would both be "content".
  const plain = candidates.get('content');
  const named = candidates.get('content:content');
  if (plain && named) {
    plain.files.push(...named.files);
    candidates.delete('content:content');
  }

  const PAGE_LIKE = new Set<Entrypoint['kind']>([...PAGE_KINDS, 'offscreen', 'sandbox', 'page']);
  for (const [key, c] of [...candidates].sort(([a], [b]) => a.localeCompare(b))) {
    const input = claim(key.includes(':') ? `${c.kind} "${c.name}"` : c.kind, c.files) as string;
    if (PAGE_LIKE.has(c.kind)) {
      const scripts = pageScripts(input, c.name);
      if (scripts.length === 0 && c.kind !== 'sandbox') {
        log.warn(
          `${rel(input)} has no <script type="module" src="…"> that resolves to a file in src/.`,
        );
      }
      out.push({
        name: c.name,
        kind: c.kind,
        input,
        format: 'esm',
        page: { html: input, scripts },
      });
    } else if (c.kind === 'content') {
      out.push({
        name: `content-scripts/${c.name}`,
        kind: 'content',
        input,
        format: 'iife',
        contentScript: extractContentScriptOptions(
          readFileSync(input, 'utf8'),
          'defineContentScript',
        ),
      });
    } else if (c.kind === 'csui') {
      const csui = describeCSUI(input, `content-scripts/${c.name}`);
      out.push({ name: csui.entryKey, kind: 'csui', input, format: 'iife', csui });
    } else if (c.kind === 'injected') {
      out.push({ name: `injected/${c.name}`, kind: 'injected', input, format: 'iife' });
    } else if (c.kind === 'unlisted') {
      out.push({ name: c.name, kind: 'unlisted', input, format: 'iife' });
    } else {
      out.push({ name: c.name, kind: c.kind, input, format: 'esm' });
    }
  }

  // The src/injected/ and src/contents/ folders keep their output keys.
  for (const [name, input] of Object.entries(discoverInjectedEntries(srcDir, log))) {
    out.push({ name, kind: 'injected', input, format: 'iife' });
  }
  for (const e of discoverLegacyEntrypoints(srcDir, log)) {
    if (e.kind === 'csui') out.push(e);
  }

  assertUniqueOutputs(out, rel);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Two entries writing the same file would overwrite each other; say which. */
function assertUniqueOutputs(entrypoints: Entrypoint[], rel: (p: string) => string): void {
  const owners = new Map<string, string>();
  for (const e of entrypoints) {
    const outputs = e.page
      ? [`${e.name}.html`, ...e.page.scripts.map((s) => `${s.name}.js`)]
      : [`${e.name}.js`];
    for (const o of outputs) {
      const prev = owners.get(o);
      if (prev && prev !== e.input) {
        throw new Error(
          `${rel(prev)} and ${rel(e.input)} would both be built to ${o}. Rename one.`,
        );
      }
      owners.set(o, e.input);
    }
  }
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
    if (e.kind === 'devtools') patch.devtoolsPage = `${e.name}.html`;
    if (e.kind === 'newtab' || e.kind === 'history' || e.kind === 'bookmarks') {
      patch.chromeUrlOverrides = { ...patch.chromeUrlOverrides, [e.kind]: `${e.name}.html` };
    }
    if (e.kind === 'sandbox') {
      patch.sandbox = { pages: [...(patch.sandbox?.pages ?? []), `${e.name}.html`] };
    }
  }
  const overrides = Object.keys(patch.chromeUrlOverrides ?? {});
  if (overrides.length > 1) {
    throw new Error(
      `An extension can override only one browser page, but src/ has ${overrides.map((o) => `${o}.html`).join(' and ')}. Keep one.`,
    );
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
export function rewritePageHtml(
  html: string,
  scripts: PageScript[],
  location?: { htmlPath: string; srcDir: string },
): string {
  let out = html;
  for (const s of scripts) {
    out = out.replace(
      new RegExp(`(\\bsrc\\s*=\\s*["'])${s.src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(["'])`),
      `$1./${s.name}.js$2`,
    );
  }
  if (!location) return out;
  // The page is written to the output root, so a relative <link href> that
  // points into src/ (`../styles/globals.css`) is rewritten to the same path
  // under the output root, where stylesheets are built.
  return out.replace(
    /(<link\b[^>]*?\bhref\s*=\s*)(["'])([^"']+)\2/gi,
    (whole, head: string, q: string, href: string) => {
      if (
        /^([a-z]+:)?\/\//i.test(href) ||
        href.startsWith('/') ||
        href.startsWith('#') ||
        href.startsWith('data:')
      )
        return whole;
      const target = relative(location.srcDir, resolve(dirname(location.htmlPath), href));
      if (target.startsWith('..') || isAbsolute(target)) return whole;
      return `${head}${q}./${target.split('\\').join('/')}${q}`;
    },
  );
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
    ...(found.devtoolsPage && !manifest.devtoolsPage && { devtoolsPage: found.devtoolsPage }),
    ...(found.chromeUrlOverrides &&
      !manifest.chromeUrlOverrides && { chromeUrlOverrides: found.chromeUrlOverrides }),
    ...(found.sandbox && {
      sandbox: {
        ...manifest.sandbox,
        pages: [...(manifest.sandbox?.pages ?? []), ...found.sandbox.pages],
      },
    }),
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

/**
 * Entries `browser` can't use, as warnings: they are still built, but the
 * manifest for this browser leaves them out (or the API doesn't exist there).
 */
export function unsupportedEntries(entrypoints: Entrypoint[], browser: Browser): string[] {
  const f = BROWSER_FEATURES[browser];
  const out: string[] = [];
  for (const e of entrypoints) {
    const where = `${e.name}.html`;
    if (
      (e.kind === 'history' || e.kind === 'bookmarks' || e.kind === 'newtab') &&
      !f.urlOverrides.includes(e.kind)
    )
      out.push(
        `${where}: ${browser} doesn't support overriding the ${e.kind} page; left out of its manifest.`,
      );
    if (e.kind === 'sandbox' && !f.sandboxSupport)
      out.push(
        `${where}: ${browser} doesn't support manifest sandbox pages; left out of its manifest.`,
      );
    if (e.kind === 'offscreen' && (browser === 'firefox' || browser === 'safari'))
      out.push(
        `${where}: ${browser} has no chrome.offscreen API, so this document can't be opened there.`,
      );
    if (e.kind === 'sidepanel' && browser === 'safari')
      out.push(`${where}: Safari has no side panel; left out of its manifest.`);
  }
  return out;
}

/**
 * Built scripts a change can hot-swap with React Fast Refresh, or `undefined`
 * when it needs a full rebuild and reload. A file qualifies when it is one of
 * a page's own scripts or sits inside a page's folder (`src/popup/` for
 * `src/popup/index.html`), the named-layout version of the legacy `src/ui/<page>/`
 * rule. Shared code (`src/lib/`, `src/components/`) may also be used by the
 * background or a content script, so it always rebuilds everything.
 */
export function fastRefreshTargets(
  changedFiles: string[],
  entrypoints: Entrypoint[],
  srcDir: string,
): string[] | undefined {
  const pages = entrypoints.filter((e) => e.page && e.page.scripts.length > 0);
  const targets = new Set<string>();
  for (const file of changedFiles) {
    const owners = pages.filter((p) => {
      const page = p.page as NonNullable<Entrypoint['page']>;
      if (page.scripts.some((s) => s.input === file)) return true;
      // A page with its own folder (src/popup/index.html) owns everything in it.
      const dir = dirname(page.html);
      const hasFolder = dir !== srcDir && basename(page.html) === 'index.html';
      const rel = relative(dir, file);
      return hasFolder && !rel.startsWith('..') && !isAbsolute(rel);
    });
    if (owners.length === 0) return undefined;
    for (const o of owners) for (const s of o.page?.scripts ?? []) targets.add(`${s.name}.js`);
  }
  return targets.size > 0 ? [...targets].sort() : undefined;
}

/** Script ids for named-layout content and CSUI scripts: their order in discovery. */
export function contentScriptIds(entrypoints: Entrypoint[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of entrypoints) {
    if (e.kind === 'content' || e.kind === 'csui') map.set(e.input, map.size);
  }
  return map;
}
