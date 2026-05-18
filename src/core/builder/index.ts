/**
 * ExtForge Builder — esbuild pipeline
 */

import * as esbuild from 'esbuild';
import {
  copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { createLogger, formatDuration, formatFileSize, type Logger } from '../logger/index.js';
import { type Browser, ALL_BROWSERS, generateManifest, applyInjectedDefaults } from '../manifest/index.js';
import { validateProject } from '../validator/index.js';
import type { ExtForgeConfig } from '../config.js';
import { ExtForgeError } from '../errors/index.js';
import { ESBUILD_TARGETS, ESBUILD_LOADERS, ENTRY_SCANS, HTML_DIRS, ICON_SIZES, INJECTED_DIR } from './constants.js';
import { loadTemplate } from '../scaffold/template-loader.js';
import { checkSourceCompat, type CompatIssue } from '../compat/index.js';
import type { PluginRunner } from '../plugins/runner.js';
import type { EntryDescriptor, ManifestObject } from '../plugins/types.js';
import { loadEnv, publicEnvToDefine } from '../env/index.js';
import { discoverCSUI, type CSUIDiscovery } from '../csui/discovery.js';
import { refreshPlugin } from '../hmr/swc/refresh-plugin.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BuildOptions {
  browser: Browser;
  dev: boolean;
  outDir?: string;
  sourcemap?: boolean;
  minify?: boolean;
  hmrPort?: number;
  hmrHost?: string;
  strictCompat?: boolean;
  /** Internal: set by buildAll after running the one-time compat scan. */
  _skipCompatScan?: boolean;
}

// Recursively collect TypeScript/JavaScript sources under a directory so the
// compat scan covers imported helpers, not just top-level entry files.
// Skip dependencies, build outputs, and other directories that shouldn't
// contribute to the user's compat surface.
const COMPAT_SOURCE_EXTS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
const COMPAT_SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', '.cache']);
const COMPAT_MAX_FILES = 2000;

function walkCompatSources(root: string, limit: number = COMPAT_MAX_FILES): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length && out.length < limit) {
    const dir = stack.pop()!;
    let entries: import('node:fs').Dirent[];
    try { entries = readdirSync(dir, { withFileTypes: true }); }
    catch { continue; }
    for (const ent of entries) {
      if (out.length >= limit) break;
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        if (!COMPAT_SKIP_DIRS.has(ent.name)) stack.push(full);
        continue;
      }
      if (!ent.isFile()) continue;
      const dot = ent.name.lastIndexOf('.');
      const ext = dot >= 0 ? ent.name.slice(dot) : '';
      if (COMPAT_SOURCE_EXTS.has(ext)) out.push(full);
    }
  }
  return out;
}

function makeHMRBanner(opts: BuildOptions): { js: string } | undefined {
  if (!opts.dev || !opts.hmrPort) return undefined;
  const client = loadTemplate('hmr-client.js.tpl', {
    HMR_HOST: opts.hmrHost ?? 'localhost',
    HMR_PORT: String(opts.hmrPort),
  });
  return { js: client };
}

/**
 * Build a Map from absolute content-script source path → scriptId (index in
 * `config.manifest.contentScripts[]`). Multiple JS files in one entry share
 * the same scriptId. Used by the builder to inject __EXTFORGE_SCRIPT_ID__ at
 * compile time (dev only), and by the HMR server to route update messages.
 */
export function buildContentScriptMap(
  projectRoot: string,
  config: ExtForgeConfig,
): Map<string, number> {
  const cs = config.manifest?.contentScripts ?? [];
  const map = new Map<string, number>();
  cs.forEach((entry, idx) => {
    for (const rel of (entry.js ?? [])) {
      map.set(resolve(projectRoot, rel), idx);
    }
  });
  return map;
}

export interface BuildResult {
  browser: Browser;
  outDir: string;
  duration: number;
  files: Array<{ path: string; size: number }>;
  errors: string[];
}

// ─── Entry point discovery ───────────────────────────────────────────────────

function discoverEntryPoints(srcDir: string): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const { subPath, outputKey } of ENTRY_SCANS) {
    for (const ext of ['.ts', '.tsx']) {
      const direct = join(srcDir, subPath + ext);
      const index = join(srcDir, subPath, 'index' + ext);
      if (existsSync(direct)) { entries[outputKey] = direct; break; }
      if (existsSync(index))  { entries[outputKey] = index; break; }
    }
  }
  return entries;
}

