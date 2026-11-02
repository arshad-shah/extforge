import './lib/messages';
import { defineHandler, setupMessaging } from 'extforge/messaging';
import { Storage } from 'extforge/storage';

const storage = new Storage({ namespace: 'extforge-named' });
const KEY = 'tabsSeen';

defineHandler('ping', () => ({ type: 'PONG' as const, from: 'background', ts: Date.now() }));
defineHandler('content-loaded', async () => {
  const next = ((await storage.get<number>(KEY)) ?? 0) + 1;
  await storage.set(KEY, next);
  return { type: 'CONTENT_ACK' as const, total: next };
});
defineHandler('get-tabs-seen', async () => ({ count: (await storage.get<number>(KEY)) ?? 0 }));

setupMessaging();
