/**
 * Unit tests for Task 4: targeted content-script reloads
 *
 * Tests the `extractScriptIds` helper and `buildContentScriptMap` together to
 * verify that:
 *   - Content-script file changes produce a sorted `scriptIds` array.
 *   - Non-content-script JS changes produce `undefined` (no scriptIds).
 *   - Multiple content scripts each get the right index.
 *   - An empty map always produces `undefined`.
 *
 * We use unit tests rather than a full HMR server integration test because
 * `createHMRServer.start()` performs a real esbuild build pass which requires
 * a fully-formed project on disk (icons, manifest, etc.) and is unnecessarily
 * heavy for validating this pure logic.
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path/posix';
import { buildContentScriptMap } from '../src/core/builder/index.js';
import { extractScriptIds } from '../src/core/hmr/index.js';
import type { ExtForgeConfig } from '../src/core/config.js';

const ROOT = '/fake/project';

function makeConfig(contentScripts: Array<{ matches: string[]; js: string[] }>): ExtForgeConfig {
  return {
    browsers: ['chrome'],
    manifest: {
      name: 'test-ext',
      version: '0.0.1',
      contentScripts,
    },
  } as unknown as ExtForgeConfig;
}

describe('targeted content-script reload', () => {
  describe('buildContentScriptMap', () => {
    it('maps each js entry to its scriptId (index)', () => {
      const config = makeConfig([
        { matches: ['<all_urls>'], js: ['src/content.ts'] },
        { matches: ['https://example.com/*'], js: ['src/other.ts'] },
      ]);
      const map = buildContentScriptMap(ROOT, config);
      expect(map.get(resolve(ROOT, 'src/content.ts'))).toBe(0);
      expect(map.get(resolve(ROOT, 'src/other.ts'))).toBe(1);
    });

    it('maps multiple js files in one entry to the same scriptId', () => {
      const config = makeConfig([
        { matches: ['<all_urls>'], js: ['src/a.ts', 'src/b.ts'] },
      ]);
      const map = buildContentScriptMap(ROOT, config);
      expect(map.get(resolve(ROOT, 'src/a.ts'))).toBe(0);
      expect(map.get(resolve(ROOT, 'src/b.ts'))).toBe(0);
    });

    it('returns an empty map when no contentScripts are defined', () => {
      const config = makeConfig([]);
      const map = buildContentScriptMap(ROOT, config);
      expect(map.size).toBe(0);
    });
  });

  describe('extractScriptIds', () => {
    it('returns sorted scriptIds when content-script files change', () => {
      const config = makeConfig([
        { matches: ['<all_urls>'], js: ['src/content.ts'] },
        { matches: ['https://example.com/*'], js: ['src/other.ts'] },
      ]);
      const map = buildContentScriptMap(ROOT, config);

      const changed = [resolve(ROOT, 'src/content.ts')];
      const result = extractScriptIds(changed, map);
      expect(result).toEqual([0]);
    });

    it('returns undefined when changed file is not a content script', () => {
      const config = makeConfig([
        { matches: ['<all_urls>'], js: ['src/content.ts'] },
      ]);
      const map = buildContentScriptMap(ROOT, config);

      const changed = [resolve(ROOT, 'src/util.ts')];
      const result = extractScriptIds(changed, map);
      expect(result).toBeUndefined();
    });

    it('returns multiple sorted ids when files from different entries change', () => {
      const config = makeConfig([
        { matches: ['<all_urls>'], js: ['src/content.ts'] },
        { matches: ['https://example.com/*'], js: ['src/other.ts'] },
        { matches: ['https://foo.com/*'], js: ['src/third.ts'] },
      ]);
      const map = buildContentScriptMap(ROOT, config);

      // Change files from entry 2 and entry 0 (out of order)
      const changed = [
        resolve(ROOT, 'src/third.ts'),
        resolve(ROOT, 'src/content.ts'),
      ];
      const result = extractScriptIds(changed, map);
      expect(result).toEqual([0, 2]);
    });

    it('deduplicates when multiple files from the same entry change', () => {
      const config = makeConfig([
        { matches: ['<all_urls>'], js: ['src/a.ts', 'src/b.ts'] },
      ]);
      const map = buildContentScriptMap(ROOT, config);

      const changed = [
        resolve(ROOT, 'src/a.ts'),
        resolve(ROOT, 'src/b.ts'),
      ];
      const result = extractScriptIds(changed, map);
      expect(result).toEqual([0]);
    });

    it('returns undefined when map is empty', () => {
      const map = new Map<string, number>();
      const result = extractScriptIds([resolve(ROOT, 'src/content.ts')], map);
      expect(result).toBeUndefined();
    });

    it('returns undefined for an empty changed-files list', () => {
      const config = makeConfig([
        { matches: ['<all_urls>'], js: ['src/content.ts'] },
      ]);
      const map = buildContentScriptMap(ROOT, config);
      const result = extractScriptIds([], map);
      expect(result).toBeUndefined();
    });
  });
});
