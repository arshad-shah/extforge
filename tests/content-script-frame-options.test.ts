import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extForgeConfigSchema } from '../src/core/config/schema.js';
import {
  discoverCSUI,
  extractAllFrames,
  extractExcludeMatches,
  extractMatchAboutBlank,
  extractWorld,
  isOptionDeclared,
} from '../src/core/csui/discovery.js';
import { generateManifest, validateManifestConfig } from '../src/core/manifest/generator.js';
import type { ManifestConfig } from '../src/core/manifest/types.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** A config that uses NONE of the frame options — the regression baseline. */
const plainConfig: ManifestConfig = {
  name: 'Frame Options Fixture',
  version: '1.0.0',
  description: 'Baseline manifest for the frame-options regression test',
  manifestVersion: 3,
  permissions: { required: ['storage'], optional: [], host: ['https://example.com/*'] },
  background: { entrypoint: 'background/index.js' },
  contentScripts: [
    { matches: ['https://example.com/*'], js: ['content/index.js'], css: ['content/style.css'] },
    { matches: ['<all_urls>'], js: ['content/other.js'], runAt: 'document_start' },
  ],
  icons: { '16': 'icons/icon-16.png' },
};

/** Serialized exactly as `writeManifest` does. */
const emit = (config: ManifestConfig, browser: 'chrome' | 'firefox' | 'edge' | 'safari') =>
  JSON.stringify(generateManifest(config, browser), null, 2);

const firstScript = (config: ManifestConfig, browser: 'chrome' | 'firefox' = 'chrome') =>
  (generateManifest(config, browser).content_scripts as Array<Record<string, unknown>>)[0]!;

// Captured from the generator BEFORE the frame options existed. If a future
// change makes an unset option materialize in the output, this fails.
const BASELINE_CHROME = `{
  "manifest_version": 3,
  "name": "Frame Options Fixture",
  "version": "1.0.0",
  "description": "Baseline manifest for the frame-options regression test",
  "icons": {
    "16": "icons/icon-16.png"
  },
  "background": {
    "service_worker": "background/index.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": [
        "https://example.com/*"
      ],
      "js": [
        "content/index.js"
      ],
      "css": [
        "content/style.css"
      ],
      "run_at": "document_idle"
    },
    {
      "matches": [
        "<all_urls>"
      ],
      "js": [
        "content/other.js"
      ],
      "run_at": "document_start"
    }
  ],
  "permissions": [
    "storage"
  ],
  "host_permissions": [
    "https://example.com/*"
  ]
}`;

const BASELINE_FIREFOX = `{
  "manifest_version": 3,
  "name": "Frame Options Fixture",
  "version": "1.0.0",
  "description": "Baseline manifest for the frame-options regression test",
  "icons": {
    "16": "icons/icon-16.png"
  },
  "background": {
    "scripts": [
      "background/index.js"
    ],
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": [
        "https://example.com/*"
      ],
      "js": [
        "content/index.js"
      ],
      "css": [
        "content/style.css"
      ],
      "run_at": "document_idle"
    },
    {
      "matches": [
        "<all_urls>"
      ],
      "js": [
        "content/other.js"
      ],
      "run_at": "document_start"
    }
  ],
  "permissions": [
    "storage"
  ],
  "host_permissions": [
    "https://example.com/*"
  ],
  "browser_specific_settings": {
    "gecko": {
      "id": "frame-options-fixture@extension",
      "strict_min_version": "109.0"
    }
  }
}`;

// ─── Manifest generation ─────────────────────────────────────────────────────

