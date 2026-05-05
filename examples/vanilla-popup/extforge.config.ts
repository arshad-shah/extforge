import { defineConfig } from 'extforge';

export default defineConfig({
  browsers: ['chrome', 'firefox'],
  framework: 'vanilla',
  css: 'none',
  manifest: {
    name: 'ExtForge Vanilla Popup Example',
    version: '0.1.0',
    description: 'E2E fixture: popup + content + background.',
    manifestVersion: 3,
    permissions: {
      required: ['storage'],
      optional: [],
      host: ['<all_urls>'],
    },
    action: {
      defaultPopup: 'ui/popup/index.html',
      defaultTitle: 'ExtForge Vanilla Popup',
    },
    background: { entrypoint: 'background/index.js' },
    contentScripts: [
      {
        matches: ['<all_urls>'],
        // Paths here reference the BUILT output, not the source. ExtForge
        // discovers entries from src/{background,content,ui/...} automatically.
        js: ['content/index.js'],
        runAt: 'document_idle',
      },
    ],
  },
});