export function discoverInjectedEntries(srcDir: string, log: Logger): Record<string, string> {
  const entries: Record<string, string> = {};
  const dir = join(srcDir, INJECTED_DIR);
  const looseTs  = join(srcDir, 'injected.ts');
  const looseTsx = join(srcDir, 'injected.tsx');

  if (existsSync(dir) && statSync(dir).isDirectory()) {
    if (existsSync(looseTs) || existsSync(looseTsx)) {
      log.warn('Both src/injected/ and src/injected.ts(x) exist; using directory mode and ignoring the loose file.');
    }
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isFile()) continue;
      const m = /^(.+)\.tsx?$/.exec(e.name);
      if (!m) continue;
      entries[`injected/${m[1]}`] = join(dir, e.name);
    }
    return entries;
  }

  if (existsSync(looseTs))  { entries['injected'] = looseTs;  return entries; }
  if (existsSync(looseTsx)) { entries['injected'] = looseTsx; return entries; }
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

// ─── CSS ─────────────────────────────────────────────────────────────────────

async function processCSS(input: string, output: string, log: Logger): Promise<void> {
  if (!existsSync(input)) return;
  mkdirSync(dirname(output), { recursive: true });
  try {
    execSync('npx tailwindcss --help', { stdio: 'ignore' });
    execSync(`npx tailwindcss -i ${input} -o ${output} --minify`, { stdio: 'pipe' });
    log.debug(`Processed CSS: ${input}`);
  } catch {
    copyFileSync(input, output);
    log.debug(`Copied CSS (no Tailwind): ${input}`);
  }
}

// ─── Asset copying ───────────────────────────────────────────────────────────

function copyHTML(srcDir: string, outDir: string, log: Logger): void {
  for (const dir of HTML_DIRS) {
    const html = join(srcDir, dir, 'index.html');
    if (existsSync(html)) {
      const dest = join(outDir, dir);
      mkdirSync(dest, { recursive: true });
      copyFileSync(html, join(dest, 'index.html'));
      log.debug(`Copied HTML: ${dir}/index.html`);
    }
  }
}

function copyIcons(root: string, outDir: string, log: Logger): void {
  const iconsDir = join(root, 'icons');
  if (!existsSync(iconsDir)) return;
  const out = join(outDir, 'icons');
  mkdirSync(out, { recursive: true });
  for (const size of ICON_SIZES) {
    const src = join(iconsDir, `icon-${size}.png`);
    if (existsSync(src)) copyFileSync(src, join(out, `icon-${size}.png`));
  }
  log.debug('Copied icons');
}

function copyPublic(root: string, outDir: string, log: Logger): void {
  const pub = join(root, 'public');
  if (!existsSync(pub)) return;
  const walk = (src: string, dest: string) => {
    mkdirSync(dest, { recursive: true });
    for (const e of readdirSync(src, { withFileTypes: true })) {
      const s = join(src, e.name), d = join(dest, e.name);
      if (e.isDirectory()) walk(s, d); else copyFileSync(s, d);
    }
  };
  walk(pub, outDir);
  log.debug('Copied public/ assets');
}

// ─── Directory summarizer ─────────────────────────────────────────────────────

/**
 * Append CSUI discoveries to manifest.content_scripts. Entries with no
 * statically-extractable matches are skipped with a warning — the user can
 * still declare them manually in extforge.config.ts.
 */
function augmentManifestWithCSUI(
  manifest: Record<string, unknown>,
  discoveries: CSUIDiscovery[],
  log: Logger,
): void {
  if (discoveries.length === 0) return;
  const existing = (manifest['content_scripts'] as Array<Record<string, unknown>> | undefined) ?? [];
  const merged = [...existing];

  // Index already-declared JS files so we don't re-emit a manifest entry for
  // a CSUI that the user wired up explicitly in extforge.config.ts —
  // otherwise Chrome runs the same content script twice.
  const declaredJs = new Set<string>();
  for (const entry of existing) {
    const js = (entry as { js?: unknown }).js;
    if (Array.isArray(js)) for (const p of js) if (typeof p === 'string') declaredJs.add(p);
  }

  for (const c of discoveries) {
    if (!c.matches || c.matches.length === 0) {
      log.warn(`[csui] ${c.file}: could not statically extract \`matches\`. Declare the content script in extforge.config.ts to include it in the manifest.`);
      continue;
    }
    if (declaredJs.has(c.outputJsPath)) continue; // already declared by user
    merged.push({
      matches: c.matches,
      js: [c.outputJsPath],
      run_at: c.runAt ?? 'document_idle',
    });
    declaredJs.add(c.outputJsPath);
  }
  if (merged.length > 0) manifest['content_scripts'] = merged;
}

