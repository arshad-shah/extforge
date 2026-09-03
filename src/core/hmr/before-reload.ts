/**
 * Teardown hooks that run before the extension reloads (issue #89).
 *
 * `chrome.runtime.reload()` replaces the extension but leaves every already
 * injected content script running. The orphan keeps its timers, listeners and
 * mounted UI alive while its `chrome.runtime` is dead, so the next
 * `sendMessage` throws `Extension context invalidated` and the stale UI stays
 * on the page until the next navigation mounts a second copy on top of it.
 *
 * The HMR client runs these hooks — and dispatches the `extforge:before-reload`
 * event — before it asks for the reload, giving content scripts a tick to tear
 * themselves down.
 *
 * This module is injected into the *browser*: it must stay dependency-free and
 * must not touch anything Node-only. Its runtime contract is mirrored by
 * `scaffold/templates/hmr-client.js.tpl` — keep both in sync.
 */

/**
 * Global the registry lives on. The HMR client is a separate injected IIFE
 * that shares the content script's isolated-world global, so a plain global
 * array is how the two halves meet.
 */
export const BEFORE_RELOAD_REGISTRY_KEY = '__EXTFORGE_BEFORE_RELOAD__';

/** DOM event dispatched alongside the callbacks, for code that would rather listen. */
export const BEFORE_RELOAD_EVENT = 'extforge:before-reload';

/** How long the client waits for hooks before reloading anyway. */
export const BEFORE_RELOAD_TIMEOUT_MS = 500;

/** How often an injected script checks that its extension context is still alive. */
export const CONTEXT_POLL_MS = 1000;

export type BeforeReloadCallback = () => void | Promise<void>;

interface RegistryHost {
  __EXTFORGE_BEFORE_RELOAD__?: BeforeReloadCallback[];
}

function registry(): BeforeReloadCallback[] {
  const host = globalThis as RegistryHost;
  if (!host.__EXTFORGE_BEFORE_RELOAD__) host.__EXTFORGE_BEFORE_RELOAD__ = [];
  return host.__EXTFORGE_BEFORE_RELOAD__;
}

function warn(...args: unknown[]): void {
  const g = globalThis as { __EXTFORGE_HMR_QUIET__?: boolean };
  if (g.__EXTFORGE_HMR_QUIET__) return;
  // biome-ignore lint/suspicious/noConsole: browser runtime; no Logger available here.
  console.warn('[extforge:hmr]', ...args);
}

/**
 * Register a callback to run just before the extension reloads in dev.
 *
 * Returns an unsubscribe function. Callbacks may be async; they are awaited
 * in parallel, with a {@link BEFORE_RELOAD_TIMEOUT_MS} ceiling. A callback
 * that throws (or rejects) is logged and skipped — it never blocks the reload,
 * because a dev loop that stops reloading is worse than a leaked listener.
 */
export function onBeforeExtensionReload(callback: BeforeReloadCallback): () => void {
  const reg = registry();
  reg.push(callback);
  return () => {
    const i = reg.indexOf(callback);
    if (i !== -1) reg.splice(i, 1);
  };
}

/**
 * Is this exact callback already registered? Lets a caller register a
 * singleton teardown without keeping (and trusting) a boolean of its own.
 */
export function isBeforeReloadCallbackRegistered(callback: BeforeReloadCallback): boolean {
  return registry().includes(callback);
}

function dispatchBeforeReloadEvent(): void {
  const g = globalThis as {
    dispatchEvent?: (event: unknown) => boolean;
    CustomEvent?: new (type: string) => unknown;
  };
  if (typeof g.dispatchEvent !== 'function' || typeof g.CustomEvent !== 'function') return;
  try {
    g.dispatchEvent(new g.CustomEvent(BEFORE_RELOAD_EVENT));
  } catch {
    /* a listener threw; the reload still has to happen */
  }
}

/**
 * Run every registered teardown hook. Never rejects, and never takes longer
 * than `timeoutMs` — the caller reloads the extension straight after.
 */
export async function runBeforeExtensionReload(
  timeoutMs: number = BEFORE_RELOAD_TIMEOUT_MS,
): Promise<void> {
  dispatchBeforeReloadEvent();

  // Snapshot: a hook that unsubscribes itself mustn't reshape the array
  // we're iterating.
  const callbacks = registry().slice();
  if (callbacks.length === 0) return;

  const settled = Promise.all(
    callbacks.map(async (cb) => {
      try {
        await cb();
      } catch (err) {
        warn('before-reload hook threw', err);
      }
    }),
  );

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  try {
    await Promise.race([settled, deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Is the extension context this script was injected from still alive?
 *
 * On an orphaned content script `chrome.runtime.id` reads as `undefined`, and
 * in some Chrome builds touching it throws outright — both mean dead.
 */
export function isExtensionContextAlive(runtime: { id?: string } | null | undefined): boolean {
  try {
    return typeof runtime?.id === 'string' && runtime.id.length > 0;
  } catch {
    return false;
  }
}

export interface ContextWatchOptions {
  /** Liveness probe. Throwing counts as dead. */
  isAlive: () => boolean;
  /** Called exactly once, when the context goes away. */
  onInvalidated: () => void;
  intervalMs?: number;
  /** Injectable timers, so the fallback is testable without a real clock. */
  timers?: {
    setInterval: (fn: () => void, ms: number) => unknown;
    clearInterval: (handle: unknown) => void;
  };
}

/**
 * Fallback layer for the case where the dispose broadcast never arrives — the
 * dev server died, or the socket had already given up. Polls the extension
 * context and self-disposes when it goes away. Returns a stop function.
 */
export function watchExtensionContext(options: ContextWatchOptions): () => void {
  const ms = options.intervalMs ?? CONTEXT_POLL_MS;
  const set: (fn: () => void, ms: number) => unknown =
    options.timers?.setInterval ?? ((fn, d) => setInterval(fn, d));
  const clear: (handle: unknown) => void =
    options.timers?.clearInterval ??
    ((h) => clearInterval(h as Parameters<typeof clearInterval>[0]));
  let fired = false;

  let handle: unknown;
  handle = set(() => {
    if (fired) return;
    let alive: boolean;
    try {
      alive = options.isAlive();
    } catch {
      alive = false;
    }
    if (alive) return;
    fired = true;
    clear(handle);
    try {
      options.onInvalidated();
    } catch (err) {
      warn('self-dispose threw', err);
    }
  }, ms);

  return () => {
    if (fired) return;
    fired = true;
    clear(handle);
  };
}

/** @internal — clears the registry. Tests only. */
export function __resetBeforeReload(): void {
  (globalThis as RegistryHost).__EXTFORGE_BEFORE_RELOAD__ = [];
}
