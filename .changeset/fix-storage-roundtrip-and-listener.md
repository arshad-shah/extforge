---
"extforge": patch
---

storage: round-trip strings correctly in the localStorage fallback; share the chrome onChanged listener

- `Storage.set` in the localStorage fallback used to store strings raw
  and `JSON.parse` on read. A string that happened to look like JSON
  (e.g. `set('k', '{"a":1}')`) came back as the parsed object `{a:1}`,
  breaking the type guarantee. `set` now `JSON.stringify`s every value
  so the round-trip is symmetric. Existing legacy data that doesn't
  parse as JSON still reads back as the raw string.
- `Storage.watch` previously registered a fresh `chrome.storage.onChanged`
  listener on every call. N `useStorage` hooks bound to the same
  `Storage` instance attached N listeners; every broadcast paid the
  fan-out cost. The class now multiplexes all watch subscribers onto a
  single shared listener — attached on the first `watch()`, removed when
  the last subscriber unwatches.