function summarizeDir(dir: string): { fileCount: number; totalBytes: number } {
  let fileCount = 0;
  let totalBytes = 0;
  const walk = (d: string) => {
    if (!existsSync(d)) return;
    for (const ent of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.isFile()) {
        fileCount++;
        totalBytes += statSync(full).size;
      }
    }
  };
  walk(dir);
  return { fileCount, totalBytes };
}

// ─── Build config factory ────────────────────────────────────────────────────

function makeSharedEsbuildOptions(root: string, opts: BuildOptions): Pick<esbuild.BuildOptions,
  'bundle' | 'platform' | 'target' | 'sourcemap' | 'minify' | 'define' | 'alias' | 'loader' | 'logLevel' | 'metafile'
> {
  const mode = opts.dev ? 'development' : 'production';
  const { publicEnv } = loadEnv({ cwd: root, mode });
  const envDefine = publicEnvToDefine(publicEnv, mode);
  return {
    bundle: true,
    platform: 'browser',
    target: ESBUILD_TARGETS,
    sourcemap: opts.sourcemap ?? (opts.dev ? 'inline' : false),
    minify: opts.minify ?? !opts.dev,
    define: {
      'process.env.NODE_ENV': opts.dev ? '"development"' : '"production"',
      'process.env.BROWSER': `"${opts.browser}"`,
      '__DEV__': String(opts.dev),
      '__BROWSER__': `"${opts.browser}"`,
      ...envDefine,
    },
    alias: { '@': resolve(root, 'src') },
    loader: ESBUILD_LOADERS as Record<string, esbuild.Loader>,
    logLevel: opts.dev ? 'warning' : 'error',
    metafile: true,
  };
}

// ─── Plugin hook helpers ──────────────────────────────────────────────────────

/**
 * Fire the onBuildEntry hook for a single entry, merge the returned
 * esbuildOptions over the base, and return the final options object.
 *
 * For multi-entry ESM pass: this is called per-entry so every plugin gets
 * visibility, but since esbuild.build() is called once for all ESM entries
 * we adopt a "last-write-wins" merge across all entries and pass those merged
 * options to the shared call. Per-entry option divergence is a v2+ concern.
 */
async function runEntryHook(
  baseOptions: Record<string, unknown>,
  name: string,
  file: string,
  format: 'esm' | 'iife',
  isContentScript: boolean,
  runner: PluginRunner | undefined,
): Promise<Record<string, unknown>> {
  if (!runner) return baseOptions;
  const descriptor: EntryDescriptor = {
    name,
    file,
    format,
    esbuildOptions: baseOptions,
    isContentScript,
  };
  const next = await runner.fireBuildEntry(descriptor);
  return next.esbuildOptions ?? baseOptions;
}

function makeBuildConfig(root: string, opts: BuildOptions, entries: Record<string, string>, config?: ExtForgeConfig): esbuild.BuildOptions {
  const outDir = opts.outDir ?? join(root, 'dist', opts.browser);
  const banner = makeHMRBanner(opts);
  // React Fast Refresh: opt-in. Active only when (1) dev mode, (2) framework
  // is react in the user's config, and (3) @swc/core is installed (the plugin
  // self-disables otherwise).
  const useRefresh = Boolean(opts.dev && config?.framework === 'react');
  const plugins: esbuild.Plugin[] = useRefresh
    ? [refreshPlugin({ enabled: true })]
    : [];
  return {
    ...makeSharedEsbuildOptions(root, opts),
    entryPoints: entries,
    outdir: outDir,
    format: 'esm',
    splitting: false,
    plugins,
    ...(banner ? { banner } : {}),
  };
}

// ─── Error wrapping ──────────────────────────────────────────────────────────

type EsbuildErrorLike = {
  errors?: Array<{
    text?: string;
    location?: { file?: string; line?: number; column?: number } | null;
  }>;
};

