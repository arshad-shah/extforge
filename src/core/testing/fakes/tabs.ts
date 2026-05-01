// src/core/testing/fakes/tabs.ts
import { spy, type Spy } from '../internal/spy.js';

export interface TabRecord { id: number; url: string; active: boolean; }

export interface TabsFake {
  readonly chrome: {
    query: Spy<(info: { url?: string; active?: boolean }) => Promise<TabRecord[]>>;
    sendMessage: Spy<(tabId: number, message: any) => Promise<any>>;
    create: Spy<(props: { url: string }) => Promise<TabRecord>>;
    reload: Spy<(tabId: number) => Promise<void>>;
  };
  /** Seed tabs into the fake. */
  __seed(tabs: Array<{ id: number; url: string; active?: boolean }>): void;
  reset(): void;
}

export function createTabsFake(): TabsFake {
  let tabs: TabRecord[] = [];
  let nextId = 1000;

  const query = spy(async (info: { url?: string; active?: boolean }) => {
    return tabs.filter((t) => {
      if (info.active !== undefined && t.active !== info.active) return false;
      if (info.url !== undefined && t.url !== info.url) return false;
      return true;
    });
  });

  const sendMessage = spy(async (_tabId: number, _msg: any) => undefined as any);

  const create = spy(async (props: { url: string }) => {
    const t: TabRecord = { id: nextId++, url: props.url, active: true };
    tabs.push(t);
    return t;
  });

  const reload = spy(async (_tabId: number) => undefined);

  return {
    chrome: { query, sendMessage, create, reload },
    __seed(seed) {
      for (const t of seed) tabs.push({ id: t.id, url: t.url, active: t.active ?? false });
    },
    reset() {
      tabs = [];
      nextId = 1000;
      query.reset(); sendMessage.reset(); create.reset(); reload.reset();
    },
  };
}
