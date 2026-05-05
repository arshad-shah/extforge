/// <reference types="chrome" />

import { createRoot, type Root } from 'react-dom/client';
import { defineCSUI } from 'extforge/csui';
import { Widget } from './Widget.js';

export default defineCSUI(
  {
    id: 'extforge-csui-demo',
    matches: ['<all_urls>'],
    runAt: 'document_idle',
    getStyle: () => `:host { all: initial; font-family: system-ui, sans-serif; }`,
  },
  (root) => {
    const reactRoot: Root = createRoot(root);
    reactRoot.render(<Widget />);
    return () => reactRoot.unmount();
  },
);
