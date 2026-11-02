import './lib/messages';
import { defineContentScript } from 'extforge/entrypoints';
import { sendMessage } from 'extforge/messaging';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    const id = 'extforge-named-marker';
    if (!document.getElementById(id)) {
      const el = document.createElement('div');
      el.id = id;
      el.dataset.extforge = 'named-layout';
      el.textContent = 'extforge-named-layout-loaded';
      document.documentElement.appendChild(el);
    }
    void sendMessage('content-loaded', { url: location.href }).catch(() => {});
  },
});
