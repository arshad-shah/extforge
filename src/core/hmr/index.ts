/**
 * ExtForge HMR System
 *
 * HMR client code loaded from templates/hmr-client.js.tpl
 * Classification rules from ./constants.ts
 */

import { WebSocketServer, WebSocket } from 'ws';
import chokidar, { type FSWatcher } from 'chokidar';
import { existsSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { join, relative, extname } from 'pathe';
import { createLogger, type Logger } from '../logger/index.js';
import { build, createBuildContext } from '../builder/index.js';
import type { Browser } from '../manifest/index.js';
import type { ExtForgeConfig } from '../config.js';
import type * as esbuild from 'esbuild';
import { loadTemplate } from '../scaffold/template-loader.js';
import {
  CSS_EXTENSIONS, ASSET_EXTENSIONS, BACKGROUND_PATTERNS, INJECTED_PATTERNS,
  MANIFEST_PATTERNS, DEBOUNCE_MS, DEFAULT_HMR_PORT, MAX_PORT_RETRIES, WATCH_IGNORED,
  HMR_PROTOCOL_VERSION,
} from './constants.js';

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

  let wss: WebSocketServer | null = null;
  let watcher: FSWatcher | null = null;
  let buildCtx: esbuild.BuildContext | null = null;
  let resolvedPort = options.port ?? DEFAULT_HMR_PORT;

  const broadcast = (update: HMRUpdate): void => {
    if (!wss) return;
    const payload = JSON.stringify({ ...update, v: HMR_PROTOCOL_VERSION });
    let sent = 0;
    wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) { c.send(payload); sent++; } });
    log.debug(`Broadcast ${update.type} to ${sent} client(s)`);
  };

  const debouncer = new ChangeDebouncer(DEBOUNCE_MS, async (changes) => {
    const types = new Set(changes.values());
    let updateType: HMRUpdateType;
    if (types.has('manifest') || types.has('full-reload')) updateType = 'full-reload';
    else if (types.has('js'))     updateType = 'js';
    else if (types.has('assets')) updateType = 'assets';
    else                          updateType = 'css';

    const files = Array.from(changes.keys()).map(f => relative(projectRoot, f));
    log.hmr(files, updateType);

    log.time('rebuild');
    try {
      if (buildCtx) await buildCtx.rebuild();
      else await build(projectRoot, config, { browser, dev: true, hmrPort: resolvedPort, hmrHost: host }, log);
    } catch (err) {
      log.error(`Rebuild failed: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    log.timeEnd('rebuild', 'Rebuild');

    broadcast({ type: updateType, files, timestamp: Date.now() });
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

      try { buildCtx = await createBuildContext(projectRoot, config, { browser, dev: true, hmrPort: resolvedPort, hmrHost: host }, log); }
      catch { log.warn('No incremental context — using full rebuilds'); buildCtx = null; }

      wss = new WebSocketServer({ port: resolvedPort, host });
      wss.on('listening', () => log.success(`HMR server listening on ws://${host}:${resolvedPort}`));
      wss.on('connection', () => log.debug(`Client connected (${wss!.clients.size} total)`));
      wss.on('error', (err) => log.error(`WebSocket error: ${err.message}`));

      const watchPaths = [
        join(projectRoot, 'src'), join(projectRoot, 'public'),
        join(projectRoot, 'icons'), join(projectRoot, 'extforge.config.ts'),
      ].filter(p => existsSync(p));

      watcher = chokidar.watch(watchPaths, {
        ignoreInitial: true,
        ignored: [...WATCH_IGNORED],
        awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
      });

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
