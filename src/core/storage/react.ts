/**
 * extforge/storage/react — React hook for the Storage class. Lives in its own
 * subpath so the core storage module stays React-free.
 *
 * Plasmo parity: matches `useStorage(key, defaultValue)` from `@plasmohq/storage`.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { Storage, type StorageOptions } from './index.js';

export interface UseStorageReturn<T> {
  /** Current value. `undefined` until the initial async read completes. */
  value: T | undefined;
  /** Set the value. Persists to storage and updates React state. */
  setValue: (next: T) => Promise<void>;
  /** Remove the key from storage and reset React state to `defaultValue`. */
  remove: () => Promise<void>;
  /** True until the first read completes. */
  isLoading: boolean;
}

/**
 * Stable singleton Storage instances keyed by area+namespace, so the hook
 * reuses the same `watch()` subscription across renders.
 */
const cache = new Map<string, Storage>();
function sharedStorage(opts: StorageOptions | undefined): Storage {
  const key = `${opts?.area ?? 'local'}::${opts?.namespace ?? ''}`;
  let s = cache.get(key);
  if (!s) {
    s = new Storage(opts);
    cache.set(key, s);
  }
  return s;
}

export function useStorage<T>(
  key: string,
  defaultValue: T,
  options?: StorageOptions,
): UseStorageReturn<T> {
  const storage = sharedStorage(options);
  const [value, setLocal] = useState<T | undefined>(undefined);
  const [isLoading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    void (async () => {
      const cur = await storage.get<T>(key);
      if (!mountedRef.current) return;
      setLocal(cur ?? defaultValue);
      setLoading(false);
    })();

    const unwatch = storage.watch({
      [key]: (next: unknown) => {
        if (!mountedRef.current) return;
        setLocal((next as T | undefined) ?? defaultValue);
      },
    });

    return () => {
      mountedRef.current = false;
      unwatch();
    };
    // We deliberately don't include `defaultValue` in deps — changing it
    // shouldn't re-fetch storage. Callers rarely change it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, storage]);

  const setValue = useCallback(
    async (next: T) => {
      await storage.set(key, next);
      // Optimistic local update; the watch listener will also fire but no harm.
      if (mountedRef.current) setLocal(next);
    },
    [key, storage],
  );

  const remove = useCallback(
    async () => {
      await storage.remove(key);
      if (mountedRef.current) setLocal(defaultValue);
    },
    [key, storage, defaultValue],
  );

  return { value, setValue, remove, isLoading };
}
