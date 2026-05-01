// src/core/testing/install.ts
import { createRuntimeFake, type RuntimeFake } from './fakes/runtime.js';
import { createStorageFake, type StorageFake } from './fakes/storage.js';
import { createTabsFake, type TabsFake } from './fakes/tabs.js';
import { createActionFake, type ActionFake } from './fakes/action.js';
import { createScriptingFake, type ScriptingFake } from './fakes/scripting.js';

export interface ChromeFakes {
  runtime:   RuntimeFake;
  storage:   StorageFake;
  tabs:      TabsFake;
  action:    ActionFake;
  scripting: ScriptingFake;
  reset(): void;
}

const NOT_MODELED = (ns: string, method: string) => {
  return () => {
    throw new Error(
      `chrome.${ns}.${method} is not modeled by extforge/testing v1; supply your own mock or extend the fake. ` +
      `Docs: https://extforge.arshadshah.com/testing#unmodeled`,
    );
  };
};

function withNotModeledTrap<T extends object>(target: T, ns: string): T {
  return new Proxy(target, {
    get(t, prop, receiver) {
      const v = Reflect.get(t, prop, receiver);
      if (v !== undefined) return v;
      if (typeof prop === 'string') return NOT_MODELED(ns, prop);
      return v;
    },
  });
}

export function createChromeFakes(): ChromeFakes {
  const runtime   = createRuntimeFake();
  const storage   = createStorageFake();
  const tabs      = createTabsFake();
  const action    = createActionFake();
  const scripting = createScriptingFake();

  return {
    runtime, storage, tabs, action, scripting,
    reset() {
      runtime.reset(); storage.reset(); tabs.reset(); action.reset(); scripting.reset();
    },
  };
}

export function installChromeFakes(): ChromeFakes {
  if ((globalThis as any).chrome !== undefined) {
    throw new Error(
      'globalThis.chrome is already defined. Either remove the existing definition before calling installChromeFakes(), ' +
      'or construct fakes per-namespace via createRuntimeFake() etc.',
    );
  }
  const fakes = createChromeFakes();
  // Wrap storage in a trap so unmodeled sub-areas (e.g. `managed`) error clearly
  // instead of returning undefined. The modeled sub-areas (local/sync/session)
  // pass through unchanged.
  const storageWithTrap = withNotModeledTrap(fakes.storage.chrome, 'storage');
  (globalThis as any).chrome = {
    runtime:   withNotModeledTrap(fakes.runtime.chrome,   'runtime'),
    storage:   storageWithTrap,
    tabs:      withNotModeledTrap(fakes.tabs.chrome,      'tabs'),
    action:    withNotModeledTrap(fakes.action.chrome,    'action'),
    scripting: withNotModeledTrap(fakes.scripting.chrome, 'scripting'),
  };
  return fakes;
}

export function resetChromeFakes(fakes: ChromeFakes): void {
  fakes.reset();
}
