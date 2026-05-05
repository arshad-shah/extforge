import { describe, it, expect } from 'vitest';
import {
  generateContentScriptHMRBootstrap,
  CONTENT_SCRIPT_HMR_RUNTIME,
} from '../src/core/hmr/content-script.js';

describe('generateContentScriptHMRBootstrap', () => {
  it('embeds the descriptor JSON verbatim', () => {
    const out = generateContentScriptHMRBootstrap([
      { id: 0, matches: ['*://*.example.com/*'], js: 'content/index.js', runAt: 'document_idle' },
    ]);
    expect(out).toContain('"matches"');
    expect(out).toContain('*://*.example.com/*');
    expect(out).toContain('content/index.js');
  });

  it('uses the chrome.scripting API and falls back gracefully when missing', () => {
    const out = generateContentScriptHMRBootstrap([]);
    expect(out).toContain('chrome?.scripting?.registerContentScripts');
    expect(out).toContain('return;');
  });

  it('generates a unique cache-buster per registration', () => {
    const out = generateContentScriptHMRBootstrap([
      { id: 0, matches: ['<all_urls>'], js: 'content/index.js' },
    ]);
    expect(out).toContain('?t=');
    expect(out).toContain('Date.now()');
  });

  it('exposes a re-register hook on self for HMR triggers', () => {
    const out = generateContentScriptHMRBootstrap([]);
    expect(out).toContain('__EXTFORGE_REREGISTER__');
  });
});

describe('CONTENT_SCRIPT_HMR_RUNTIME', () => {
  it('exports a __extforgeDispose__ hook', () => {
    expect(CONTENT_SCRIPT_HMR_RUNTIME).toContain('__extforgeDispose__');
  });
  it('listens for the cs-dispose message envelope', () => {
    expect(CONTENT_SCRIPT_HMR_RUNTIME).toContain('cs-dispose');
  });
});
