/// <reference types="chrome" />

import { createRoot } from 'react-dom/client';
import { Widget } from './Widget.js';

const HOST_ID = 'extforge-csui-host';

function mount(): void {
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.dataset['extforge'] = 'csui';
  // Marked so the dev-mode CSS hot-swap traverses into the shadow tree
  // (handled by the auto-injected HMR client).
  host.setAttribute('data-extforge-shadow', '');
  host.style.cssText = 'all: initial;';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const mountPoint = document.createElement('div');
  mountPoint.id = 'extforge-csui-root';
  shadow.appendChild(mountPoint);

  createRoot(mountPoint).render(<Widget />);

  void chrome.runtime.sendMessage({ type: 'CSUI_MOUNTED' }).catch(() => {});
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
