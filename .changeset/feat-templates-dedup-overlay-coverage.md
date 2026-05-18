---
"extforge": minor
---

feat: dev error overlay, externalised runtime templates, dedup'd helpers, 90% coverage

**Dev error overlay** — when a rebuild fails in `extforge dev`, every
connected client now shows a full-page overlay (Shadow-DOM-isolated)
with the error code, message, file:line:col, a multi-line source frame
with a caret marker, a "Hint" line when the error carries one, a docs
link, and the stack trace. The overlay clears automatically on the
next successful rebuild. Mirrors the Vite / Astro dev UX. New
`'build-error'` / `'build-ok'` envelopes added to the HMR protocol.

**Templates for runtime scripts** — the SWC React-refresh runtime
header/footer, the content-script HMR bootstrap, the content-script
HMR runtime, and the new error overlay all moved out of inline
template-literals in `src/core/hmr/*.ts` and into `.tpl` files under
`src/core/hmr/templates/`. A shared `core/util/template-loader.ts`
factory powers both `core/scaffold/template-loader` and the new
`core/hmr/template-loader`. tsup copies both template trees to `dist/`.

**Eliminated duplicated helpers** — the length-preserving
`stripStringsAndComments` source-stripper (previously duplicated in
`core/compat/index.ts` and `core/csui/discovery.ts`, with the csui
version missing regex-literal support) now lives in
`core/util/strip-source.ts`. The recursive source walker (previously
duplicated in `core/builder/index.ts` and `core/doctor/checks/compat.ts`)
now lives in `core/util/walk-sources.ts`.

**Build-error envelope unwraps esbuild aggregates** — when
`buildCtx.rebuild()` throws an esbuild-style `{ errors: [...] }`
object during dev mode, the overlay now extracts the first entry's
text + file/line/column so users see the real syntax-error location.
Plain Error / ExtForgeError / non-Error values all still serialise
cleanly.

**Coverage gates raised** — `vitest.config.ts` thresholds set to
88% lines/functions/statements and 78% branches (baseline this branch
ships at 90% lines, 91% functions). 70 new tests were added across
errors, ports, logger banner/summary/raw, HMR server lifecycle
(start/stop + rebuild broadcasts), builder integration, scaffold
edge cases, refresh-plugin, storage watch/quota, manifest commands,
and the testing barrel.
