import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  defineHandler,
  sendMessage,
  setupMessaging,
  __resetMessaging,
} from '../src/core/messaging/index.js';

// Module augmentation for test routes — lives at file scope so type inference
// kicks in for the tests below.
declare module '../src/core/messaging/index.js' {
  interface MessageMap {
    'echo': { req: { value: string }; res: { value: string } };
    'add':  { req: { a: number; b: number }; res: { sum: number } };
    'fail': { req: void; res: never };
  }
}

type Listener = (msg: unknown, sender: unknown, sendResponse: (r: unknown) => void) => boolean | void;

interface ChromeMock {
  runtime: {
    onMessage: { addListener: (l: Listener) => void };
    sendMessage: (msg: unknown) => Promise<unknown>;
  };
}

function makeChromeMock(): { mock: ChromeMock; deliver: (msg: unknown) => Promise<unknown> } {
  let listener: Listener | undefined;
  const mock: ChromeMock = {
    runtime: {
      onMessage: {
        addListener: (l) => { listener = l; },
      },
      // sendMessage drives the listener directly so the round-trip is in-process.
      sendMessage: async (msg: unknown) => {
        if (!listener) throw new Error('no listener registered');
        return await new Promise<unknown>((resolve) => {
          const ok = listener!(msg, { id: 'test' }, resolve);
          if (ok !== true) {
            // If the handler returned non-true, sendResponse was synchronous.
            // For our handlers that always return true, this is a no-op.
          }
        });
      },
    },
  };
  return { mock, deliver: mock.runtime.sendMessage };
}

describe('extforge/messaging', () => {
  let originalChrome: unknown;

  beforeEach(() => {
    originalChrome = (globalThis as { chrome?: unknown }).chrome;
    const { mock } = makeChromeMock();
    (globalThis as { chrome: unknown }).chrome = mock;
    __resetMessaging();
  });
  afterEach(() => {
    (globalThis as { chrome?: unknown }).chrome = originalChrome;
  });

  it('round-trips a typed payload through defineHandler/sendMessage', async () => {
    defineHandler('echo', async (req) => ({ value: req.value.toUpperCase() }));
    setupMessaging();
    const res = await sendMessage('echo', { value: 'hi' });
    expect(res).toEqual({ value: 'HI' });
  });

  it('supports synchronous handler returns', async () => {
    defineHandler('add', (req) => ({ sum: req.a + req.b }));
    setupMessaging();
    const res = await sendMessage('add', { a: 2, b: 3 });
    expect(res).toEqual({ sum: 5 });
  });

  it('throws when no handler is registered for the route', async () => {
    setupMessaging();
    await expect(sendMessage('echo', { value: 'x' })).rejects.toThrow(/No handler for route 'echo'/);
  });

  it('surfaces handler errors as rejections at the caller', async () => {
    defineHandler('fail', async () => { throw new Error('kaboom'); });
    setupMessaging();
    await expect(sendMessage('fail', undefined as never)).rejects.toThrow(/kaboom/);
  });

  it('setupMessaging is idempotent', () => {
    setupMessaging();
    expect(() => setupMessaging()).not.toThrow();
  });

  it('re-registering a handler replaces the previous one', async () => {
    defineHandler('echo', async () => ({ value: 'first' }));
    defineHandler('echo', async () => ({ value: 'second' }));
    setupMessaging();
    const res = await sendMessage('echo', { value: 'whatever' });
    expect(res.value).toBe('second');
  });

  it('ignores non-extforge envelopes (foreign messages)', async () => {
    setupMessaging();
    // Foreign message is dropped. The mock will hang waiting for a response,
    // so we set up a handler that responds and verify it isn't called.
    let called = false;
    defineHandler('echo', async () => { called = true; return { value: '' }; });
    // Send a message that doesn't have `__extforge: 'msg'`. We don't await
    // (the listener returns false, so the channel closes immediately and
    // sendResponse is never called).
    const c = (globalThis as { chrome: ChromeMock }).chrome;
    const result = await Promise.race([
      c.runtime.sendMessage({ type: 'foreign' }),
      new Promise((res) => setTimeout(() => res('timeout'), 30)),
    ]);
    expect(result).toBe('timeout');
    expect(called).toBe(false);
  });
});
