/**
 * Content script — injected into web pages
 */

console.log('[Content Script] Loaded on', window.location.href);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PING_CONTENT') {
    sendResponse({ alive: true, url: window.location.href });
  }
});

export {};