function throwAsBuildError(err: unknown, prefix?: string): never {
  const e = err as EsbuildErrorLike;
  if (e && Array.isArray(e.errors) && e.errors.length > 0) {
    const e0 = e.errors[0]!;
    throw new ExtForgeError({
      code: 'EXT_BUILD_FAILED',
      message: prefix ? `${prefix}: ${e0.text ?? 'Build failed'}` : (e0.text ?? 'Build failed'),
      file: e0.location?.file ?? undefined,
      line: e0.location?.line ?? undefined,
      column: e0.location?.column ?? undefined,
      hint: 'Fix the syntax error and re-run.',
      cause: err,
    });
  }
  throw err;
}

// ─── Build ───────────────────────────────────────────────────────────────────

export async function build(
  root: string, config: ExtForgeConfig, opts: BuildOptions, logger?: Logger,
): Promise<BuildResult> {
  const log = (logger ?? createLogger({ scope: 'builder' })).child(opts.browser);
  const start = performance.now();
  const errors: string[] = [];
  const outDir = opts.outDir ?? join(root, 'dist', opts.browser);
  const srcDir = join(root, 'src');

  const runner = (config as { __pluginRunner?: PluginRunner }).__pluginRunner;
  await runner?.fireBuildStart({ browser: opts.browser, dev: opts.dev });

  log.info(`Building for ${opts.browser}...`);

  const allEntries = discoverEntryPoints(srcDir);
  const injectedEntries = discoverInjectedEntries(srcDir, log);
  const { esmEntries, iifeEntries } = partitionEntriesForFormat(allEntries, injectedEntries);

  // CSUI discovery: every src/contents/*.csui.{ts,tsx} becomes an IIFE entry
  // and (if matches: are statically extractable) auto-augments the manifest's
  // content_scripts.
  const csuiEntries = discoverCSUI(srcDir);
  for (const c of csuiEntries) {
    iifeEntries[c.entryKey] = c.file;
  }

  if (Object.keys(esmEntries).length === 0 && Object.keys(iifeEntries).length === 0) {
    errors.push('No entry points found in src/');
    log.error('No entry points discovered');
    return { browser: opts.browser, outDir, duration: 0, files: [], errors };
  }

  // ─── Compat scan ─────────────────────────────────────────────────────────────
  // Skipped when called from buildAll, which runs the scan once for all browsers.
  if (!opts._skipCompatScan) {
    const compatBrowsers = (config.browsers ?? ['chrome']) as Array<'chrome' | 'firefox' | 'edge' | 'safari'>;
    // Walk the configured src directory so chrome.* calls in helper modules
    // imported by entries are inspected too, not just the entry files
    // themselves. The walker keeps a sane cap to avoid pathological repos.
    const srcDir = resolve(root, config.build?.srcDir ?? 'src');
    const allFiles = existsSync(srcDir) ? walkCompatSources(srcDir) : [];
    const allIssues: CompatIssue[] = [];
    for (const file of allFiles) {
      try {
        const src = readFileSync(file, 'utf8');
        allIssues.push(...checkSourceCompat({ source: src, file, browsers: compatBrowsers }));
      } catch { /* ignore unreadable files */ }
    }
    if (allIssues.length > 0) {
      log.warn(`[compat] ${allIssues.length} cross-browser issue(s) found:`);
      for (const i of allIssues) {
        log.warn(`  ${i.file}:${i.line}:${i.column}  ${i.api}  unsupported in: ${i.unsupported.join(', ')}`);
      }
      if (opts.strictCompat) {
        throw new ExtForgeError({
          code: 'EXT_COMPAT_UNSUPPORTED',
          message: `Cross-browser compat check failed (${allIssues.length} issue(s), --strict)`,
          hint: 'Suppress with `// extforge-ignore-compat: <reason>` or remove the call.',
        });
      }
    }
  }

  // ─── Main ESM pass (background, UI) ────────────────────────────────────────
  // Fire onBuildEntry per-entry (last-write-wins for shared esbuild options).
  let result: esbuild.BuildResult | undefined;
  if (Object.keys(esmEntries).length > 0) {
    const baseEsmConfig = makeBuildConfig(root, { ...opts, outDir }, esmEntries, config);
    const mergedEntryOptions: Record<string, unknown> = {};
    for (const [name, file] of Object.entries(esmEntries)) {
      const returned = await runEntryHook({}, name, file, 'esm', false, runner);
      Object.assign(mergedEntryOptions, returned);
    }
    const finalEsmConfig = { ...baseEsmConfig, ...mergedEntryOptions };
    try { result = await esbuild.build(finalEsmConfig as esbuild.BuildOptions); }
    catch (err) { throwAsBuildError(err); }
  }

  // ─── IIFE pass (content + injected) ────────────────────────────────────────
  if (Object.keys(iifeEntries).length > 0) {
    const csMap = buildContentScriptMap(root, config);
    const sharedOpts = makeSharedEsbuildOptions(root, { ...opts, outDir });

    // Separate content-script entries (need per-entry scriptId banner in dev)
    // from other IIFE entries (injected scripts, no scriptId banner needed).
    const csEntries: Record<string, string> = {};
    const nonCsIifeEntries: Record<string, string> = {};
    for (const [key, absPath] of Object.entries(iifeEntries)) {
      if (csMap.has(absPath)) {
        csEntries[key] = absPath;
      } else {
        nonCsIifeEntries[key] = absPath;
      }
    }

    // Build each content-script entry individually so we can inject the
    // scriptId banner (dev only). Production builds get no banner.
    for (const [key, absPath] of Object.entries(csEntries)) {
      const scriptId = csMap.get(absPath)!;
      const csBanner = opts.dev
        ? `globalThis.__EXTFORGE_SCRIPT_ID__ = ${scriptId};\n`
        : undefined;
      const hmrBanner = makeHMRBanner(opts);
      const bannerJs = [csBanner, hmrBanner?.js].filter(Boolean).join('');
      const entryOpts = await runEntryHook(
        { ...sharedOpts },
        key,
        absPath,
        'iife',
        true,
        runner,
      );
      try {
        await esbuild.build({
          ...entryOpts,
          entryPoints: { [key]: absPath },
          outdir: outDir,
          format: 'iife',
          splitting: false,
          ...(bannerJs ? { banner: { js: bannerJs } } : {}),
        } as esbuild.BuildOptions);
      } catch (err) { throwAsBuildError(err, `IIFE build failed for content script (${key})`); }
    }

    // Build remaining IIFE entries (injected scripts) in a single pass.
    // Fire onBuildEntry per-entry (last-write-wins merge) for plugin visibility.
    if (Object.keys(nonCsIifeEntries).length > 0) {
      const hmrBanner = makeHMRBanner(opts);
      const mergedNonCsOpts: Record<string, unknown> = { ...sharedOpts };
      for (const [key, absPath] of Object.entries(nonCsIifeEntries)) {
        const returned = await runEntryHook({ ...sharedOpts }, key, absPath, 'iife', false, runner);
        Object.assign(mergedNonCsOpts, returned);
      }
      try {
        await esbuild.build({
          ...mergedNonCsOpts,
          entryPoints: nonCsIifeEntries,
          outdir: outDir,
          format: 'iife',
          splitting: false,
          ...(hmrBanner ? { banner: hmrBanner } : {}),
        } as esbuild.BuildOptions);
      } catch (err) { throwAsBuildError(err, 'IIFE build failed'); }
    }
  }

  await processCSS(join(srcDir, 'styles/globals.css'), join(outDir, 'styles/globals.css'), log);
  await processCSS(join(srcDir, 'styles/content.css'), join(outDir, 'styles/content.css'), log);

  if (config.manifest) {
    let manifest: ManifestObject = generateManifest(config.manifest, opts.browser) as ManifestObject;
    applyInjectedDefaults(manifest as Record<string, unknown>, config.manifest, injectedEntries);
    augmentManifestWithCSUI(manifest as Record<string, unknown>, csuiEntries, log);
    if (runner) manifest = await runner.fireManifestTransform(manifest, opts.browser);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  }

  copyHTML(srcDir, outDir, log);
  copyIcons(root, outDir, log);
  copyPublic(root, outDir, log);

  const files: Array<{ path: string; size: number }> = [];
  if (result?.metafile) {
    for (const [p, m] of Object.entries(result.metafile.outputs)) files.push({ path: p, size: m.bytes });
  }

  const duration = performance.now() - start;
  const total = files.reduce((s, f) => s + f.size, 0);
  log.success(`Built ${opts.browser} → ${outDir} (${files.length} files, ${formatFileSize(total)}) in ${formatDuration(duration)}`);
  const buildResult: BuildResult = { browser: opts.browser, outDir, duration, files, errors };
  await runner?.fireBuildEnd(buildResult);
  return buildResult;
}

