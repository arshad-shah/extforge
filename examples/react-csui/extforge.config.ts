import { defineConfig } from 'extforge';

export default defineConfig({
  browsers: ['chrome', 'firefox'],
  framework: 'react',
  css: 'none',
  manifest: {
    name: 'ExtForge React CSUI Example',
    version: '0.1.0',
    description: 'E2E fixture: React popup + CSUI Shadow-DOM widget (auto-discovered).',
    manifestVersion: 3,
    permissions: {
      required: ['storage'],
      optional: [],
      host: ['<all_urls>'],
    },
    action: {
      defaultPopup: 'ui/popup/index.html',
      defaultTitle: 'ExtForge React CSUI',
    },
    background: { entrypoint: 'background/index.js' },
    // No `contentScripts` — the CSUI under src/contents/widget.csui.tsx is
    // auto-discovered and registered by the builder.
  },
});