describe('content_scripts frame options: manifest generation', () => {
  it('omits every new key when the config does not use it', () => {
    const cs = firstScript(plainConfig);
    expect(Object.keys(cs)).toEqual(['matches', 'js', 'css', 'run_at']);
    expect(cs).not.toHaveProperty('all_frames');
    expect(cs).not.toHaveProperty('match_about_blank');
    expect(cs).not.toHaveProperty('exclude_matches');
    expect(cs).not.toHaveProperty('world');
  });

  it('produces byte-identical output for a config that uses none of them', () => {
    expect(emit(plainConfig, 'chrome')).toBe(BASELINE_CHROME);
    expect(emit(plainConfig, 'firefox')).toBe(BASELINE_FIREFOX);
  });

  it('emits all_frames when allFrames is set', () => {
    const cfg = {
      ...plainConfig,
      contentScripts: [{ matches: ['<all_urls>'], js: ['c.js'], allFrames: true }],
    } satisfies ManifestConfig;
    expect(firstScript(cfg).all_frames).toBe(true);
  });

  it('emits all_frames: false explicitly when the user opts out explicitly', () => {
    // `false` is the browser default, but an explicit `false` in the config is
    // an explicit statement — round-tripping it keeps the manifest honest.
    const cfg = {
      ...plainConfig,
      contentScripts: [{ matches: ['<all_urls>'], js: ['c.js'], allFrames: false }],
    } satisfies ManifestConfig;
    expect(firstScript(cfg).all_frames).toBe(false);
  });

  it('emits match_about_blank when matchAboutBlank is set', () => {
    const cfg = {
      ...plainConfig,
      contentScripts: [{ matches: ['<all_urls>'], js: ['c.js'], matchAboutBlank: true }],
    } satisfies ManifestConfig;
    expect(firstScript(cfg).match_about_blank).toBe(true);
  });

  it('emits exclude_matches when excludeMatches is set', () => {
    const cfg = {
      ...plainConfig,
      contentScripts: [
        {
          matches: ['https://example.com/*'],
          excludeMatches: ['https://example.com/admin/*'],
          js: ['c.js'],
        },
      ],
    } satisfies ManifestConfig;
    expect(firstScript(cfg).exclude_matches).toEqual(['https://example.com/admin/*']);
  });

  it('emits world when world is set', () => {
    const cfg = {
      ...plainConfig,
      contentScripts: [{ matches: ['<all_urls>'], js: ['c.js'], world: 'MAIN' as const }],
    } satisfies ManifestConfig;
    expect(firstScript(cfg).world).toBe('MAIN');
  });

  it('keeps run_at defaulting to document_idle alongside the new keys', () => {
    const cfg = {
      ...plainConfig,
      contentScripts: [{ matches: ['<all_urls>'], js: ['c.js'], allFrames: true }],
    } satisfies ManifestConfig;
    expect(firstScript(cfg).run_at).toBe('document_idle');
  });
});

// ─── Firefox `world` divergence ──────────────────────────────────────────────

describe('content_scripts world: Firefox version floor', () => {
  const worldCfg = {
    ...plainConfig,
    contentScripts: [{ matches: ['<all_urls>'], js: ['c.js'], world: 'MAIN' as const }],
  } satisfies ManifestConfig;

  it('raises strict_min_version to 128.0 for a Firefox build that declares world', () => {
    const gecko = (
      generateManifest(worldCfg, 'firefox').browser_specific_settings as {
        gecko: Record<string, unknown>;
      }
    ).gecko;
    expect(gecko.strict_min_version).toBe('128.0');
  });

  it('leaves strict_min_version at 109.0 when world is not used', () => {
    const gecko = (
      generateManifest(plainConfig, 'firefox').browser_specific_settings as {
        gecko: Record<string, unknown>;
      }
    ).gecko;
    expect(gecko.strict_min_version).toBe('109.0');
  });

  it('still emits world for Firefox rather than silently dropping it', () => {
    expect(firstScript(worldCfg, 'firefox').world).toBe('MAIN');
  });

  it('warns that world constrains the supported browser range', () => {
    const r = validateManifestConfig(worldCfg);
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => w.includes('world'))).toBe(true);
  });

  it('rejects a world value that is not MAIN or ISOLATED', () => {
    const cfg = {
      ...plainConfig,
      contentScripts: [
        { matches: ['<all_urls>'], js: ['c.js'], world: 'main' as unknown as 'MAIN' },
      ],
    } satisfies ManifestConfig;
    const r = validateManifestConfig(cfg);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('world'))).toBe(true);
  });

  it('rejects world under manifest V2', () => {
    const cfg = {
      ...plainConfig,
      manifestVersion: 2 as const,
      contentScripts: [{ matches: ['<all_urls>'], js: ['c.js'], world: 'MAIN' as const }],
    } satisfies ManifestConfig;
    expect(validateManifestConfig(cfg).errors.some((e) => e.includes('manifest V3'))).toBe(true);
  });
});

