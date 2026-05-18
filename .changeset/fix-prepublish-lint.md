---
"extforge": patch
---

build: include `lint` in `prepublishOnly`

`prepublishOnly` previously ran `typecheck && build && test` but not
`lint`, so a maintainer publishing locally could ship code with lint
regressions / banned `console.*` calls. The script now runs `lint`
first.
