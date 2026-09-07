import { resolve } from 'node:path';
import type { ExtForgeModule, ModuleContext } from '../modules/types.js';
import { generateDts } from './codegen.js';
import { loadLocales } from './loader.js';
import { buildMessagesJson } from './messages.js';
import type { ParsedMessage } from './types.js';

/**
 * Built-in module wired in by `loadExtForgeConfig` whenever `config.i18n` is
 * set. Compiles `locales/<lang>.{yml,yaml,json}` into `_locales/<lang>/messages.json`
 * for every browser build, contributes typed `MessageKeys` for `extforge/i18n`'s
 * `t()`, and sets the manifest's `default_locale`.
 */
export function i18nModule(): ExtForgeModule {
  return {
    name: 'extforge:i18n',
    setup(ctx: ModuleContext) {
      const options = ctx.config.i18n;
      if (!options) return;

      const localesDirName = options.localesDir ?? 'locales';
      const defaultLocale = options.defaultLocale ?? 'en';
      const localesDir = resolve(ctx.paths.root, localesDirName);

      let locales: Map<string, ParsedMessage[]>;
      try {
        locales = loadLocales(localesDir);
      } catch (err) {
        ctx.logger.warn(
          `i18n: failed to read locales from "${localesDirName}": ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        return;
      }

      if (locales.size === 0) {
        ctx.logger.warn(`i18n: no locale files found in "${localesDirName}"`);
        return;
      }

      const defaultMessages = locales.get(defaultLocale);
      if (!defaultMessages) {
        ctx.logger.warn(
          `i18n: default locale "${defaultLocale}" has no matching file in "${localesDirName}"`,
        );
      }

      for (const [locale, messages] of locales) {
        ctx.emitFile(
          `_locales/${locale}/messages.json`,
          `${JSON.stringify(buildMessagesJson(messages), null, 2)}\n`,
        );
      }

      if (defaultMessages) {
        ctx.addTypeDeclaration(generateDts(defaultMessages));
      }

      ctx.extendManifest({ default_locale: defaultLocale });
    },
  };
}
