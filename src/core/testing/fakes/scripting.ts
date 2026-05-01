// src/core/testing/fakes/scripting.ts
import { spy, type Spy } from '../internal/spy.js';

export interface ExecuteScriptInjection {
  target: { tabId: number };
  files?: string[];
  func?: (...args: any[]) => any;
  args?: any[];
  world?: 'ISOLATED' | 'MAIN';
}

export interface ScriptingFake {
  readonly chrome: {
    executeScript: Spy<(injection: ExecuteScriptInjection) => Promise<Array<{ result?: unknown; frameId?: number }>>>;
  };
  /** Override the result executeScript returns next time. */
  __nextResult(value: unknown): void;
  reset(): void;
}

export function createScriptingFake(): ScriptingFake {
  const queue: unknown[] = [];

  const executeScript = spy(async (_inj: ExecuteScriptInjection) => {
    const value = queue.length > 0 ? queue.shift() : undefined;
    return [{ result: value, frameId: 0 }];
  });

  return {
    chrome: { executeScript },
    __nextResult(value) { queue.push(value); },
    reset() { queue.length = 0; executeScript.reset(); },
  };
}
