/**
 * ExtForge HMR System
 *
 * HMR client code loaded from templates/hmr-client.js.tpl
 * Classification rules from ./constants.ts
 */

import { WebSocketServer, WebSocket } from 'ws';
import { existsSync } from 'node:fs';
import { createWatcher, type Watcher } from './watcher.js';
import { createServer as createNetServer } from 'node:net';
import { join, relative, extname } from 'node:path/posix';
import { createLogger, type Logger } from '../logger/index.js';
import { build, createBuildContext, buildContentScriptMap } from '../builder/index.js';
import type { Browser } from '../manifest/index.js';
import type { ExtForgeConfig } from '../config.js';
import type * as esbuild from 'esbuild';
import { loadTemplate } from '../scaffold/template-loader.js';
import {
  CSS_EXTENSIONS, ASSET_EXTENSIONS, BACKGROUND_PATTERNS, INJECTED_PATTERNS,
  MANIFEST_PATTERNS, DEBOUNCE_MS, DEFAULT_HMR_PORT, MAX_PORT_RETRIES, WATCH_IGNORED,
  HMR_PROTOCOL_VERSION,
} from './constants.js';
import { formatReloadLog } from './client-logic.js';
import type { PluginRunner } from '../plugins/runner.js';

async function reservePort(start: number, host: string, log: Logger): Promise<number> {
  for (let i = 0; i < MAX_PORT_RETRIES; i++) {
    const port = start + i;
    try {
      await new Promise<void>((res, rej) => {
        const s = createNetServer();
        s.once('error', rej);
        s.listen(port, host, () => s.close(() => res()));
      });
      if (port !== start) log.warn(`Port ${start} in use, using ${port}`);
      return port;
    } catch { /* try next */ }
  }
  log.warn(`Could not find free port near ${start}; using ${start}`);
  return start;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type HMRUpdateType = 'css' | 'js' | 'full-reload' | 'manifest' | 'assets';

export interface HMRUpdate {
  v?: number;
  type: HMRUpdateType;
  files: string[];
  timestamp: number;
  scriptIds?: number[];
}

/** v3 fine-grained envelope. Client swaps modules via React Fast Refresh. */
export interface HMRUpdateV3 {
  v: 3;
  type: 'hmr-update';
  updates: Array<{
    /** Stable module id — relative source path. */
    id: string;
    /** Cache-busting hash, also used to dedupe no-op updates. */
    hash: string;
    /** Path to the bundled chunk, relative to dist/<browser>/. */
    file: string;
  }>;
  timestamp: number;
}

export interface HMRServerOptions {
  port?: number;
  host?: string;
  projectRoot: string;
  config: ExtForgeConfig;
  browser: Browser;
  logger?: Logger;
}

export interface HMRServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  readonly port: number;
  readonly connections: number;
}

// ─── Change classifier (uses constants) ──────────────────────────────────────

export function classifyChange(filePath: string): HMRUpdateType {
  const ext = extname(filePath);
  const normalized = filePath.replace(/\\/g, '/');

  if (MANIFEST_PATTERNS.some(p => normalized.includes(p)))   return 'manifest';
  if (BACKGROUND_PATTERNS.some(p => normalized.includes(p))) return 'full-reload';
  if (INJECTED_PATTERNS.some(p => normalized.includes(p)))   return 'full-reload';
  if (CSS_EXTENSIONS.has(ext))                                return 'css';
  if (ASSET_EXTENSIONS.has(ext))                              return 'assets';
  return 'js';
}

// ─── scriptIds extractor (exported for unit tests) ───────────────────────────

/**
 * Given a set of changed absolute file paths and a content-script map
 * (absolute path → scriptId index), return a sorted array of matching
 * scriptIds, or undefined if none match.
 */
export function extractScriptIds(
  changedAbsPaths: Iterable<string>,
  map: Map<string, number>,
): number[] | undefined {
  if (map.size === 0) return undefined;
  const ids = new Set<number>();
  for (const file of changedAbsPaths) {
    const id = map.get(file);
    if (id !== undefined) ids.add(id);
  }
  if (ids.size === 0) return undefined;
  return Array.from(ids).sort((a, b) => a - b);
}

// ─── Client code generator (reads from .tpl file) ────────────────────────────

export function generateHMRClientCode(port: number, host: string = 'localhost'): string {
  return loadTemplate('hmr-client.js.tpl', {
    HMR_HOST: host,
    HMR_PORT: String(port),
  });
}

// ─── Debouncer ───────────────────────────────────────────────────────────────

