/**
 * HMR runtime — module registry + accept/dispose primitives.
 *
 * Inhabits the *target browser* (popup/options/sidepanel pages and content
 * scripts). The dev server emits a v3 `hmr-update` message containing one or
 * more module updates; this runtime applies them by:
 *   1. Importing the new module factory at a versioned URL.
 *   2. Calling each registered `dispose` callback for the previous instance.
 *   3. Replacing the module's exports record.
 *   4. Invoking `accept` callbacks with the new exports — propagating up the
 *      dep graph until something accepts, or falling back to a full reload.
 *
 * This file is consumed two ways:
 *   - As a runtime injected into dev bundles (a small bootstrap).
 *   - As a library for unit tests, exporting `createHMRRuntime()` for
 *     deterministic in-process testing.
 *
 * Deliberately NOT included in this scaffold:
 *   - The esbuild plugin that rewrites user modules to call `register`.
 *     That's tracked in TASKS.md Phase 4.2 — large enough to ship separately.
 *   - React Fast Refresh integration (Phase 4.3). The runtime is RFR-ready;
 *     hooking the Babel transform is the next step.
 */

export interface ModuleRecord {
  /** Stable module id — the file's path relative to project root. */
  id: string;
  /** Current exports object. */
  exports: Record<string, unknown>;
  /** Subscribers for new exports. Returning false vetoes the swap. */
  acceptCallbacks: Array<(newExports: Record<string, unknown>) => void | false>;
  /** Cleanup for the *outgoing* instance. Runs immediately before swap. */
  disposeCallbacks: Array<() => void>;
  /** Hash of the source — used to ignore no-op updates. */
  hash?: string;
}

export interface HotApi {
  /** Subscribe to receive the *new* exports of this module after a swap. */
  accept(cb?: (newExports: Record<string, unknown>) => void | false): void;
  /** Run before this module's exports are replaced. */
  dispose(cb: () => void): void;
  /**
   * Disable HMR for this module — incoming updates trigger a full reload.
   * Equivalent to removing all `accept` callbacks.
   */
  decline(): void;
  /** True if this module participates in HMR. */
  readonly enabled: boolean;
}

export interface HMRRuntime {
  /**
   * Called by transformed user modules at evaluation time. Returns the
   * module's HotApi which user code can call from within the factory.
   */
  register(id: string, exports: Record<string, unknown>): HotApi;
  /**
   * Apply an update. Returns true if at least one `accept` ran successfully;
   * false if the runtime gave up and the caller should reload.
   */
  apply(id: string, newFactory: () => Record<string, unknown>, hash?: string): boolean;
  /** Lookup helper used by tests. */
  get(id: string): ModuleRecord | undefined;
  /** @internal — clears every module. Tests only. */
  __reset(): void;
}

export function createHMRRuntime(): HMRRuntime {
  const modules = new Map<string, ModuleRecord>();
  const declined = new Set<string>();

  function register(id: string, exports: Record<string, unknown>): HotApi {
    let rec = modules.get(id);
    if (!rec) {
      rec = { id, exports, acceptCallbacks: [], disposeCallbacks: [] };
      modules.set(id, rec);
    } else {
      rec.exports = exports;
    }
    return makeHotApi(id, rec);
  }

  function makeHotApi(id: string, rec: ModuleRecord): HotApi {
    let enabled = true;
    return {
      accept(cb) {
        if (!enabled) return;
        rec.acceptCallbacks.push(cb ?? (() => {}));
      },
      dispose(cb) {
        rec.disposeCallbacks.push(cb);
      },
      decline() {
        enabled = false;
        declined.add(id);
        rec.acceptCallbacks = [];
      },
      get enabled() { return enabled; },
    };
  }

  function apply(id: string, newFactory: () => Record<string, unknown>, hash?: string): boolean {
    const rec = modules.get(id);
    if (!rec) return false;
    if (declined.has(id)) return false;
    if (rec.hash !== undefined && hash !== undefined && rec.hash === hash) return true; // no-op
    if (rec.acceptCallbacks.length === 0) return false;

    // Run dispose callbacks for the OLD instance.
    for (const dc of rec.disposeCallbacks) {
      try { dc(); } catch (e) { /* swallow */ console.error('[hmr] dispose error', e); }
    }

    let newExports: Record<string, unknown>;
    try {
      newExports = newFactory();
    } catch (e) {
      console.error('[hmr] factory threw — falling back to reload', e);
      return false;
    }

    rec.exports = newExports;
    rec.disposeCallbacks = [];
    if (hash !== undefined) rec.hash = hash;

    // Notify subscribers. A subscriber returning `false` aborts the swap.
    let aborted = false;
    for (const ac of rec.acceptCallbacks) {
      try {
        const r = ac(newExports);
        if (r === false) aborted = true;
      } catch (e) {
        console.error('[hmr] accept callback threw', e);
        aborted = true;
      }
    }

    if (aborted) return false;
    return true;
  }

  return {
    register,
    apply,
    get: (id) => modules.get(id),
    __reset() { modules.clear(); declined.clear(); },
  };
}

/**
 * Singleton attached to the global so multiple injected modules share state.
 * Accessed by transformed user code via `globalThis.__EXTFORGE_HMR__`.
 */
export function ensureGlobalRuntime(): HMRRuntime {
  const g = globalThis as { __EXTFORGE_HMR__?: HMRRuntime };
  if (!g.__EXTFORGE_HMR__) g.__EXTFORGE_HMR__ = createHMRRuntime();
  return g.__EXTFORGE_HMR__;
}

// ─── v3 protocol envelope ─────────────────────────────────────────────────────

export interface HMRUpdateV3 {
  v: 3;
  type: 'hmr-update';
  /** Module-level updates. Empty array → no-op. */
  updates: Array<{ id: string; hash: string; chunkUrl: string }>;
  timestamp: number;
}

/**
 * Apply a v3 envelope by import()ing each chunk URL and calling the runtime.
 * Returns true if every update was hot-accepted (no reload required).
 */
export async function applyV3Update(
  runtime: HMRRuntime,
  envelope: HMRUpdateV3,
  fetcher: (url: string) => Promise<{ default: () => Record<string, unknown> }>,
): Promise<boolean> {
  if (envelope.updates.length === 0) return true;
  let allAccepted = true;
  for (const u of envelope.updates) {
    try {
      const mod = await fetcher(u.chunkUrl);
      const ok = runtime.apply(u.id, mod.default, u.hash);
      if (!ok) allAccepted = false;
    } catch (err) {
      console.error('[hmr] failed to fetch update', u.chunkUrl, err);
      allAccepted = false;
    }
  }
  return allAccepted;
}
