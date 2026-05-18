// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Opt out of defineCSUI's auto-mount so these tests exercise the manual
// mountCSUI() path explicitly. Must be set before importing the module.
(globalThis as { __EXTFORGE_CSUI_NO_AUTOMOUNT__?: boolean }).__EXTFORGE_CSUI_NO_AUTOMOUNT__ = true;

import { defineCSUI, mountCSUI, __resetCSUI } from '../src/core/csui/index.js';
import { discoverCSUI, extractMatches, extractRunAt } from '../src/core/csui/discovery.js';

describe('discovery: extractMatches', () => {
  it('extracts a simple matches array from defineCSUI', () => {
    const src = `
      import { defineCSUI } from 'extforge/csui';
      export default defineCSUI({
        matches: ['https://example.com/*', 'https://*.example.com/*'],
      }, () => {});
    `;
    expect(extractMatches(src)).toEqual(['https://example.com/*', 'https://*.example.com/*']);
  });

  it('returns undefined when defineCSUI is not called', () => {
    expect(extractMatches('export const x = 1;')).toBeUndefined();
  });

  it('ignores commented-out defineCSUI calls', () => {
    const src = `// defineCSUI({ matches: ['blocked'] })\nexport const x = 1;`;
    expect(extractMatches(src)).toBeUndefined();
  });

  it('tolerates trailing commas and whitespace inside the array', () => {
    const src = `defineCSUI({ matches: [ 'a', 'b', ], }, () => {});`;
    expect(extractMatches(src)).toEqual(['a', 'b']);
  });

  it('reads the OUTER matches when a nested object literal also has a `matches:` key', () => {
    // Without proper brace tracking, a regex grab of the first `matches:` after
    // `defineCSUI` picks up the inner one and the manifest content_scripts is
    // misconfigured.
    const src = `
      defineCSUI({
        routerMap: { matches: ['/inner/route'] },
        matches: ['https://example.com/*'],
      }, () => {});
    `;
    expect(extractMatches(src)).toEqual(['https://example.com/*']);
  });
});

describe('discovery: extractRunAt', () => {
  it('extracts a string runAt', () => {
    expect(extractRunAt(`defineCSUI({ runAt: 'document_start' }, () => {})`)).toBe('document_start');
  });
  it('returns undefined for invalid values', () => {
    expect(extractRunAt(`defineCSUI({ runAt: 'whenever' }, () => {})`)).toBeUndefined();
  });
  it('ignores a `runAt:` declared OUTSIDE the defineCSUI options literal', () => {
    // A helper constant declared elsewhere in the file used to win
    // because the regex matched the first `runAt:` anywhere in the source.
    const src = `
      const runAt = 'document_end';
      const helper = { runAt: 'document_end' };
      export default defineCSUI({ matches: ['<all_urls>'] }, () => {});
    `;
    expect(extractRunAt(src)).toBeUndefined();
  });
  it('reads the outer runAt even when a nested object also has one', () => {
    const src = `
      defineCSUI({
        router: { runAt: 'document_end' },
        runAt: 'document_start',
      }, () => {});
    `;
    expect(extractRunAt(src)).toBe('document_start');
  });
});

describe('discovery: discoverCSUI', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'csui-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('returns empty when src/contents does not exist', () => {
    expect(discoverCSUI(dir)).toEqual([]);
  });

  it('discovers .csui.tsx files at top level only', () => {
    mkdirSync(join(dir, 'contents'));
    writeFileSync(join(dir, 'contents/widget.csui.tsx'), `defineCSUI({ matches: ['*://*/*'] }, () => {});`);
    writeFileSync(join(dir, 'contents/notes.txt'), 'irrelevant');
    const items = discoverCSUI(dir);
    expect(items).toHaveLength(1);
    expect(items[0]?.entryKey).toBe('contents/widget');
    expect(items[0]?.outputJsPath).toBe('contents/widget.js');
    expect(items[0]?.matches).toEqual(['*://*/*']);
  });

  it('deduplicates and warns when two .csui files share the same entryKey', () => {
    mkdirSync(join(dir, 'contents'));
    writeFileSync(join(dir, 'contents/widget.csui.ts'),  `defineCSUI({ matches: ['*://*/*'] }, () => {});`);
    writeFileSync(join(dir, 'contents/widget.csui.tsx'), `defineCSUI({ matches: ['*://*/*'] }, () => {});`);
    const items = discoverCSUI(dir);
    // Only one descriptor should be returned for 'contents/widget'; the second
    // file is ignored. Otherwise the build emits two manifest entries pointing
    // at the same output JS, and Chrome runs the script twice.
    const widgets = items.filter(i => i.entryKey === 'contents/widget');
    expect(widgets).toHaveLength(1);
  });
});

