import { resolve } from 'node:path';
import { loadExtForgeConfig } from '../../config.js';
import { loadLocales } from '../../i18n/loader.js';
import type { Check } from '../index.js';

export const i18nLocalesCheck: Check = {
  name: 'i18n-locales',
  async run({ cwd }) {
    let config: Awaited<ReturnType<typeof loadExtForgeConfig>>;
    try {
      config = await loadExtForgeConfig(cwd);
    } catch {
      return { name: 'i18n-locales', status: 'info', message: 'Skipped (config invalid)' };
    }

    const options = config.i18n;
    if (!options) {
      return { name: 'i18n-locales', status: 'info', message: 'i18n not configured' };
    }

    const localesDirName = options.localesDir ?? 'locales';
    const defaultLocale = options.defaultLocale ?? 'en';
    const localesDir = resolve(cwd, localesDirName);

    let locales: ReturnType<typeof loadLocales>;
    try {
      locales = loadLocales(localesDir);
    } catch (err) {
      return {
        name: 'i18n-locales',
        status: 'fail',
        message: `Failed to parse locale source: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    if (locales.size === 0) {
      return {
        name: 'i18n-locales',
        status: 'warn',
        message: `No locale files found in "${localesDirName}"`,
        hint: `Add ${defaultLocale}.yml to ${localesDirName}/`,
      };
    }

    const base = locales.get(defaultLocale);
    if (!base) {
      return {
        name: 'i18n-locales',
        status: 'fail',
        message: `Default locale "${defaultLocale}" has no matching file in "${localesDirName}"`,
      };
    }

    const baseKeys = new Set(base.map((m) => m.key));
    const problems: string[] = [];
    for (const [locale, messages] of locales) {
      if (locale === defaultLocale) continue;
      const keys = new Set(messages.map((m) => m.key));
      const missing = [...baseKeys].filter((k) => !keys.has(k));
      if (missing.length > 0) problems.push(`${locale} missing ${missing.join(', ')}`);
    }

    if (problems.length > 0) {
      return {
        name: 'i18n-locales',
        status: 'warn',
        message: problems.join('; '),
        hint: 'Add the missing keys to bring every locale in sync with the default locale.',
      };
    }

    return {
      name: 'i18n-locales',
      status: 'pass',
      message: `${locales.size} locale(s) in sync with "${defaultLocale}"`,
    };
  },
};
