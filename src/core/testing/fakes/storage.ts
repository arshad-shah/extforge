// src/core/testing/fakes/storage.ts
import { spy, type Spy } from '../internal/spy.js';

export interface StorageAreaFake {
  get: Spy<(keys?: string | string[] | null) => Promise<Record<string, unknown>>>;
  set: Spy<(items: Record<string, unknown>) => Promise<void>>;
  remove: Spy<(keys: string | string[]) => Promise<void>>;
  clear: Spy<() => Promise<void>>;
  __state(): Record<string, unknown>;
}

export interface StorageFake {
  readonly chrome: {
    local:   StorageAreaFake;
    sync:    StorageAreaFake;
    session: StorageAreaFake;
  };
  reset(): void;
}

function createArea(): StorageAreaFake {
  let state: Record<string, unknown> = {};
  const get = spy(async (keys?: string | string[] | null) => {
    if (keys == null) return { ...state };
    const list = Array.isArray(keys) ? keys : [keys];
    const out: Record<string, unknown> = {};
    for (const k of list) if (k in state) out[k] = state[k];
    return out;
  });
  const set = spy(async (items: Record<string, unknown>) => {
    state = { ...state, ...items };
  });
  const remove = spy(async (keys: string | string[]) => {
    const list = Array.isArray(keys) ? keys : [keys];
    for (const k of list) delete state[k];
  });
  const clear = spy(async () => { state = {}; });
  const area: StorageAreaFake = {
    get, set, remove, clear,
    __state: () => ({ ...state }),
  };
  // attach a private reset that wipes state and call records
  (area as any).__reset = () => {
    state = {};
    get.reset(); set.reset(); remove.reset(); clear.reset();
  };
  return area;
}

export function createStorageFake(): StorageFake {
  const local   = createArea();
  const sync    = createArea();
  const session = createArea();
  return {
    chrome: { local, sync, session },
    reset() {
      (local as any).__reset();
      (sync as any).__reset();
      (session as any).__reset();
    },
  };
}