// ─── Runtime: mountCSUI uses the DOM, so this block runs in jsdom ─────────────
describe('mountCSUI', () => {
  beforeEach(() => {
    // Ensure jsdom is available; if not, mark these tests as skipped.
    if (typeof document === 'undefined') return;
    document.body.innerHTML = '';
    document.documentElement.querySelectorAll('[data-extforge-csui]').forEach(n => n.remove());
    __resetCSUI();
  });

  it.runIf(typeof document !== 'undefined')('attaches a Shadow DOM and runs render', async () => {
    let rendered = false;
    const desc = defineCSUI({}, (root) => {
      rendered = true;
      root.appendChild(document.createElement('span')).textContent = 'hi';
    });
    const unmount = await mountCSUI(desc);
    const host = document.querySelector('[data-extforge-csui]') as HTMLElement | null;
    expect(host).not.toBeNull();
    expect(rendered).toBe(true);
    expect(host?.shadowRoot?.querySelector('span')?.textContent).toBe('hi');
    unmount();
    expect(document.querySelector('[data-extforge-csui]')).toBeNull();
  });

  it.runIf(typeof document !== 'undefined')('replaces a previous mount with the same id (idempotent)', async () => {
    await mountCSUI(defineCSUI({ id: 'one' }, (root) => {
      root.textContent = 'first';
    }));
    await mountCSUI(defineCSUI({ id: 'one' }, (root) => {
      root.textContent = 'second';
    }));
    const hosts = document.querySelectorAll('[data-extforge-csui="one"]');
    expect(hosts).toHaveLength(1);
    expect(hosts[0]?.shadowRoot?.textContent).toContain('second');
  });

  it.runIf(typeof document !== 'undefined')('honors getStyle by injecting a <style> in the shadow tree', async () => {
    await mountCSUI(defineCSUI({ getStyle: () => ':host { color: red; }' }, () => {}));
    const host = document.querySelector('[data-extforge-csui]') as HTMLElement;
    const style = host?.shadowRoot?.querySelector('style');
    expect(style?.textContent).toBe(':host { color: red; }');
  });

  it.runIf(typeof document !== 'undefined')('shouldMount returning false skips the mount entirely', async () => {
    const unmount = await mountCSUI(defineCSUI({ shouldMount: () => false }, () => {}));
    expect(document.querySelector('[data-extforge-csui]')).toBeNull();
    unmount();
  });

  it.runIf(typeof document !== 'undefined')('cleanup fn from render is called on unmount', async () => {
    let cleaned = false;
    const unmount = await mountCSUI(defineCSUI({ id: 'cleanup' }, () => () => { cleaned = true; }));
    unmount();
    expect(cleaned).toBe(true);
  });

  it.runIf(typeof document !== 'undefined')('remounts on history.pushState when remountOn: "navigation"', async () => {
    let mounts = 0;
    await mountCSUI(defineCSUI({
      id: 'spa', remountOn: 'navigation',
    }, () => { mounts++; }));
    expect(mounts).toBe(1);
    history.pushState({}, '', '/route-b');
    // Remount is scheduled via queueMicrotask + mountCSUI is async.
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(mounts).toBeGreaterThanOrEqual(2);
  });

  it.runIf(typeof document !== 'undefined')('mounts when the host page already attached a closed shadow root', async () => {
    // Simulate a host page that gave us a custom container whose page-side
    // shadow is closed (host.shadowRoot is null, attachShadow throws
    // NotSupportedError). We should fall back to using the user-provided
    // container as the render root rather than crashing.
    const customHost = document.createElement('div');
    customHost.attachShadow({ mode: 'closed' });
    document.body.appendChild(customHost);

    let rendered = false;
    await mountCSUI(defineCSUI({
      id: 'closed-shadow',
      getRootContainer: () => customHost,
    }, (root) => { rendered = true; root.textContent = 'hi'; }));

    expect(rendered).toBe(true);
  });
});
