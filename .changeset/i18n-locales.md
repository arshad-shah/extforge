---
"extforge": minor
---

Add `extforge/i18n`: typed `chrome.i18n` with generated `_locales`.

Setting `i18n: { defaultLocale: 'en' }` in `extforge.config.ts` compiles `locales/<lang>.yml` (or `.yaml` / `.json`) into `_locales/<lang>/messages.json` for every browser build, wires `default_locale` into the generated manifest, and generates a `MessageKeys` augmentation for `extforge/i18n`'s `t()`:

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

An unknown key, or a substitutions array of the wrong length, is a TypeScript error — the same `declare module` augmentation pattern as `extforge/messaging`'s `MessageMap`.

`extforge doctor` gained an `i18n-locales` check that flags locales missing keys present in the default locale.
