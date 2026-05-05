/// <reference types="chrome" />

import { defineHandler, setupMessaging } from 'extforge/messaging';
import { Storage } from 'extforge/storage';

declare module 'extforge/messaging' {
  interface MessageMap {
    'ping':           { req: void;                   res: { type: 'PONG'; from: string; ts: number } };
    'content-loaded': { req: { url: string };        res: { type: 'CONTENT_ACK'; total: number } };
    'get-tabs-seen':  { req: void;                   res: { count: number } };
  }
}

const storage = new Storage({ namespace: 'extforge-vanilla' });
const KEY = 'tabsSeen';

defineHandler('ping', () => ({ type: 'PONG', from: 'background', ts: Date.now() }));

defineHandler('content-loaded', async () => {
  const next = ((await storage.get<number>(KEY)) ?? 0) + 1;
  await storage.set(KEY, next);
  return { type: 'CONTENT_ACK', total: next };
});

defineHandler('get-tabs-seen', async () => ({
  count: (await storage.get<number>(KEY)) ?? 0,
}));

setupMessaging();
