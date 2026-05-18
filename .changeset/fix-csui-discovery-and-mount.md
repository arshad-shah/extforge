---
"extforge": patch
---

csui: fix nested `matches:` extraction, closed-shadow crash, and duplicate manifest entries

- `extractMatches` previously picked the *first* `matches:` key after
  `defineCSUI(`, so a config like
  `defineCSUI({ routerMap: { matches: ['/inner'] }, matches: ['*://*/*'] }, ...)`
  silently wrote the wrong match list into the manifest. It now walks the
  options literal balancing braces and reads only the OUTER `matches:` key.
- `discoverCSUI` previously emitted two descriptors when both `foo.csui.ts`
  and `foo.csui.tsx` existed (same `entryKey: 'contents/foo'`), making
  Chrome run the content script twice. Discovery now dedupes by entryKey
  with a stable lexicographic resolution.
- `mountCSUI` used to crash with `NotSupportedError` when the host page
  already attached a *closed* shadow root to the user-provided
  `getRootContainer` element. The runtime now falls back to rendering
  directly into the host element instead of throwing.
- `augmentManifestWithCSUI` no longer appends a duplicate
  `content_scripts` entry for a CSUI file the user already declared in
  `extforge.config.ts`. Existing entries' `js` paths are indexed and
  skipped on the auto-augmentation pass.