class ChangeDebouncer {
  private pending = new Map<string, HMRUpdateType>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private delay: number,
    private callback: (changes: Map<string, HMRUpdateType>) => void,
  ) {}

  add(file: string, type: HMRUpdateType): void {
    this.pending.set(file, type);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const batch = new Map(this.pending);
      this.pending.clear();
      this.timer = null;
      this.callback(batch);
    }, this.delay);
  }

  flush(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.pending.size > 0) {
      const batch = new Map(this.pending);
      this.pending.clear();
      this.callback(batch);
    }
  }
}

// ─── HMR Server ──────────────────────────────────────────────────────────────

export function createHMRServer(options: HMRServerOptions): HMRServer {
  const { projectRoot, config, browser, host = 'localhost' } = options;
  const log = (options.logger ?? createLogger({ scope: 'hmr' })).child(browser);
  const runner = (config as { __pluginRunner?: PluginRunner }).__pluginRunner;

  let wss: WebSocketServer | null = null;
  let watcher: Watcher | null = null;
  let buildCtx: esbuild.BuildContext | null = null;
  let resolvedPort = options.port ?? DEFAULT_HMR_PORT;
  let contentScriptMap: Map<string, number> = new Map();

  const broadcast = (update: HMRUpdate | HMRUpdateV3): void => {
    if (!wss) return;
    // v3 envelopes set their own `v: 3`; v2 fills in HMR_PROTOCOL_VERSION
    // (currently 3) without overriding an explicit v from the caller.
    const finalUpdate = ('v' in update && typeof update.v === 'number')
      ? update
      : { ...(update as HMRUpdate), v: HMR_PROTOCOL_VERSION };
    const payload = JSON.stringify(finalUpdate);
    let sent = 0;
    wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) { c.send(payload); sent++; } });
    log.debug(`Broadcast ${(finalUpdate as { type: string }).type} v=${(finalUpdate as { v: number }).v} to ${sent} client(s)`);
  };

  /**
   * Decide whether a batch of changes is hot-applicable via v3:
   * every changed file must be a .ts/.tsx that lands in popup/options/sidepanel
   * (no background, no content, no manifest, no asset).
   *
   * Returns the list of UI entry files (relative to dist) that need swapping,
   * or undefined to fall back to v2.
   */
  const tryClassifyV3 = (changes: Map<string, HMRUpdateType>): string[] | undefined => {
    const types = new Set(changes.values());
    if (types.has('manifest') || types.has('full-reload')) return undefined;
    if (types.has('css') || types.has('assets')) return undefined;
    if (!types.has('js')) return undefined;

    // All changes must be inside src/ui/* — anything else falls back to reload.
    const uiPrefix = `${projectRoot}/src/ui/`;
    for (const abs of changes.keys()) {
      if (!abs.startsWith(uiPrefix)) return undefined;
    }

    // Map each absolute source file to a UI entry output. Only popup/options/
    // sidepanel are eligible (those are the only ESM UI entries discovered by
    // discoverEntryPoints).
    const matchedEntries = new Set<string>();
    for (const abs of changes.keys()) {
      const rel = abs.replace(`${projectRoot}/src/`, '');
      if      (rel.startsWith('ui/popup/'))     matchedEntries.add('ui/popup/index.js');
      else if (rel.startsWith('ui/options/'))   matchedEntries.add('ui/options/index.js');
      else if (rel.startsWith('ui/sidepanel/')) matchedEntries.add('ui/sidepanel/index.js');
      else return undefined;
    }
    if (matchedEntries.size === 0) return undefined;
    return Array.from(matchedEntries);
  };

  const debouncer = new ChangeDebouncer(DEBOUNCE_MS, async (changes) => {
    const types = new Set(changes.values());
    let updateType: HMRUpdateType;
    if (types.has('manifest') || types.has('full-reload')) updateType = 'full-reload';
    else if (types.has('js'))     updateType = 'js';
    else if (types.has('assets')) updateType = 'assets';
    else                          updateType = 'css';

    const files = Array.from(changes.keys()).map(f => relative(projectRoot, f));
    const rebuildStart = performance.now();

    try {
      if (buildCtx) await buildCtx.rebuild();
      else await build(projectRoot, config, { browser, dev: true, hmrPort: resolvedPort, hmrHost: host }, log);
    } catch (err) {
      log.error(`Rebuild failed: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    // Refresh the content-script map when the manifest changes — the user may
    // have added/removed/reordered content_scripts entries, invalidating the
    // scriptId mapping captured at start().
    if (types.has('manifest')) {
      contentScriptMap = buildContentScriptMap(projectRoot, config);
    }

    let scriptIds: number[] | undefined;
    if (updateType === 'js' && contentScriptMap.size > 0) {
      const absChanged = Array.from(changes.keys());
      scriptIds = extractScriptIds(absChanged, contentScriptMap);
    }

    const timestamp = Date.now();

    // v3 path: hot-applicable UI-only JS change. Emit a v3 envelope. Client
    // refetches the chunk via chrome-extension://<id>/<file>?t=<hash> and
    // the React Fast Refresh runtime in the new module performs the swap.
    const v3Files = tryClassifyV3(changes);
    if (v3Files && updateType === 'js') {
      const hash = String(timestamp);
      const v3Update: HMRUpdateV3 = {
        v: 3,
        type: 'hmr-update',
        timestamp,
        updates: v3Files.map(f => ({ id: f, hash, file: f })),
      };
      broadcast(v3Update);
      await runner?.fireDevReload({ v: HMR_PROTOCOL_VERSION, type: 'js', files, timestamp, scriptIds });
      const durationMs = Math.round(performance.now() - rebuildStart);
      const clientCount = wss ? Array.from(wss.clients).filter(c => c.readyState === WebSocket.OPEN).length : 0;
      log.info(`[hmr] hot-update ${v3Files.join(', ')} — ${durationMs}ms (${clientCount} client(s))`);
      log.debug(`changed: ${files.join(', ')}`);
      return;
    }

    broadcast({ type: updateType, files, timestamp, scriptIds });
    await runner?.fireDevReload({ v: HMR_PROTOCOL_VERSION, type: updateType, files, timestamp, scriptIds });

    const durationMs = Math.round(performance.now() - rebuildStart);
    const clientCount = wss ? Array.from(wss.clients).filter(c => c.readyState === WebSocket.OPEN).length : 0;
    log.info(formatReloadLog({ type: updateType, files, durationMs }, clientCount));

    log.debug(`changed: ${files.join(', ')}`);
  });

  return {
    get port() { return resolvedPort; },
    get connections() {
      return wss ? Array.from(wss.clients).filter(c => c.readyState === WebSocket.OPEN).length : 0;
    },

    async start() {
      // Resolve the WS port before the initial build so the bundled HMR client
      // points at the correct port (the build embeds the port at compile time).
      resolvedPort = await reservePort(resolvedPort, host, log);

      log.time('initial-build');
      await build(projectRoot, config, { browser, dev: true, hmrPort: resolvedPort, hmrHost: host }, log);
      log.timeEnd('initial-build', 'Initial dev build');

      contentScriptMap = buildContentScriptMap(projectRoot, config);

      try { buildCtx = await createBuildContext(projectRoot, config, { browser, dev: true, hmrPort: resolvedPort, hmrHost: host }, log); }
      catch { log.warn('No incremental context — using full rebuilds'); buildCtx = null; }

      wss = new WebSocketServer({ port: resolvedPort, host });
      wss.on('listening', () => log.success(`HMR server listening on ws://${host}:${resolvedPort}`));
      wss.on('connection', () => log.debug(`Client connected (${wss!.clients.size} total)`));
      wss.on('error', (err) => log.error(`WebSocket error: ${err.message}`));

      const watchPaths = [
        join(projectRoot, 'src'), join(projectRoot, 'public'),
        join(projectRoot, 'icons'),
      ].filter(p => existsSync(p));

      // node:fs.watch doesn't watch single files reliably across platforms,
      // so we register one recursive watch per directory root.
      const watchers: Watcher[] = watchPaths.map(p =>
        createWatcher(p, {
          ignored: [...WATCH_IGNORED],
          awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
        }),
      );
      // Aggregate watcher facade — closing it closes them all.
      watcher = {
        on(event, handler) { for (const w of watchers) w.on(event, handler); return this; },
        async close() { for (const w of watchers) await w.close(); },
      };

      watcher.on('change', (fp: string) => debouncer.add(fp, classifyChange(fp)));
      watcher.on('add',    (fp: string) => debouncer.add(fp, classifyChange(fp)));
      watcher.on('unlink', (fp: string) => debouncer.add(fp, 'full-reload'));

      log.banner('ExtForge Dev Server', [
        `Browser:  ${browser}`,
        `HMR:      ws://${host}:${resolvedPort}`,
        `Watching: src/, public/, icons/`,
        '',
        `Load extension from: dist/${browser}/`,
        `Press Ctrl+C to stop`,
      ]);
    },

    async stop() {
      debouncer.flush();
      if (watcher) { await watcher.close(); watcher = null; }
      if (buildCtx) { await buildCtx.dispose(); buildCtx = null; }
      if (wss) { wss.close(); wss = null; }
      log.info('HMR server stopped');
    },
  };
}
