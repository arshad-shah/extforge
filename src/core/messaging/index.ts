/// <reference types="chrome" />
/**
 * extforge/messaging — typed RPC over chrome.runtime.{sendMessage,onMessage}
 * with named routes, async handlers, and an optional Ports API for long-lived
 * connections (e.g. content-script ↔ background streams).
 *
 * Plasmo parity: matches the public surface of `@plasmohq/messaging` without
 * the Parcel-coupled file-based routing. (File-based routing is planned for
 * a v2 — for now, callers register handlers explicitly with `defineHandler`.)
 *
 * Type-safety: declare routes via module augmentation. ExtForge's TypeScript
 * inference uses the global `MessageMap` interface as a registry:
 *
 *   declare module 'extforge/messaging' {
 *     interface MessageMap {
 *       'get-user': { req: { id: number }; res: { name: string } };
 *     }
 *   }
 *
 * Then `sendMessage('get-user', { id: 1 })` is fully typed both ways.
 */

/**
 * Augmentation slot for user code. Routes register themselves here so caller
 * sites get full inference.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MessageMap {}

type Route = keyof MessageMap & string;

type Req<R extends Route> = MessageMap[R] extends { req: infer Q } ? Q : unknown;
type Res<R extends Route> = MessageMap[R] extends { res: infer S } ? S : unknown;

export interface MessageEnvelope<R extends Route = Route> {
  __extforge: 'msg';
  route: R;
  payload: Req<R>;
}

export interface PortEnvelope {
  __extforge: 'port';
  channel: string;
}

export type Sender = chrome.runtime.MessageSender;
export type Handler<R extends Route> = (req: Req<R>, sender: Sender) => Res<R> | Promise<Res<R>>;

const handlers = new Map<string, Handler<Route>>();
let installed = false;

/**
 * Register a typed handler for `route`. Call this in the background SW (or
 * any context with a chrome.runtime.onMessage listener).
 *
 * Re-registering the same route replaces the handler — useful for HMR.
 */
export function defineHandler<R extends Route>(route: R, handler: Handler<R>): void {
  handlers.set(route, handler as Handler<Route>);
}

/**
 * Wire up `chrome.runtime.onMessage` to dispatch to registered handlers.
 * Idempotent: safe to call multiple times. Call this once at SW startup.
 */
export function setupMessaging(): void {
  if (installed) return;
  if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;
  installed = true;

  chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
    if (!isMessageEnvelope(msg)) return false;
    const handler = handlers.get(msg.route);
    if (!handler) {
      sendResponse({ __extforge: 'err', error: `No handler for route '${msg.route}'` });
      return true;
    }
    void (async () => {
      try {
        const result = await handler(msg.payload, sender);
        sendResponse({ __extforge: 'ok', result });
      } catch (err) {
        sendResponse({
          __extforge: 'err',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    return true; // keep channel open for async response
  });
}

/**
 * Read `chrome.runtime.lastError` and return its message, if any. Reading
 * the property is what suppresses Chrome's "Unchecked runtime.lastError"
 * console spam. This wrapper is a no-op outside the extension runtime.
 */
function takeLastError(): string | undefined {
  if (typeof chrome === 'undefined' || !chrome.runtime) return undefined;
  const err = chrome.runtime.lastError;
  return err?.message;
}

/**
 * Send a message to the background SW (from popup/options/content/etc.) or to
 * the *other* end of `chrome.runtime.sendMessage` and await the typed response.
 *
 * `chrome.runtime.lastError` is always read after the send completes (success
 * or failure) so Chrome doesn't log "Unchecked runtime.lastError" when the
 * receiver disconnects mid-flight (SW respawn, tab closed, no listener).
 */
export async function sendMessage<R extends Route>(route: R, payload: Req<R>): Promise<Res<R>> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    throw new Error('extforge/messaging: chrome.runtime.sendMessage is not available in this context');
  }
  const envelope: MessageEnvelope<R> = { __extforge: 'msg', route, payload };
  let reply: { __extforge: 'ok'; result: Res<R> } | { __extforge: 'err'; error: string } | undefined;
  try {
    reply = (await chrome.runtime.sendMessage(envelope)) as typeof reply;
  } finally {
    // Always drain lastError to suppress Chrome's unchecked-error console spam.
    takeLastError();
  }
  if (!reply) {
    const last = takeLastError();
    throw new Error(
      `extforge/messaging: no reply for route '${String(route)}'${last ? ` (${last})` : ''}`,
    );
  }
  if (reply.__extforge === 'err') {
    throw new Error(`extforge/messaging: '${String(route)}' failed: ${reply.error}`);
  }
  return reply.result;
}

/**
 * Send a message to a specific tab's content script. Same shape as
 * `sendMessage`, but uses `chrome.tabs.sendMessage` underneath. Also reads
 * `chrome.runtime.lastError` after the call to suppress Chrome's
 * unchecked-lastError console spam.
 */
export async function sendMessageToTab<R extends Route>(
  tabId: number,
  route: R,
  payload: Req<R>,
): Promise<Res<R>> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.sendMessage) {
    throw new Error('extforge/messaging: chrome.tabs.sendMessage is not available (background context only)');
  }
  const envelope: MessageEnvelope<R> = { __extforge: 'msg', route, payload };
  let reply: { __extforge: 'ok'; result: Res<R> } | { __extforge: 'err'; error: string } | undefined;
  try {
    reply = (await chrome.tabs.sendMessage(tabId, envelope)) as typeof reply;
  } finally {
    takeLastError();
  }
  if (!reply) {
    const last = takeLastError();
    throw new Error(
      `extforge/messaging: no reply for route '${String(route)}' (tab ${tabId})${last ? ` (${last})` : ''}`,
    );
  }
  if (reply.__extforge === 'err') {
    throw new Error(`extforge/messaging: '${String(route)}' failed: ${reply.error}`);
  }
  return reply.result;
}

