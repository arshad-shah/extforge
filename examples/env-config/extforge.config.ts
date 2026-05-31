import { defineConfig } from 'extforge';

export default defineConfig({
  browsers: ['chrome', 'firefox'],
  framework: 'vanilla',
  css: 'none',
  manifest: {
    name: 'ExtForge Env Example',
    version: '0.1.0',
    description: 'Reads EXTFORGE_PUBLIC_* values inlined from .env at build time.',
    manifestVersion: 3,
    permissions: {
      required: [],
      optional: [],
      host: [],
    },
    action: {
      defaultPopup: 'ui/popup/index.html',
      defaultTitle: 'ExtForge Env Example',
    },
    background: { entrypoint: 'background/index.js' },
  },
});
