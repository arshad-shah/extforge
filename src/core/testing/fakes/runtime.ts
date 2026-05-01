// src/core/testing/fakes/runtime.ts
import { spy, type Spy } from '../internal/spy.js';

type InstalledDetails = { reason: string };

export interface RuntimeFake {
  readonly chrome: {
    id: string;
    onInstalled: { addListener(fn: (d: InstalledDetails) => void): void; removeListener(fn: (d: InstalledDetails) => void): void };
    onStartup:   { addListener(fn: () => void): void; removeListener(fn: () => void): void };
    onMessage:   { addListener(fn: (m: any, sender: any, send: (r: any) => void) => boolean | void): void; removeListener(fn: any): void };
    sendMessage: Spy<(message: any) => Promise<any>>;
    reload:      Spy<() => void>;
  };
  fireOnInstalled(details?: InstalledDetails): void;
  fireOnStartup(): void;
  fireOnMessage(message: any, sender?: any): Promise<any>;
  reset(): void;
}

export function createRuntimeFake(): RuntimeFake {
  const installedListeners: Array<(d: InstalledDetails) => void> = [];
  const startupListeners:   Array<() => void> = [];
  const messageListeners:   Array<(m: any, s: any, send: (r: any) => void) => boolean | void> = [];

  const sendMessage = spy(async (_msg: any) => undefined as any);
  const reload      = spy(() => undefined);

  const fake: RuntimeFake = {
    chrome: {
      id: 'extforge-test-extension-id',
      onInstalled: {
        addListener(fn) { installedListeners.push(fn); },
        removeListener(fn) { const i = installedListeners.indexOf(fn); if (i >= 0) installedListeners.splice(i, 1); },
      },
      onStartup: {
        addListener(fn) { startupListeners.push(fn); },
        removeListener(fn) { const i = startupListeners.indexOf(fn); if (i >= 0) startupListeners.splice(i, 1); },
      },
      onMessage: {
        addListener(fn) { messageListeners.push(fn); },
        removeListener(fn) { const i = messageListeners.indexOf(fn); if (i >= 0) messageListeners.splice(i, 1); },
      },
      sendMessage,
      reload,
    },
    fireOnInstalled(details = { reason: 'install' }) {
      for (const fn of [...installedListeners]) fn(details);
    },
    fireOnStartup() {
      for (const fn of [...startupListeners]) fn();
    },
    fireOnMessage(message, sender = { id: fake.chrome.id }) {
      return new Promise<any>((resolve) => {
        let resolved = false;
        const sendResponse = (r: any) => { if (!resolved) { resolved = true; resolve(r); } };
        let willRespond = false;
        for (const fn of [...messageListeners]) {
          const ret = fn(message, sender, sendResponse);
          if (ret === true) willRespond = true;
        }
        if (!willRespond) resolve(undefined);
      });
    },
    reset() {
      installedListeners.length = 0;
      startupListeners.length = 0;
      messageListeners.length = 0;
      sendMessage.reset();
      reload.reset();
    },
  };
  return fake;
}
