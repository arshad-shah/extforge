/// <reference types="chrome" />
// Shared message types. Ordinary code: src/lib/ is never an entrypoint.
declare module 'extforge/messaging' {
  interface MessageMap {
    ping: { req: void; res: { type: 'PONG'; from: string; ts: number } };
    'content-loaded': { req: { url: string }; res: { type: 'CONTENT_ACK'; total: number } };
    'get-tabs-seen': { req: void; res: { count: number } };
  }
}
export {};
