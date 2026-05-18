/// <reference types="chrome" />
/**
 * extforge/storage — typed wrapper over chrome.storage.{local,sync,session,managed}
 * with a watch API and a transparent fallback to localStorage when the
 * extension API isn't available (e.g. content script on a real web page where
 * chrome.storage is undefined, or vitest's jsdom).
 *
 * Plasmo parity: this matches `@plasmohq/storage`'s `Storage` class shape.
 * The React hook lives in `./react.ts` to keep the core entry zero-dep.
 */

export type StorageArea = 'local' | 'sync' | 'session' | 'managed';

export interface StorageOptions {
  /** Which chrome.storage area to use. Default: 'local'. */
  area?: StorageArea;
  /**
   * Optional namespace prefix prepended to every key. Lets multiple Storage
   * instances coexist in the same area without colliding.
   */
  namespace?: string;
  /**
   * If true, prefer `chrome.storage` even in places where `localStorage` is
   * also available. Default: true. Set to false to force localStorage (rare;
   * mainly useful in tests).
   */
  preferChromeStorage?: boolean;
}

export type WatchHandler<T = unknown> = (newValue: T | undefined, oldValue: T | undefined) => void;
export type WatchHandlers = Record<string, WatchHandler>;
export type Unwatch = () => void;

/**
 * Thrown by `Storage.set` (localStorage fallback) when the underlying
 * `setItem` rejects for quota reasons. `cause` is the original
 * DOMException so callers can inspect it if needed.
 */
