/**
 * Recursive file watcher built on `node:fs.watch({ recursive: true })`.
 * Replaces chokidar for our use case. Stable on macOS and Windows since
 * Node 14, on Linux since Node 20 (kernel-side via inotify).
 *
 * What we deliberately keep narrow vs chokidar:
 * - Single watch root per call (the HMR caller registers each path separately).
 * - awaitWriteFinish: emulated with a short stat-stable loop (50–100ms).
 * - ignored: glob-string array, matched against the relative path.
 * - Event types collapsed to 'change' | 'add' | 'unlink' to match the
 *   listener shape the rest of the HMR module expects.
 */

import { watch, statSync, readdirSync, type FSWatcher as NodeFSWatcher } from 'node:fs';
import { join } from 'node:path';

export type WatchEventType = 'change' | 'add' | 'unlink';
export type WatchHandler = (file: string) => void;

export interface WatcherOptions {
  ignored?: readonly string[];
  awaitWriteFinish?: { stabilityThreshold: number; pollInterval: number };
  /**
   * Called when the underlying `node:fs.watch` cannot be started (path
   * missing, Linux Node <20, or the platform/kernel does not support
   * recursive watch). Receives a short human-readable reason. Lets the
   * dev server surface a warning instead of silently no-oping.
   */
  onUnsupported?: (reason: string) => void;
}

export interface Watcher {
  on(event: WatchEventType, handler: WatchHandler): this;
  close(): Promise<void>;
}

/**
 * Recursive watch on a single path. If `path` doesn't exist when this is
 * called, returns a no-op watcher (matches chokidar's tolerance of missing
 * roots).
 */
export function createWatcher(path: string, options: WatcherOptions = {}): Watcher {
  const handlers: Record<WatchEventType, Set<WatchHandler>> = {
    change: new Set(),
    add: new Set(),
    unlink: new Set(),
  };

  // Track existence so we can synthesize 'add' / 'unlink' events from
  // node:fs.watch's lower-resolution `change` and `rename` notifications.
  const existence = new Map<string, boolean>();
  const ignored = options.ignored ?? [];
  const stab = options.awaitWriteFinish?.stabilityThreshold ?? 0;
  const poll = options.awaitWriteFinish?.pollInterval ?? 50;

  let nodeWatcher: NodeFSWatcher | null = null;
  try {
    nodeWatcher = watch(path, { recursive: true, persistent: true });
  } catch (err) {
    // Path missing or recursive watch unsupported (e.g. Linux Node <20).
    // Return a no-op watcher so callers don't crash, but report the reason
    // so the dev server can surface a warning instead of silently no-oping
    // and leaving the user wondering why HMR never fires.
    const e = err as NodeJS.ErrnoException;
    options.onUnsupported?.(e?.code ?? e?.message ?? 'unknown');
    return makeNoop();
  }

  // Seed the existence map by walking the watch root. Without this, the very
  // first delete after start() classifies as 'change' (had=false, now=false)
  // instead of 'unlink', and the HMR server misses the full-reload.
  seedExistence(path, ignored);

  function seedExistence(rootDir: string, ignorePatterns: readonly string[]): void {
    const stack = [rootDir];
    let seen = 0;
    while (stack.length && seen < 10_000) {
      const d = stack.pop()!;
      let entries: import('node:fs').Dirent[];
      try { entries = readdirSync(d, { withFileTypes: true }); }
      catch { continue; }
      for (const ent of entries) {
        const full = join(d, ent.name);
        const rel = full.slice(rootDir.length + 1).replace(/\\/g, '/');
        if (matchesIgnored(rel, ignorePatterns)) continue;
        if (ent.isDirectory()) { stack.push(full); continue; }
        if (ent.isFile()) {
          existence.set(full, true);
          seen++;
        }
      }
    }
  }

  nodeWatcher.on('error', () => {
    // Some platforms surface ENOSPC or "file/dir disappeared". Swallow —
    // the dev server logs at a higher level.
  });

  nodeWatcher.on('change', (eventType, filename) => {
    if (filename === null) return;
    const rel = String(filename);
    if (rel.length === 0) return;
    if (matchesIgnored(rel, ignored)) return;

    const abs = join(path, rel);
    if (stab > 0) {
      void waitForStable(abs, stab, poll).then((kind) => fire(kind, abs));
    } else {
      fire(detect(abs), abs);
    }
  });

  function detect(abs: string): WatchEventType {
    const had = existence.get(abs) ?? false;
    let nowExists = false;
    try { statSync(abs); nowExists = true; } catch { /* missing */ }
    existence.set(abs, nowExists);
    if (!had && nowExists) return 'add';
    if (had && !nowExists) return 'unlink';
    return 'change';
  }

  function fire(kind: WatchEventType, file: string): void {
    for (const h of handlers[kind]) {
      try { h(file); } catch { /* swallow listener errors */ }
    }
  }

  function makeNoop(): Watcher {
    const api: Watcher = {
      on() { return api; },
      async close() { /* no-op */ },
    };
    return api;
  }

  const api: Watcher = {
    on(event, handler) {
      handlers[event].add(handler);
      return api;
    },
    async close() {
      try { nodeWatcher?.close(); } catch { /* ignore */ }
      nodeWatcher = null;
      for (const set of Object.values(handlers)) set.clear();
    },
  };
  return api;
}

/**
 * Wait until the file's mtime+size stay stable for `stableMs`. Returns the
 * effective WatchEventType once stable. If the file doesn't exist after the
 * settle period, we treat it as 'unlink'.
 */
async function waitForStable(
  abs: string,
  stableMs: number,
  pollMs: number,
): Promise<WatchEventType> {
  let last: { size: number; mtimeMs: number } | undefined;
  const start = Date.now();
  let lastChange = start;

  while (Date.now() - lastChange < stableMs) {
    let cur: { size: number; mtimeMs: number } | undefined;
    try {
      const s = statSync(abs);
      cur = { size: s.size, mtimeMs: s.mtimeMs };
    } catch { /* missing */ }

    if (!cur) {
      // File gone — treat as unlink immediately.
      return 'unlink';
    }
    if (!last || cur.size !== last.size || cur.mtimeMs !== last.mtimeMs) {
      last = cur;
      lastChange = Date.now();
    }
    await sleep(pollMs);
    // Safety bound — give up after 5x stableMs.
    if (Date.now() - start > stableMs * 5) break;
  }

  // We don't track existence for stab path; report 'change' (the HMR
  // classifier doesn't differentiate between add/change for most types).
  return 'change';
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Match a relative path against a list of glob-ish strings. Supports `**` and
 * the suffix `/.` form used by the existing WATCH_IGNORED constant.
 *
 * We deliberately keep this minimal — chokidar's full picomatch surface isn't
 * needed for our four ignored entries.
 */
function matchesIgnored(rel: string, ignored: readonly string[]): boolean {
  for (const pat of ignored) {
    if (matchesGlob(rel, pat)) return true;
  }
  return false;
}

function matchesGlob(input: string, pattern: string): boolean {
  // Convert glob → RegExp. Only ** and * supported.
  const re = pattern
    .split(/(\*\*|\*)/)
    .map((seg) => {
      if (seg === '**') return '.*';
      if (seg === '*') return '[^/]*';
      return seg.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return new RegExp(`^${re}$`).test(input);
}