// ─── CSUI static extraction ──────────────────────────────────────────────────

describe('CSUI static extraction: frame options', () => {
  it('extracts allFrames and matchAboutBlank booleans', () => {
    const src = `defineCSUI({ matches: ['<all_urls>'], allFrames: true, matchAboutBlank: false }, () => {});`;
    expect(extractAllFrames(src)).toBe(true);
    expect(extractMatchAboutBlank(src)).toBe(false);
  });

  it('extracts world', () => {
    expect(extractWorld(`defineCSUI({ world: 'MAIN' }, () => {})`)).toBe('MAIN');
    expect(extractWorld(`defineCSUI({ world: 'ISOLATED' }, () => {})`)).toBe('ISOLATED');
  });

  it('returns undefined for a world value outside the enum', () => {
    expect(extractWorld(`defineCSUI({ world: 'main' }, () => {})`)).toBeUndefined();
  });

  it('extracts an excludeMatches array literal', () => {
    const src = `
      defineCSUI({
        matches: ['https://example.com/*'],
        excludeMatches: [ 'https://example.com/admin/*', "https://example.com/login", ],
      }, () => {});
    `;
    expect(extractExcludeMatches(src)).toEqual([
      'https://example.com/admin/*',
      'https://example.com/login',
    ]);
  });

  it('does not confuse `matches` with `excludeMatches`', () => {
    const src = `defineCSUI({ excludeMatches: ['https://a.test/*'] }, () => {});`;
    expect(extractExcludeMatches(src)).toEqual(['https://a.test/*']);
  });

  // ── depth-1 defence ────────────────────────────────────────────────────────

  it('ignores options declared OUTSIDE the defineCSUI call (helper-module consts)', () => {
    const src = `
      const allFrames = true;
      const world = 'MAIN';
      const excludeMatches = ['https://leaked.test/*'];
      const helper = { allFrames: true, world: 'MAIN', excludeMatches: ['https://leaked.test/*'] };
      export default defineCSUI({ matches: ['<all_urls>'] }, () => {});
    `;
    expect(extractAllFrames(src)).toBeUndefined();
    expect(extractWorld(src)).toBeUndefined();
    expect(extractExcludeMatches(src)).toBeUndefined();
  });

  it('reads the OUTER option when a nested object literal repeats the key', () => {
    const src = `
      defineCSUI({
        router: { allFrames: false, world: 'ISOLATED', excludeMatches: ['/inner'] },
        allFrames: true,
        world: 'MAIN',
        excludeMatches: ['https://outer.test/*'],
      }, () => {});
    `;
    expect(extractAllFrames(src)).toBe(true);
    expect(extractWorld(src)).toBe('MAIN');
    expect(extractExcludeMatches(src)).toEqual(['https://outer.test/*']);
  });

  it('ignores keys inside comments and strings', () => {
    const src = `
      // allFrames: true
      const doc = 'world: "MAIN"';
      defineCSUI({ matches: ['<all_urls>'] }, () => {});
    `;
    expect(extractAllFrames(src)).toBeUndefined();
    expect(extractWorld(src)).toBeUndefined();
  });

  // ── declared-but-unreadable is loud, never silent ──────────────────────────

  it('reports a non-literal option as declared even though it cannot be read', () => {
    const src = `
      const patterns = buildPatterns();
      export default defineCSUI({
        matches: ['<all_urls>'],
        excludeMatches: patterns,
        allFrames: shouldUseFrames,
      }, () => {});
    `;
    expect(extractExcludeMatches(src)).toBeUndefined();
    expect(extractAllFrames(src)).toBeUndefined();
    // …but the builder can still tell the user, because the keys ARE declared.
    expect(isOptionDeclared(src, 'excludeMatches')).toBe(true);
    expect(isOptionDeclared(src, 'allFrames')).toBe(true);
    expect(isOptionDeclared(src, 'world')).toBe(false);
  });

  it('does not treat identifiers that merely start with true/false as booleans', () => {
    const src = `defineCSUI({ allFrames: trueish }, () => {});`;
    expect(extractAllFrames(src)).toBeUndefined();
    expect(isOptionDeclared(src, 'allFrames')).toBe(true);
  });
});

