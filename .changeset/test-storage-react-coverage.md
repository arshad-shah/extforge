---
"extforge": patch
---

storage/react: add unit tests for the `useStorage` hook

`extforge/storage/react` is a public subpath export but had zero test
coverage. Six tests now cover: initial loading state, default-value
fallback, `setValue` round-trip, external `chrome.storage.onChanged`
propagation into React state, `remove`, and unmount/unsubscribe safety.
