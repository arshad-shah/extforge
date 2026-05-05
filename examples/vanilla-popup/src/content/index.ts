/// <reference types="chrome" />

// Content script. Adds a marker element to the DOM so the e2e harness can
// assert presence, then notifies the background SW.

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

chrome.runtime
  .sendMessage({ type: 'CONTENT_LOADED', url: location.href })
  .catch(() => {
    // SW may not be ready yet; harmless.
  });
