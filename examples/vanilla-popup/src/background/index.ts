/// <reference types="chrome" />

// Background service worker. Counts how many tabs the content script has
// activated on, persists the count in chrome.storage.local, and answers
// PING messages so the e2e harness can confirm the SW is alive.

const KEY = 'tabsSeen';

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({ [KEY]: 0 });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'PING') {
    sendResponse({ type: 'PONG', from: 'background', ts: Date.now() });
    return true;
  }
  if (msg?.type === 'CONTENT_LOADED') {
    void (async () => {
      const cur = await chrome.storage.local.get(KEY);
      const next = (cur[KEY] ?? 0) + 1;
      await chrome.storage.local.set({ [KEY]: next });
      sendResponse({ type: 'CONTENT_ACK', total: next });
    })();
    return true; // keep channel open for async sendResponse
  }
  return false;
});
