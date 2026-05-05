// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
});

describe('discovery: extractRunAt', () => {
  it('extracts a string runAt', () => {
    expect(extractRunAt(`defineCSUI({ runAt: 'document_start' }, () => {})`)).toBe('document_start');
  });
  it('returns undefined for invalid values', () => {
    expect(extractRunAt(`defineCSUI({ runAt: 'whenever' }, () => {})`)).toBeUndefined();
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
});
