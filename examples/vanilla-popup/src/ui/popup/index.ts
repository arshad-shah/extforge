/// <reference types="chrome" />

import { sendMessage } from 'extforge/messaging';

declare module 'extforge/messaging' {
  interface MessageMap {
    'ping':           { req: void;            res: { type: 'PONG'; from: string; ts: number } };
    'content-loaded': { req: { url: string }; res: { type: 'CONTENT_ACK'; total: number } };
    'get-tabs-seen':  { req: void;            res: { count: number } };
  }
}

const button = document.getElementById('ping') as HTMLButtonElement;
const result = document.getElementById('result') as HTMLPreElement;

async function refresh(): Promise<void> {
  const r = await sendMessage('get-tabs-seen', undefined as never);
  result.textContent = `tabs seen: ${r.count}`;
}

button?.addEventListener('click', async () => {
  const res = await sendMessage('ping', undefined as never);
  result.textContent = JSON.stringify(res, null, 2);
});

void refresh();
