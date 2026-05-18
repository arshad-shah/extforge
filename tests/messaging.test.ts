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

  it('reads chrome.runtime.lastError when the response is undefined (receiver disconnect)', async () => {
    // Simulate the well-known Chrome scenario: the receiver (SW respawn, tab
    // closed) disconnects mid-flight, so sendMessage resolves with `undefined`
    // and Chrome populates chrome.runtime.lastError. If the caller does not
    // read it, Chrome logs an "Unchecked runtime.lastError" warning to the
    // user's console.
    let lastErrorRead = false;
    const c = (globalThis as { chrome: ChromeMock }).chrome as unknown as {
      runtime: {
        sendMessage: (m: unknown) => Promise<unknown>;
        onMessage: { addListener: (l: Listener) => void };
        get lastError(): { message: string } | undefined;
      };
    };
    Object.defineProperty(c.runtime, 'lastError', {
      configurable: true,
      get() {
        lastErrorRead = true;
        return { message: 'Could not establish connection. Receiving end does not exist.' };
      },
    });
    c.runtime.sendMessage = async () => undefined;
    setupMessaging();
    await expect(sendMessage('echo', { value: 'x' })).rejects.toThrow();
    expect(lastErrorRead).toBe(true);
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

// ─── Ports tests ──────────────────────────────────────────────────────────────

describe('extforge/messaging Ports', () => {
  let originalChrome: unknown;

  beforeEach(() => {
    originalChrome = (globalThis as { chrome?: unknown }).chrome;
    __resetMessaging();
  });
  afterEach(() => {
    (globalThis as { chrome?: unknown }).chrome = originalChrome;
  });

  function makePortMock(): {
    chrome: unknown;
    triggerDisconnect: (lastErrorMsg?: string) => void;
    triggerMessage: (msg: unknown) => void;
    listeners: { messages: Array<(m: unknown) => void>; disconnects: Array<() => void> };
    disconnected: { value: boolean };
  } {
    const messages: Array<(m: unknown) => void> = [];
    const disconnects: Array<() => void> = [];
    const disconnected = { value: false };
    let lastError: { message: string } | undefined;
    const port = {
      postMessage: () => {},
      disconnect: () => { disconnected.value = true; },
      onMessage: {
        addListener: (cb: (m: unknown) => void) => messages.push(cb),
        removeListener: (cb: (m: unknown) => void) => {
          const i = messages.indexOf(cb);
          if (i >= 0) messages.splice(i, 1);
        },
      },
      onDisconnect: {
        addListener: (cb: () => void) => disconnects.push(cb),
      },
    };
    return {
      chrome: {
        runtime: {
          connect: () => port,
          get lastError(): { message: string } | undefined { return lastError; },
          onConnect: { addListener: () => {} },
        },
      },
      triggerDisconnect: (lastErrorMsg?: string) => {
        lastError = lastErrorMsg ? { message: lastErrorMsg } : undefined;
        for (const cb of [...disconnects]) cb();
      },
      triggerMessage: (msg: unknown) => {
        for (const cb of [...messages]) cb(msg);
      },
      listeners: { messages, disconnects },
      disconnected,
    };
  }

  it('openPort wraps the underlying port and forwards messages', async () => {
    const mock = makePortMock();
    (globalThis as { chrome: unknown }).chrome = mock.chrome;
    const { openPort } = await import('../src/core/messaging/index.js');
    const port = openPort<string, string>('chan');
    const seen: string[] = [];
    port.onMessage((m) => seen.push(m));
    mock.triggerMessage('hello');
    expect(seen).toEqual(['hello']);
  });

  it('onDisconnect fires once with the lastError message, then auto-cleans listeners', async () => {
    const mock = makePortMock();
    (globalThis as { chrome: unknown }).chrome = mock.chrome;
    const { openPort } = await import('../src/core/messaging/index.js');
    const port = openPort<string, string>('chan');
    const reasons: Array<string | undefined> = [];
    port.onDisconnect((reason) => reasons.push(reason));
    port.onMessage(() => {});
    expect(mock.listeners.messages.length).toBe(1);
    mock.triggerDisconnect('Receiving end does not exist.');
    expect(reasons).toEqual(['Receiving end does not exist.']);
    // Auto-removed message listeners on disconnect — port reference can be GC'd.
    expect(mock.listeners.messages.length).toBe(0);
    // A second disconnect is a no-op.
    mock.triggerDisconnect();
    expect(reasons).toEqual(['Receiving end does not exist.']);
  });

  it('close() calls port.disconnect', async () => {
    const mock = makePortMock();
    (globalThis as { chrome: unknown }).chrome = mock.chrome;
    const { openPort } = await import('../src/core/messaging/index.js');
    const port = openPort<string, string>('chan');
    port.close();
    expect(mock.disconnected.value).toBe(true);
  });

  it('openPort throws when chrome.runtime.connect is unavailable', async () => {
    (globalThis as { chrome: unknown }).chrome = { runtime: {} };
    const { openPort } = await import('../src/core/messaging/index.js');
    expect(() => openPort('chan')).toThrow(/chrome.runtime.connect/);
  });

  it('onPort filters by channel and ignores foreign port names', async () => {
    const listeners: Array<(p: unknown) => void> = [];
    (globalThis as { chrome: unknown }).chrome = {
      runtime: {
        onConnect: {
          addListener: (cb: (p: unknown) => void) => { listeners.push(cb); },
        },
      },
    };
    const { onPort } = await import('../src/core/messaging/index.js');
    let connected = 0;
    onPort('mine', () => { connected++; });
    // Wrong-named port: ignored.
    for (const l of listeners) l({
      name: 'extforge:other',
      sender: {},
      onMessage: { addListener: () => {}, removeListener: () => {} },
      onDisconnect: { addListener: () => {} },
      postMessage: () => {},
      disconnect: () => {},
    });
    expect(connected).toBe(0);
    // Right name: fires.
    for (const l of listeners) l({
      name: 'extforge:mine',
      sender: {},
      onMessage: { addListener: () => {}, removeListener: () => {} },
      onDisconnect: { addListener: () => {} },
      postMessage: () => {},
      disconnect: () => {},
    });
    expect(connected).toBe(1);
  });

  it('sendMessage rejects with a clear error when the chrome API is missing', async () => {
    delete (globalThis as { chrome?: unknown }).chrome;
    const { sendMessage } = await import('../src/core/messaging/index.js');
    await expect(sendMessage('echo' as never, { value: 'x' } as never)).rejects.toThrow(/sendMessage is not available/);
  });

  it('sendMessageToTab rejects with a clear error when chrome.tabs is missing', async () => {
    (globalThis as { chrome?: unknown }).chrome = { runtime: { sendMessage: async () => undefined } };
    const { sendMessageToTab } = await import('../src/core/messaging/index.js');
    await expect(sendMessageToTab(0, 'echo' as never, { value: 'x' } as never)).rejects.toThrow(/chrome.tabs.sendMessage/);
  });
});