export async function buildAll(
  root: string, config: ExtForgeConfig, opts: Omit<BuildOptions, 'browser'>, logger?: Logger,
): Promise<BuildResult[]> {
  const log = logger ?? createLogger({ scope: 'builder' });
  const browsers = config.browsers ?? ALL_BROWSERS;

  log.banner('ExtForge Build', [`Browsers: ${browsers.join(', ')}`, `Mode: ${opts.dev ? 'development' : 'production'}`]);
  log.time('total-build');

  const validation = validateProject(root, log.child('validate'));
  if (!validation.valid) { log.error('Fix errors above before building'); return []; }

  // ─── One-time compat scan across all browsers ───────────────────────────────
  // Run once here so individual browser builds don't each re-read and re-scan
  // the same source files.
  {
    const srcDir = join(root, 'src');
    const allEntries = discoverEntryPoints(srcDir);
    const injectedEntries = discoverInjectedEntries(srcDir, log.child('compat'));
    const { esmEntries, iifeEntries } = partitionEntriesForFormat(allEntries, injectedEntries);
    const allEntryFiles = [...Object.values(esmEntries), ...Object.values(iifeEntries)];
    const compatBrowsers = (config.browsers ?? ['chrome']) as Array<'chrome' | 'firefox' | 'edge' | 'safari'>;
    const allIssues: CompatIssue[] = [];
    const fileCache = new Map<string, string>();
    for (const entryFile of allEntryFiles) {
      try {
        let src = fileCache.get(entryFile);
        if (src === undefined) { src = readFileSync(entryFile, 'utf8'); fileCache.set(entryFile, src); }
        allIssues.push(...checkSourceCompat({ source: src, file: entryFile, browsers: compatBrowsers }));
      } catch { /* ignore unreadable files */ }
    }
    if (allIssues.length > 0) {
      log.warn(`[compat] ${allIssues.length} cross-browser issue(s) found:`);
      for (const i of allIssues) {
        log.warn(`  ${i.file}:${i.line}:${i.column}  ${i.api}  unsupported in: ${i.unsupported.join(', ')}`);
      }
      if (opts.strictCompat) {
        throw new ExtForgeError({
          code: 'EXT_COMPAT_UNSUPPORTED',
          message: `Cross-browser compat check failed (${allIssues.length} issue(s), --strict)`,
          hint: 'Suppress with `// extforge-ignore-compat: <reason>` or remove the call.',
        });
      }
    }
  }

  const results: BuildResult[] = [];
  for (const browser of browsers) results.push(await build(root, config, { ...opts, browser, _skipCompatScan: true } as BuildOptions, log));

  log.timeEnd('total-build', 'Total build time');
  const totalErrors = results.reduce((s, r) => s + r.errors.length, 0);
  if (totalErrors > 0) log.error(`Build completed with ${totalErrors} error(s)`);
  else log.success(`All ${browsers.length} browser builds completed`);

  log.summary('Build complete', results.map(r => {
    const { fileCount, totalBytes } = summarizeDir(r.outDir);
    return {
      label: r.browser,
      value: `${r.outDir}  (${fileCount} files, ${formatFileSize(totalBytes)})`,
    };
  }));

  return results;
}

export async function createBuildContext(
  root: string, config: ExtForgeConfig, opts: BuildOptions, logger?: Logger,
): Promise<esbuild.BuildContext> {
  const log = logger ?? createLogger({ scope: 'builder' });
  const srcDir = join(root, 'src');
  const outDir = opts.outDir ?? join(root, 'dist', opts.browser);
  const entries = discoverEntryPoints(srcDir);
  const cfg = makeBuildConfig(root, { ...opts, outDir }, entries, config);

  return esbuild.context({
    ...cfg,
    plugins: [...(cfg.plugins ?? []), {
      name: 'extforge-rebuild-notify',
      setup(build) {
        build.onEnd((result) => {
          if (result.errors.length > 0) log.error(`Rebuild failed with ${result.errors.length} error(s)`);
          else log.success(`Rebuilt ${opts.browser} (${result.metafile ? Object.keys(result.metafile.outputs).length : '?'} files)`);
        });
      },
    }],
  });
}