export class StorageQuotaExceededError extends Error {
  override readonly name = 'StorageQuotaExceededError';
  readonly key: string;
  constructor(key: string, cause?: unknown) {
    super(`extforge/storage: quota exceeded writing ${JSON.stringify(key)} to localStorage`);
    this.key = key;
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

interface ChromeChange {
  oldValue?: unknown;
  newValue?: unknown;
}

/**
 * Detect whether we're inside a context where chrome.storage[area] is usable.
 * In page-context content scripts on regular sites, `chrome` may exist but
 * `chrome.storage` does not (because the page hasn't been granted those APIs).
 */
function chromeStorageAvailable(area: StorageArea): boolean {
  if (typeof chrome === 'undefined') return false;
  if (!chrome.storage) return false;
  return typeof (chrome.storage as unknown as Record<string, unknown>)[area] !== 'undefined';
}

function getArea(area: StorageArea): chrome.storage.StorageArea {
  return (chrome.storage as unknown as Record<string, chrome.storage.StorageArea>)[area]!;
}

function localStorageAvailable(): boolean {
  try {
    return typeof globalThis.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export class Storage {
  readonly area: StorageArea;
  readonly namespace: string;
  private readonly preferChrome: boolean;
  private readonly fallbackEvents = new EventTarget();
  // Multiplex all watch() subscribers onto a single chrome.storage.onChanged
  // listener — N hooks watching the same Storage instance shouldn't register
  // N listeners against the chrome API.
  private chromeListenerRegistered = false;
  private chromeListener: ((changes: Record<string, ChromeChange>, area: string) => void) | null = null;
  private readonly watchSubs = new Set<WatchHandlers>();

  constructor(options: StorageOptions = {}) {
    this.area = options.area ?? 'local';
    this.namespace = options.namespace ?? '';
    this.preferChrome = options.preferChromeStorage ?? true;
  }

  private namespaced(key: string): string {
    return this.namespace ? `${this.namespace}:${key}` : key;
  }

  private useChrome(): boolean {
    return this.preferChrome && chromeStorageAvailable(this.area);
  }

  async get<T = unknown>(key: string): Promise<T | undefined> {
    const k = this.namespaced(key);
    if (this.useChrome()) {
      const result = await getArea(this.area).get(k);
      return (result as Record<string, unknown>)[k] as T | undefined;
    }
    if (localStorageAvailable()) {
      const raw = globalThis.localStorage.getItem(k);
      if (raw === null) return undefined;
      try { return JSON.parse(raw) as T; } catch { return raw as unknown as T; }
    }
    return undefined;
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
    const k = this.namespaced(key);
    if (this.useChrome()) {
      await getArea(this.area).set({ [k]: value });
      return;
    }
    if (localStorageAvailable()) {
      // Always JSON.stringify — including strings. Without this, a value
      // like `'{"a":1}'` (a plain string that happens to look like JSON)
      // round-trips as `{ a: 1 }` because `get` JSON.parses unconditionally.
      const raw = JSON.stringify(value);
      const oldRaw = globalThis.localStorage.getItem(k);
      try {
        globalThis.localStorage.setItem(k, raw);
      } catch (err) {
        // localStorage.setItem throws QuotaExceededError (DOMException name
        // varies by browser) when over the per-origin quota. Surface a
        // typed error so callers can decide whether to evict / warn /
        // fall through, rather than a raw DOMException with a confusing
        // call site.
        const name = (err as { name?: string })?.name ?? '';
        if (/Quota/i.test(name) || /QuotaExceeded/i.test(String(err))) {
          throw new StorageQuotaExceededError(k, err);
        }
        throw err;
      }
      this.fallbackEvents.dispatchEvent(new CustomEvent('change', {
        detail: { key: k, newValue: value, oldValue: oldRaw !== null ? safeJSON(oldRaw) : undefined },
      }));
    }
  }

  async remove(key: string): Promise<void> {
    const k = this.namespaced(key);
    if (this.useChrome()) {
      await getArea(this.area).remove(k);
      return;
    }
    if (localStorageAvailable()) {
      const oldRaw = globalThis.localStorage.getItem(k);
      globalThis.localStorage.removeItem(k);
      this.fallbackEvents.dispatchEvent(new CustomEvent('change', {
        detail: { key: k, newValue: undefined, oldValue: oldRaw !== null ? safeJSON(oldRaw) : undefined },
      }));
    }
  }

  async clear(): Promise<void> {
    if (this.useChrome()) {
      await getArea(this.area).clear();
      return;
    }
    if (localStorageAvailable()) {
      // If namespaced, only clear keys in our namespace; otherwise clear all.
      if (this.namespace) {
        const prefix = `${this.namespace}:`;
        const toDelete: string[] = [];
        for (let i = 0; i < globalThis.localStorage.length; i++) {
          const key = globalThis.localStorage.key(i);
          if (key && key.startsWith(prefix)) toDelete.push(key);
        }
        for (const key of toDelete) globalThis.localStorage.removeItem(key);
      } else {
        globalThis.localStorage.clear();
      }
    }
  }

  /**
   * Subscribe to changes. Returns an `unwatch()` function. Handlers are keyed
   * by the (un-namespaced) key they care about; pass `'*'` to receive every
   * change in this area.
   */
  watch(handlers: WatchHandlers): Unwatch {
    if (this.useChrome()) {
      // Subscribe this handlers map to the shared multiplexer. The single
      // chrome.storage.onChanged listener is attached lazily on the first
      // watch() call and removed when the last one unwatches.
      this.watchSubs.add(handlers);
      if (!this.chromeListenerRegistered) {
        this.chromeListener = (changes, area): void => {
          if (area !== this.area) return;
          for (const [fullKey, change] of Object.entries(changes)) {
            const userKey = this.namespace && fullKey.startsWith(`${this.namespace}:`)
              ? fullKey.slice(this.namespace.length + 1)
              : fullKey;
            // Iterate the live set so handlers added/removed mid-broadcast
            // are picked up (or skipped) consistently.
            for (const subHandlers of this.watchSubs) {
              const handler = subHandlers[userKey] ?? subHandlers['*'];
              if (handler) handler(change.newValue, change.oldValue);
            }
          }
        };
        chrome.storage.onChanged.addListener(this.chromeListener);
        this.chromeListenerRegistered = true;
      }
      return () => {
        this.watchSubs.delete(handlers);
        if (this.watchSubs.size === 0 && this.chromeListenerRegistered) {
          chrome.storage.onChanged.removeListener(this.chromeListener!);
          this.chromeListener = null;
          this.chromeListenerRegistered = false;
        }
      };
    }
    // localStorage fallback: use our internal EventTarget. Cross-tab sync
    // would require listening to the `storage` window event too; keep that
    // out of scope until requested.
    const ev = (e: Event): void => {
      const detail = (e as CustomEvent).detail as { key: string; newValue: unknown; oldValue: unknown };
      const userKey = this.namespace && detail.key.startsWith(`${this.namespace}:`)
        ? detail.key.slice(this.namespace.length + 1)
        : detail.key;
      const handler = handlers[userKey] ?? handlers['*'];
      if (handler) handler(detail.newValue, detail.oldValue);
    };
    this.fallbackEvents.addEventListener('change', ev);
    return () => this.fallbackEvents.removeEventListener('change', ev);
  }
}

function safeJSON(raw: string): unknown {
  try { return JSON.parse(raw); } catch { return raw; }
}
