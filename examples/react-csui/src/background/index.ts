/// <reference types="chrome" />

// Background SW. Counts content-script-mounted widgets and hands the count
// back to the popup. The e2e harness asserts the count increments per tab.

const KEY = 'csuiMounts';

async function bump(): Promise<number> {
  const cur = await chrome.storage.local.get(KEY);
  const next = (cur[KEY] ?? 0) + 1;
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'PING') {
    sendResponse({ type: 'PONG', from: 'background', ts: Date.now() });
    return true;
  }
  if (msg?.type === 'CSUI_MOUNTED') {
    void (async () => {
      const total = await bump();
      sendResponse({ type: 'CSUI_ACK', total });
    })();
    return true;
  }
  if (msg?.type === 'GET_COUNT') {
    void (async () => {
      const cur = await chrome.storage.local.get(KEY);
      sendResponse({ count: cur[KEY] ?? 0 });
    })();
    return true;
  }
  return false;
});
