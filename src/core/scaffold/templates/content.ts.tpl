/**
 * Content script, injected into the pages `matches` selects. ExtForge reads
 * these options at build time and adds the content_scripts entry for you.
 */
import { defineContentScript } from 'extforge/entrypoints';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    console.log('[Content Script] Loaded on', window.location.href);

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === 'PING_CONTENT') {
        sendResponse({ alive: true, url: window.location.href });
      }
    });
  },
});
