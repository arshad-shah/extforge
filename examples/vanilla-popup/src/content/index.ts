/// <reference types="chrome" />

import { sendMessage } from 'extforge/messaging';

declare module 'extforge/messaging' {
  interface MessageMap {
    'ping':           { req: void;            res: { type: 'PONG'; from: string; ts: number } };
    'content-loaded': { req: { url: string }; res: { type: 'CONTENT_ACK'; total: number } };
    'get-tabs-seen':  { req: void;            res: { count: number } };
  }
}

const MARKER_ID = 'extforge-vanilla-marker';

function injectMarker(): void {
  if (document.getElementById(MARKER_ID)) return;
  const el = document.createElement('div');
  el.id = MARKER_ID;
  el.dataset['extforge'] = 'vanilla-popup';
  el.textContent = 'extforge-vanilla-popup-loaded';
  el.style.cssText = 'position:fixed;top:0;left:0;background:#5B21B6;color:#fff;padding:4px 8px;font:12px/1.4 system-ui;z-index:2147483647';
  document.documentElement.appendChild(el);
}

injectMarker();

void sendMessage('content-loaded', { url: location.href }).catch(() => {});
