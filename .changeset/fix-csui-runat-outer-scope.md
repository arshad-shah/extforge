---
"extforge": patch
---

csui: `extractRunAt` reads the outer `defineCSUI` options object only

`runAt` extraction used to grep the file for the first `runAt: '...'`
literal anywhere. A helper constant (`const runAt = 'document_end'`) or
a nested object with its own `runAt:` won over the real `defineCSUI`
options entry. Like `extractMatches`, it now walks the options literal
balancing braces and only matches the key at brace depth 1, reading the
quoted string value from the original source.