// ─── Config schema ───────────────────────────────────────────────────────────

describe('config schema: content-script frame options', () => {
  const cs = (entry: Record<string, unknown>) => ({ manifest: { contentScripts: [entry] } });

  it('accepts every new option with a valid value', () => {
    const r = extForgeConfigSchema.safeParse(
      cs({
        matches: ['<all_urls>'],
        js: ['content/index.js'],
        excludeMatches: ['https://example.com/admin/*'],
        allFrames: true,
        matchAboutBlank: false,
        world: 'MAIN',
        runAt: 'document_idle',
      }),
    );
    expect(r.success).toBe(true);
  });

  it('accepts a content script that uses none of them', () => {
    expect(extForgeConfigSchema.safeParse(cs({ matches: ['<all_urls>'] })).success).toBe(true);
  });

  it('rejects a lower-case world', () => {
    const r = extForgeConfigSchema.safeParse(cs({ matches: ['<all_urls>'], world: 'main' }));
    expect(r.success).toBe(false);
    if (!r.success)
      expect(
        r.error.issues.some((i) => i.path.join('.') === 'manifest.contentScripts.0.world'),
      ).toBe(true);
  });

  it('rejects a non-boolean allFrames', () => {
    expect(
      extForgeConfigSchema.safeParse(cs({ matches: ['<all_urls>'], allFrames: 'yes' })).success,
    ).toBe(false);
  });

  it('rejects a non-array excludeMatches', () => {
    expect(
      extForgeConfigSchema.safeParse(cs({ matches: ['<all_urls>'], excludeMatches: 'nope' }))
        .success,
    ).toBe(false);
  });

  it('still passes unknown manifest keys through untouched', () => {
    const r = extForgeConfigSchema.safeParse({
      manifest: { name: 'X', someFutureKey: { nested: true } },
    });
    expect(r.success).toBe(true);
  });
});

// ─── Discovery wiring ────────────────────────────────────────────────────────

describe('discoverCSUI: frame options', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'csui-frame-'));
    mkdirSync(join(dir, 'contents'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const write = (source: string) => {
    writeFileSync(join(dir, 'contents/widget.csui.tsx'), source);
    return discoverCSUI(dir)[0]!;
  };

  it('carries every statically-readable option onto the discovery record', () => {
    const d = write(`
      defineCSUI({
        matches: ['https://example.com/*'],
        excludeMatches: ['https://example.com/admin/*'],
        runAt: 'document_start',
        allFrames: true,
        matchAboutBlank: true,
        world: 'MAIN',
      }, () => {});
    `);
    expect(d.matches).toEqual(['https://example.com/*']);
    expect(d.excludeMatches).toEqual(['https://example.com/admin/*']);
    expect(d.runAt).toBe('document_start');
    expect(d.allFrames).toBe(true);
    expect(d.matchAboutBlank).toBe(true);
    expect(d.world).toBe('MAIN');
    expect(d.unresolvedOptions).toBeUndefined();
  });

  it('leaves options undefined — and reports nothing unresolved — when unused', () => {
    const d = write(`defineCSUI({ matches: ['<all_urls>'] }, () => {});`);
    expect(d.allFrames).toBeUndefined();
    expect(d.world).toBeUndefined();
    expect(d.excludeMatches).toBeUndefined();
    expect(d.unresolvedOptions).toBeUndefined();
  });

  it('flags a declared-but-unreadable option instead of dropping it silently', () => {
    const d = write(`
      defineCSUI({
        matches: ['<all_urls>'],
        excludeMatches: PATTERNS,
        world: pickWorld(),
      }, () => {});
    `);
    expect(d.unresolvedOptions).toEqual(['excludeMatches', 'world']);
  });
});
