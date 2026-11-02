import { defineConfig } from 'extforge';

// No entry paths here: ExtForge finds src/background.ts, src/popup/index.html,
// src/options.html and src/marker.content.ts, and generates the manifest's
// background, action.default_popup, options and content_scripts from them.
export default defineConfig({
  browsers: ['chrome', 'firefox'],
  framework: 'vanilla',
  css: 'none',
  manifest: {
    name: 'ExtForge Named Layout Example',
    version: '0.1.0',
    description: 'E2E fixture: entrypoints by name, generated manifest.',
    manifestVersion: 3,
    permissions: { required: ['storage'], optional: [], host: [] },
    action: { defaultTitle: 'ExtForge Named Layout' },
  },
});
