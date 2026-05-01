/**
 * ExtForge Builder — esbuild pipeline
 */

import * as esbuild from 'esbuild';
import {
  copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve, dirname } from 'pathe';
import { execSync } from 'node:child_process';
import { createLogger, formatDuration, formatFileSize, type Logger } from '../logger/index.js';
import { type Browser, ALL_BROWSERS, generateManifest, applyInjectedDefaults } from '../manifest/index.js';
import { validateProject } from '../validator/index.js';
import type { ExtForgeConfig } from '../config.js';
import { ExtForgeError } from '../errors/index.js';
import { ESBUILD_TARGETS, ESBUILD_LOADERS, ENTRY_SCANS, HTML_DIRS, ICON_SIZES, INJECTED_DIR } from './constants.js';
import { loadTemplate } from '../scaffold/template-loader.js';
import { checkSourceCompat, type CompatIssue } from '../compat/index.js';

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
}

function makeHMRBanner(opts: BuildOptions): { js: string } | undefined {
  if (!opts.dev || !opts.hmrPort) return undefined;
  const client = loadTemplate('hmr-client.js.tpl', {
    HMR_HOST: opts.hmrHost ?? 'localhost',
    HMR_PORT: String(opts.hmrPort),
  });
  return { js: client };
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

// ─── Build config factory ────────────────────────────────────────────────────

function makeSharedEsbuildOptions(root: string, opts: BuildOptions): Pick<esbuild.BuildOptions,
  'bundle' | 'platform' | 'target' | 'sourcemap' | 'minify' | 'define' | 'alias' | 'loader' | 'jsx' | 'jsxImportSource' | 'logLevel' | 'metafile'
> {
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
    },
    alias: { '@': resolve(root, 'src') },
    loader: ESBUILD_LOADERS as Record<string, esbuild.Loader>,
    jsx: 'automatic',
    jsxImportSource: 'react',
    logLevel: opts.dev ? 'warning' : 'error',
    metafile: true,
  };
}

function makeBuildConfig(root: string, opts: BuildOptions, entries: Record<string, string>): esbuild.BuildOptions {
  const outDir = opts.outDir ?? join(root, 'dist', opts.browser);
  const banner = makeHMRBanner(opts);
  return {
    ...makeSharedEsbuildOptions(root, opts),
    entryPoints: entries,
    outdir: outDir,
    format: 'esm',
    splitting: false,
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

  log.info(`Building for ${opts.browser}...`);

  const allEntries = discoverEntryPoints(srcDir);
  const injectedEntries = discoverInjectedEntries(srcDir, log);
  const { esmEntries, iifeEntries } = partitionEntriesForFormat(allEntries, injectedEntries);

  if (Object.keys(esmEntries).length === 0 && Object.keys(iifeEntries).length === 0) {
    errors.push('No entry points found in src/');
    log.error('No entry points discovered');
    return { browser: opts.browser, outDir, duration: 0, files: [], errors };
  }

  // ─── Compat scan ────────────────────────────────────────────────────────────
  {
    const browsers = (config.browsers ?? ['chrome']) as Array<'chrome' | 'firefox' | 'edge' | 'safari'>;
    const allEntryFiles = [
      ...Object.values(esmEntries),
      ...Object.values(iifeEntries),
    ];
    const allIssues: CompatIssue[] = [];
    for (const entryFile of allEntryFiles) {
      try {
        const src = readFileSync(entryFile, 'utf8');
        allIssues.push(...checkSourceCompat({ source: src, file: entryFile, browsers }));
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
  let result: esbuild.BuildResult | undefined;
  if (Object.keys(esmEntries).length > 0) {
    try { result = await esbuild.build(makeBuildConfig(root, { ...opts, outDir }, esmEntries)); }
    catch (err) { throwAsBuildError(err); }
  }

  // ─── IIFE pass (content + injected) ────────────────────────────────────────
  if (Object.keys(iifeEntries).length > 0) {
    try {
      await esbuild.build({
        ...makeSharedEsbuildOptions(root, { ...opts, outDir }),
        entryPoints: iifeEntries,
        outdir: outDir,
        format: 'iife',
        splitting: false,
      });
    } catch (err) { throwAsBuildError(err, 'IIFE build failed'); }
  }

  await processCSS(join(srcDir, 'styles/globals.css'), join(outDir, 'styles/globals.css'), log);
  await processCSS(join(srcDir, 'styles/content.css'), join(outDir, 'styles/content.css'), log);

  if (config.manifest) {
    const manifest = generateManifest(config.manifest, opts.browser);
    applyInjectedDefaults(manifest, config.manifest, injectedEntries);
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
  return { browser: opts.browser, outDir, duration, files, errors };
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

  const results: BuildResult[] = [];
  for (const browser of browsers) results.push(await build(root, config, { ...opts, browser }, log));

  log.timeEnd('total-build', 'Total build time');
  const totalErrors = results.reduce((s, r) => s + r.errors.length, 0);
  if (totalErrors > 0) log.error(`Build completed with ${totalErrors} error(s)`);
  else log.success(`All ${browsers.length} browser builds completed`);
  return results;
}

export async function createBuildContext(
  root: string, config: ExtForgeConfig, opts: BuildOptions, logger?: Logger,
): Promise<esbuild.BuildContext> {
  const log = logger ?? createLogger({ scope: 'builder' });
  const srcDir = join(root, 'src');
  const outDir = opts.outDir ?? join(root, 'dist', opts.browser);
  const entries = discoverEntryPoints(srcDir);
  const cfg = makeBuildConfig(root, { ...opts, outDir }, entries);

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
