/**
 * Background service worker
 * Runs as MV3 service worker (Chrome/Edge/Safari) or background script (Firefox)
 */

// Register event listeners synchronously at the top level
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    console.log('[Background] Extension installed');
    await chrome.storage.local.set({
      settings: { enabled: true, theme: 'system' },
    });
  } else if (details.reason === 'update') {
    console.log(`[Background] Updated from ${details.previousVersion}`);
  }
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[Background] Extension started');
});

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'GET_SETTINGS': {
      chrome.storage.local.get('settings').then(result => {
        sendResponse(result.settings ?? { enabled: true, theme: 'system' });
      });
      return true;
    }
    case 'PING': {
      sendResponse({ pong: true, timestamp: Date.now() });
      return false;
    }
  }
  return false;
});

export {};
