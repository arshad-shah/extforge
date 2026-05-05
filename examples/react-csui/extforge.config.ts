import { defineConfig } from 'extforge';

export default defineConfig({
  browsers: ['chrome', 'firefox'],
  framework: 'react',
  css: 'none',
  manifest: {
    name: 'ExtForge React CSUI Example',
    version: '0.1.0',
    description: 'E2E fixture: React popup + content-script Shadow-DOM widget.',
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
    contentScripts: [
      {
        matches: ['<all_urls>'],
        js: ['content/index.js'],
        runAt: 'document_idle',
      },
    ],
  },
});
