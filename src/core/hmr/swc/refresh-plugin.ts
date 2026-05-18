/**
 * SWC-powered esbuild plugin: transforms .tsx/.jsx with React Fast Refresh
 * metadata in dev mode, leaves them alone in production.
 *
 * Why SWC over Babel: SWC is ~20x faster, written in Rust, distributed as
 * a native binary that matches our esbuild philosophy. Babel's
 * react-refresh plugin works but the JS-in-JS pipeline is slow enough that
 * the difference is noticeable on large extensions.
 *
 * The transform inserts:
 *   1. `import * as RefreshRuntime from 'react-refresh/runtime'` at the top
 *      (only into modules that export components — SWC detects this).
 *   2. `var _s = $RefreshSig$()` per-component to track hook signatures.
 *   3. `_s(MyComponent, "useState{count}|useEffect{...}")` after each hook
 *      call so the runtime can detect breaking signature changes.
 *   4. `$RefreshReg$(MyComponent, "MyComponent")` at module scope per export.
 *
 * The HMR runtime (src/core/hmr/runtime.ts) wires the `accept` side to
 * `RefreshRuntime.performReactRefresh()` so the actual DOM update happens
 * with state preserved.
 *
 * Optional: this plugin loads `@swc/core` lazily at first use. If the
 * package isn't installed, the plugin no-ops with a one-time warning and
 * normal esbuild TS/JSX compilation continues.
 */

import { readFileSync } from 'node:fs';
import type { Plugin, PluginBuild } from 'esbuild';
import { createLogger, type Logger } from '../../logger/index.js';

export interface RefreshPluginOptions {
  /**
   * When false (production), the plugin returns immediately and does
   * nothing — no SWC import, no transform overhead.
   */
  enabled: boolean;
  /**
   * File extensions to transform. Default: tsx + jsx.
   */
  extensions?: ReadonlyArray<'.tsx' | '.jsx' | '.ts' | '.js'>;
  /**
   * Inject `RefreshRuntime` boilerplate at the top of every transformed
   * module. When false, callers are responsible for providing the runtime
   * via a separate global (used by tests).
   */
  injectRuntime?: boolean;
  logger?: Logger;
}

interface SwcModule {
  transform: (
    src: string,
    options: SwcTransformOptions,
  ) => Promise<{ code: string; map?: string }>;
}

interface SwcTransformOptions {
  filename: string;
  jsc: {
    parser: { syntax: 'typescript' | 'ecmascript'; tsx?: boolean; jsx?: boolean };
    transform: { react: { runtime: 'automatic'; refresh: boolean; development?: boolean } };
    target: string;
  };
  module: { type: 'es6' };
  sourceMaps?: boolean;
}

// Lazily-loaded SWC module. Resolved at most once per build context, but the
// cache key is the value of `__swcResolution` — bumped by `__resetSwcCache`
// (test helper) so a single Node process can re-probe between builds. The
// negative cache (resolution failed) is intentionally short-lived: a long
// dev session shouldn't permanently lock out RFR if the user installs
// @swc/core mid-flight, so the negative result is cleared after
// SWC_RETRY_INTERVAL_MS and the next request reprobes.
const SWC_RETRY_INTERVAL_MS = 60_000;
let swcModule: SwcModule | undefined | null;
let swcResolvedAt = 0;
let swcWarned = false;

async function loadSwc(log: Logger): Promise<SwcModule | null> {
  if (swcModule) return swcModule;
  if (swcModule === null && Date.now() - swcResolvedAt < SWC_RETRY_INTERVAL_MS) return null;
  try {
    swcModule = (await import('@swc/core')) as unknown as SwcModule;
    swcResolvedAt = Date.now();
    // If we'd previously warned, surface a "now enabled" signal so the user
    // knows their install was picked up.
    if (swcWarned) {
      swcWarned = false;
      log.info('[hmr] React Fast Refresh enabled — @swc/core resolved.');
    }
    return swcModule;
  } catch {
    swcModule = null;
    swcResolvedAt = Date.now();
    if (!swcWarned) {
      swcWarned = true;
      log.warn(
        '[hmr] React Fast Refresh disabled — @swc/core not installed. ' +
        'Install with `pnpm add -D @swc/core react-refresh` to enable component-level HMR.',
      );
    }
    return null;
  }
}

const COMPONENT_FILE_RE = /\.(tsx|jsx)$/;
const RUNTIME_HEADER = `
import * as __ExtForgeRefreshRuntime__ from 'react-refresh/runtime';
const __extforge_prevRefreshReg = globalThis.$RefreshReg$;
const __extforge_prevRefreshSig = globalThis.$RefreshSig$;
if (!globalThis.__extforge_refresh_inited__) {
  globalThis.__extforge_refresh_inited__ = true;
  __ExtForgeRefreshRuntime__.injectIntoGlobalHook(globalThis);
  globalThis.$RefreshReg$ = () => {};
  globalThis.$RefreshSig$ = () => (type) => type;
}
`.trim();

const RUNTIME_FOOTER = `
;if (import.meta && import.meta.hot) {
  import.meta.hot.accept((mod) => {
    __ExtForgeRefreshRuntime__.performReactRefresh();
  });
}
globalThis.$RefreshReg$ = __extforge_prevRefreshReg;
globalThis.$RefreshSig$ = __extforge_prevRefreshSig;
`.trim();

export function refreshPlugin(options: RefreshPluginOptions): Plugin {
  const log = options.logger ?? createLogger({ scope: 'hmr:rfr' });
  const exts = options.extensions ?? ['.tsx', '.jsx'];
  const injectRuntime = options.injectRuntime ?? true;

  return {
    name: 'extforge:react-fast-refresh',
    setup(build: PluginBuild) {
      if (!options.enabled) return;

      // Match every .tsx/.jsx in user code (not node_modules).
      const filter = new RegExp(`(${exts.map(e => e.replace('.', '\\.')).join('|')})$`);
      build.onLoad({ filter, namespace: 'file' }, async (args) => {
        if (args.path.includes('/node_modules/')) return null;

        const swc = await loadSwc(log);
        if (!swc) return null; // graceful no-op when SWC isn't available

        let source: string;
        try { source = readFileSync(args.path, 'utf8'); }
        catch { return null; }

        const isTsx = COMPONENT_FILE_RE.test(args.path) && args.path.endsWith('.tsx');
        try {
          const transformed = await swc.transform(source, {
            filename: args.path,
            jsc: {
              parser: isTsx
                ? { syntax: 'typescript', tsx: true }
                : { syntax: 'ecmascript', jsx: true },
              transform: {
                react: {
                  runtime: 'automatic',
                  refresh: true,
                  development: true,
                },
              },
              target: 'es2022',
            },
            module: { type: 'es6' },
          });

          const wrapped = injectRuntime
            ? `${RUNTIME_HEADER}\n${transformed.code}\n${RUNTIME_FOOTER}`
            : transformed.code;

          return {
            contents: wrapped,
            loader: isTsx ? 'tsx' : 'jsx',
          };
        } catch (err) {
          log.warn(`[hmr] SWC transform failed for ${args.path}: ${err instanceof Error ? err.message : String(err)}`);
          return null;
        }
      });
    },
  };
}

/** @internal — reset SWC module cache for tests. */
export function __resetSwcCache(): void {
  swcModule = undefined;
  swcResolvedAt = 0;
  swcWarned = false;
}