// ─── Ports (long-lived connections) ───────────────────────────────────────────

export interface PortChannel<TIn = unknown, TOut = unknown> {
  /** Send a message to the other side. */
  post(msg: TOut): void;
  /** Subscribe to incoming messages. Returns an unsubscribe fn. */
  onMessage(cb: (msg: TIn) => void): () => void;
  /** Close the underlying chrome.runtime.Port. */
  close(): void;
}

/**
 * Open a named port to the background SW. Long-lived; survives across many
 * messages. Useful for streaming.
 */
export function openPort<TIn = unknown, TOut = unknown>(channel: string): PortChannel<TIn, TOut> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.connect) {
    throw new Error('extforge/messaging: chrome.runtime.connect is not available');
  }
  const port = chrome.runtime.connect({ name: `extforge:${channel}` });
  return wrapPort<TIn, TOut>(port);
}

/**
 * Listen for inbound ports on a named channel. Call this in the background
 * SW. The callback receives a typed `PortChannel` for each new connection.
 */
export function onPort<TIn = unknown, TOut = unknown>(
  channel: string,
  onConnect: (port: PortChannel<TIn, TOut>, sender: Sender) => void,
): void {
  if (typeof chrome === 'undefined' || !chrome.runtime?.onConnect) return;
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== `extforge:${channel}`) return;
    onConnect(wrapPort<TIn, TOut>(port), port.sender ?? ({} as Sender));
  });
}

function wrapPort<TIn, TOut>(port: chrome.runtime.Port): PortChannel<TIn, TOut> {
  return {
    post: (msg: TOut) => port.postMessage(msg),
    onMessage: (cb: (msg: TIn) => void) => {
      const listener = (msg: TIn): void => cb(msg);
      port.onMessage.addListener(listener as (m: unknown) => void);
      return () => port.onMessage.removeListener(listener as (m: unknown) => void);
    },
    close: () => port.disconnect(),
  };
}

// ─── Test helpers ─────────────────────────────────────────────────────────────

/** @internal — clears all registered handlers. Used by tests. */
export function __resetMessaging(): void {
  handlers.clear();
  installed = false;
}

function isMessageEnvelope(msg: unknown): msg is MessageEnvelope {
  return (
    !!msg &&
    typeof msg === 'object' &&
    (msg as { __extforge?: unknown }).__extforge === 'msg' &&
    typeof (msg as { route?: unknown }).route === 'string'
  );
}
