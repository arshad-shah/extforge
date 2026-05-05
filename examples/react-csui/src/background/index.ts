/// <reference types="chrome" />

import { defineHandler, setupMessaging } from 'extforge/messaging';
import { Storage } from 'extforge/storage';

declare module 'extforge/messaging' {
  interface MessageMap {
    'csui-mounted': { req: void; res: { total: number } };
    'get-count':    { req: void; res: { count: number } };
    'ping':         { req: void; res: { type: 'PONG'; from: string; ts: number } };
  }
}

const storage = new Storage({ namespace: 'extforge-react-csui' });

defineHandler('ping', () => ({ type: 'PONG', from: 'background', ts: Date.now() }));

defineHandler('get-count', async () => ({
  count: (await storage.get<number>('csuiMounts')) ?? 0,
}));

defineHandler('csui-mounted', async () => {
  const total = ((await storage.get<number>('csuiMounts')) ?? 0) + 1;
  await storage.set('csuiMounts', total);
  return { total };
});

setupMessaging();
