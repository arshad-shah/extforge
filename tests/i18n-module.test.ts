import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { i18nModule } from '../src/core/i18n/module.js';
import type { ModuleContext } from '../src/core/modules/types.js';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'extforge-i18n-'));
}

function fakeModuleContext(
  root: string,
  i18n: { defaultLocale?: string; localesDir?: string } | undefined,
) {
  const emitted: Array<[string, string | Uint8Array]> = [];
  const typeDeclarations: string[] = [];
  const manifestPatches: unknown[] = [];
  const warnings: string[] = [];
  const ctx = {
    config: { i18n },
    paths: { root, src: join(root, 'src'), dist: join(root, 'dist') },
    logger: { debug() {}, info() {}, warn: (m: string) => warnings.push(m), error() {} },
    hooks: {
      onConfigResolved() {},
      onManifestTransform() {},
      onBuildStart() {},
      onBuildEntry() {},
      onBuildEnd() {},
      onCssTransform() {},
      onDevReload() {},
    },
    addEntry() {},
    emitFile: (rel: string, contents: string | Uint8Array) => emitted.push([rel, contents]),
    addEntrypoint() {},
    extendManifest: (patch: unknown) => manifestPatches.push(patch),
    addTypeDeclaration: (dts: string) => typeDeclarations.push(dts),
    addRuntimeImport() {},
  } as unknown as ModuleContext;
  return { ctx, emitted, typeDeclarations, manifestPatches, warnings };
}

describe('i18nModule', () => {
  it('emits messages.json for each locale and a typed MessageKeys augmentation', async () => {
    const root = tempDir();
    mkdirSync(join(root, 'locales'));
    writeFileSync(
      join(root, 'locales/en.yml'),
      'popup:\n  title: "My Extension"\n  greeting: "Hello, $1"\n',
    );
    writeFileSync(
      join(root, 'locales/fr.yml'),
      'popup:\n  title: "Mon Extension"\n  greeting: "Bonjour, $1"\n',
    );

    const mod = i18nModule();
    const { ctx, emitted, typeDeclarations, manifestPatches } = fakeModuleContext(root, {
      defaultLocale: 'en',
    });
    await mod.setup(ctx);

    const files = Object.fromEntries(emitted);
    expect(Object.keys(files).sort()).toEqual([
      '_locales/en/messages.json',
      '_locales/fr/messages.json',
    ]);
    expect(JSON.parse(files['_locales/en/messages.json'] as string)).toEqual({
      popup_title: { message: 'My Extension' },
      popup_greeting: { message: 'Hello, $1' },
    });

    expect(typeDeclarations).toHaveLength(1);
    expect(typeDeclarations[0]).toContain('"popup.greeting": { args: [string] };');
    expect(typeDeclarations[0]).toContain('"popup.title": { args: [] };');

    expect(manifestPatches).toEqual([{ default_locale: 'en' }]);
  });

  it('does nothing when i18n is not configured', async () => {
    const root = tempDir();
    const mod = i18nModule();
    const { ctx, emitted, typeDeclarations, manifestPatches } = fakeModuleContext(root, undefined);
    await mod.setup(ctx);
    expect(emitted).toEqual([]);
    expect(typeDeclarations).toEqual([]);
    expect(manifestPatches).toEqual([]);
  });

  it('warns and skips when the locales directory is empty', async () => {
    const root = tempDir();
    const mod = i18nModule();
    const { ctx, emitted, warnings } = fakeModuleContext(root, { defaultLocale: 'en' });
    await mod.setup(ctx);
    expect(emitted).toEqual([]);
    expect(warnings.some((w) => w.includes('no locale files found'))).toBe(true);
  });

  it('supports JSON locale sources and a custom localesDir', async () => {
    const root = tempDir();
    mkdirSync(join(root, 'i18n-src'));
    writeFileSync(join(root, 'i18n-src/en.json'), JSON.stringify({ title: 'Hi' }));

    const mod = i18nModule();
    const { ctx, emitted } = fakeModuleContext(root, {
      defaultLocale: 'en',
      localesDir: 'i18n-src',
    });
    await mod.setup(ctx);

    const files = Object.fromEntries(emitted);
    expect(JSON.parse(files['_locales/en/messages.json'] as string)).toEqual({
      title: { message: 'Hi' },
    });
  });

  it('warns when the default locale has no matching file, but still emits the others', async () => {
    const root = tempDir();
    mkdirSync(join(root, 'locales'));
    writeFileSync(join(root, 'locales/fr.yml'), 'title: "Bonjour"\n');

    const mod = i18nModule();
    const { ctx, emitted, typeDeclarations, warnings } = fakeModuleContext(root, {
      defaultLocale: 'en',
    });
    await mod.setup(ctx);

    expect(Object.fromEntries(emitted)).toHaveProperty('_locales/fr/messages.json');
    expect(typeDeclarations).toEqual([]);
    expect(warnings.some((w) => w.includes('default locale "en" has no matching file'))).toBe(true);
  });
});
