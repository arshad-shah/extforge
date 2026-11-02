---
"extforge": minor
---

Add `extforge/i18n`: typed `chrome.i18n` with generated `_locales`.

Setting `i18n: { defaultLocale: 'en' }` in `extforge.config.ts` compiles `locales/<lang>.yml` (or `.yaml` / `.json`) into `_locales/<lang>/messages.json` for every browser build, wires `default_locale` into the generated manifest, and generates typed message keys for `extforge/i18n`'s `t()` in `.extforge/modules.d.ts` (include it in your tsconfig):

```ts
// locales/en.yml
popup:
  title: "My Extension"
  greeting: "Hello, $1"

// src/entrypoints/popup/index.tsx
import { t } from 'extforge/i18n'
t('popup.title')             // typed, autocompleted
t('popup.greeting', ['Sam']) // arity-checked
```

An unknown key, or a substitutions array of the wrong length, is a TypeScript error.

Locale files may use BCP 47 names (`en-US.yml` becomes `_locales/en_US`). The build fails, rather than shipping a partial `_locales`, when a locale file can't be parsed, when two files map to the same locale, or when two keys collide in `messages.json` (`popup.title` and `popup_title`, or keys that differ only in case).

`extforge doctor` gained an `i18n-locales` check that flags locales missing keys present in the default locale.
