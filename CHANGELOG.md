# Changelog

## 0.5.0

### Minor Changes

- [#43](https://github.com/arshad-shah/extforge/pull/43) [`ff96b10`](https://github.com/arshad-shah/extforge/commit/ff96b10bac75830a2a1c00ac4082af4e5e5b5cc1) Thanks [@arshad-shah](https://github.com/arshad-shah)! - cli: migrate the CLI onto `@arshad-shah/clif`

  The hand-rolled argument parser (`src/cli/parser.ts`) has been replaced with
  [`@arshad-shah/clif`](https://www.npmjs.com/package/@arshad-shah/clif), a
  tiny zero-dependency CLI framework. Every command — `init`, `dev`, `build`,
  `validate`, `doctor`, `upgrade`, `package`, `icons` — keeps the same flags and
  defaults; the command tree now lives in `src/cli/commands.ts`.

  User-visible changes are cosmetic: `--help` output is rendered by clif, and an
  unknown subcommand now produces a "did you mean…?" suggestion instead of
  falling through to the top-level help. Error formatting, exit codes, and the
  `extforge.config` contract are unchanged — thrown errors are still routed
  through ExtForge's formatter (code, hint, docs link, exit 1).

- [#43](https://github.com/arshad-shah/extforge/pull/43) [`ff96b10`](https://github.com/arshad-shah/extforge/commit/ff96b10bac75830a2a1c00ac4082af4e5e5b5cc1) Thanks [@arshad-shah](https://github.com/arshad-shah)! - config: load `extforge.config` via `@arshad-shah/config-kit`

  `loadExtForgeConfig` now uses [`@arshad-shah/config-kit`](https://www.npmjs.com/package/@arshad-shah/config-kit)
  v2 for config-file discovery, deep-merge (defaults < file < overrides), and
  strict/warn validation. ExtForge supplies the schema, the strict-by-default
  policy (`EXTFORGE_STRICT_CONFIG=0` still downgrades to a warning), and a
  TypeScript-aware module loader (esbuild) as config-kit's `configFileSource`
  `load` callback.

  No change to the public surface: `loadExtForgeConfig`, `defineConfig`,
  `DEFAULT_CONFIG`, the supported `extforge.config.{ts,mts,cts,mjs,js,cjs,json}`
  file set, deep-merge semantics, and the `EXT_CONFIG_INVALID` error are all
  unchanged. The internal `loadConfigFile`/`mergeConfig` helpers (never exported)
  were removed in favour of config-kit's pipeline.

- [#43](https://github.com/arshad-shah/extforge/pull/43) [`ff96b10`](https://github.com/arshad-shah/extforge/commit/ff96b10bac75830a2a1c00ac4082af4e5e5b5cc1) Thanks [@arshad-shah](https://github.com/arshad-shah)! - logger: reimplement `extforge/logger` on top of `@arshad-shah/log-kit`

  The logger now uses [`@arshad-shah/log-kit`](https://www.npmjs.com/package/@arshad-shah/log-kit)
  v1.1 as its record-dispatch engine, leaning on its native fields — hierarchical
  `scope`, the `kind` presentation tag (for `success`), `args`, `meta` (host
  passthrough), and `timestamp: 'epoch'` — plus runtime `addTransport`/
  `removeTransport`. This gains per-transport failure isolation (a throwing
  transport no longer breaks the others) and an `onTransportError` diagnostic
  channel. The public surface is unchanged: `LogLevel`, `LogEntry`,
  `createLogger`, the `Logger` methods (including `success`/`banner`/`summary`/
  `step`/`child(scope)`), `jsonTransport`'s output shape, and the terminal
  formatting are all identical. log-kit is now a runtime dependency (zero-dep).

- [#43](https://github.com/arshad-shah/extforge/pull/43) [`ff96b10`](https://github.com/arshad-shah/extforge/commit/ff96b10bac75830a2a1c00ac4082af4e5e5b5cc1) Thanks [@arshad-shah](https://github.com/arshad-shah)! - config + plugins: land two previously-deferred behaviors for v1
  - **Strict config validation is now the default.** An invalid `extforge.config`
    throws `extforge.config is invalid` instead of warning and continuing. This
    is a behavior change: set `EXTFORGE_STRICT_CONFIG=0` to downgrade validation
    failures to a warning while migrating. (`EXTFORGE_STRICT_CONFIG=1` is no
    longer needed — strict is the default.)
  - **`ctx.addEntry()` and `ctx.emitFile()` are implemented.** They previously
    threw "not yet implemented". Plugins can now register a synthetic entry point
    (`addEntry({ name, file, format })`, bundled into every build and routed to
    the ESM or IIFE pass by `format`) and write files into each browser's output
    directory (`emitFile(rel, contents)`). Repeated calls de-duplicate by entry
    name / output path, and `emitFile` paths that escape the output directory are
    rejected.

### Patch Changes

- [#43](https://github.com/arshad-shah/extforge/pull/43) [`ff96b10`](https://github.com/arshad-shah/extforge/commit/ff96b10bac75830a2a1c00ac4082af4e5e5b5cc1) Thanks [@arshad-shah](https://github.com/arshad-shah)! - fix: Node 24 HMR watcher compatibility and `ws` advisory
  - **Watcher (Node 24):** `createWatcher` now checks the root exists up front
    instead of relying on `fs.watch` to throw `ENOENT`. Node <23 threw
    synchronously for a missing path; Node 24 returns a watcher and stays silent,
    so the `onUnsupported` fallback never fired. The explicit existence check is
    deterministic across Node 20/22/24.
  - **Supply chain:** bump `ws` to `^8.21.0` to clear the moderate
    `GHSA-58qx-3vcg-4xpx` (uninitialized memory disclosure) advisory, keeping
    `pnpm audit --prod` at zero vulnerabilities.

## 0.4.0

### Minor Changes

- [#34](https://github.com/arshad-shah/extforge/pull/34) [`ab7d925`](https://github.com/arshad-shah/extforge/commit/ab7d9256c22b9e15bb62775338c645d207e17091) Thanks [@arshad-shah](https://github.com/arshad-shah)! - cli + ci: cross-platform `extforge package`, coverage floors, BCD freshness gate
  - `extforge package` now falls back to a pure-Node ZIP writer when the
    system `zip` binary isn't available — typically Windows. The writer
    produces deterministic, byte-for-byte reproducible archives (fixed
    DOS timestamp, sorted entries, DEFLATE via `node:zlib`), strips
    `.DS_Store` and `.git` automatically, and round-trips through the
    standard `unzip` cleanly. No new prod dependency.
  - The previous code path still runs first when `zip` is present (it's
    faster and more battle-tested); fallback is automatic on ENOENT.
    Tests can pin `impl: 'js'` to exercise the JS writer explicitly.
  - Vitest gains coverage floors (lines/statements/branches 70 %,
    functions 75 %) just below today's measured baseline. CI will fail
    if a future change drops below; raise as coverage climbs.
  - New `pnpm compat:check-freshness` script (wired into the unit job on
    Node 22) fails CI when `src/core/compat/data.json` hasn't been
    refreshed in the last 90 days. Uses the file's git-log timestamp
    rather than filesystem mtime so fresh clones don't false-positive.

- [#34](https://github.com/arshad-shah/extforge/pull/34) [`ab7d925`](https://github.com/arshad-shah/extforge/commit/ab7d9256c22b9e15bb62775338c645d207e17091) Thanks [@arshad-shah](https://github.com/arshad-shah)! - feat: dev error overlay, externalised runtime templates, dedup'd helpers, 90% coverage

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

- [#34](https://github.com/arshad-shah/extforge/pull/34) [`ab7d925`](https://github.com/arshad-shah/extforge/commit/ab7d9256c22b9e15bb62775338c645d207e17091) Thanks [@arshad-shah](https://github.com/arshad-shah)! - storage + csui: quota errors and an opt-in SPA remount trigger
  - `Storage.set` (localStorage fallback) now throws a typed
    `StorageQuotaExceededError` (with `cause` set to the underlying
    DOMException) when `setItem` fails for quota reasons. Callers can
    catch it and evict / warn / fall through instead of seeing a raw
    `QuotaExceededError` DOMException from a confusing call site.
  - `CSUIOptions` gains a `remountOn` option:
    - `'navigation'` — listens for `pushState`/`replaceState`/`popstate`
      and remounts after each, so SPA route changes that swap the DOM
      don't orphan the mounted host.
    - `'mutation'` — observes the mount point and remounts whenever the
      host is removed from the tree.
    - A custom subscriber function for full control.
      Opt-in, off by default. The previous "mount once and hope" behaviour
      is preserved when the option is omitted.
  - Config validation in non-strict mode now hints `EXTFORGE_STRICT_CONFIG=1`
    for users who'd rather fail fast.

### Patch Changes

- [#34](https://github.com/arshad-shah/extforge/pull/34) [`ab7d925`](https://github.com/arshad-shah/extforge/commit/ab7d9256c22b9e15bb62775338c645d207e17091) Thanks [@arshad-shah](https://github.com/arshad-shah)! - ci: vitest serial mode, playwright retries on CI, lint scripts/
  - `vitest.config.ts` runs test files serially (`fileParallelism: false`).
    Tests that bind ports (HMR server, port-free probe) would otherwise
    collide if parallel workers grabbed the same default. Coverage
    excludes scaffold templates, inlined compat data, and the one-shot
    build-data script — they're not executable surface.
  - `tests-e2e/playwright.config.ts` retries failing specs once on CI
    (kept at 0 locally so flakiness is visible immediately). SW startup
    timing variance on cold CI hosts produces occasional spurious red
    builds that a single retry covers cleanly.
  - `tests-e2e/package.json` pins `packageManager: pnpm@10.0.0` to match
    the workspace root.
  - `eslint.config.js` now covers `scripts/`. The build/docs scripts
    used to be unlinted entirely, so a regression in one wouldn't surface
    until the docs failed to generate. Same correctness rules as `src/`
    with `no-console` allowed (these scripts log to stdout deliberately).
    `pnpm lint` was updated to include `scripts`.

- [#24](https://github.com/arshad-shah/extforge/pull/24) [`0ca0535`](https://github.com/arshad-shah/extforge/commit/0ca0535799259dd041cc892dc5a2456126dd77c3) Thanks [@arshad-shah](https://github.com/arshad-shah)! - CI dedupe and README trim.
  - `release.yml`: drop `typecheck`, `lint`, `test` from the in-line validate step. Those already ran on the PR (and on the changesets Version Packages PR) via `ci.yml`, against the exact same SHA. Keep `pnpm build` because `dist/` is required for the publish step.
  - README: remove the "0 production CVEs, 32 prod packages" tagline, the OpenSSF Scorecard / Security-policy badges, and the Security & supply chain section. Security details belong in `SECURITY.md` and the supply-chain docs page, not in the front page README. Merged the two badge rows into one.

- [#34](https://github.com/arshad-shah/extforge/pull/34) [`ab7d925`](https://github.com/arshad-shah/extforge/commit/ab7d9256c22b9e15bb62775338c645d207e17091) Thanks [@arshad-shah](https://github.com/arshad-shah)! - docs: bring the docs site current with the audit-fix work
  - `index.mdx` and `guides/hmr.mdx` document the new dev error overlay
    (Shadow-DOM-isolated, source frame with caret, hint, docs link,
    collapsible stack) and the `build-error` / `build-ok` HMR envelopes.
  - `reference/runtime/csui.mdx` documents the new `remountOn` option
    (navigation / mutation / custom subscriber) for SPA hosts that swap
    the DOM.
  - `reference/runtime/storage.mdx` documents `StorageQuotaExceededError`
    and clarifies the round-trip semantics in the localStorage fallback.
  - `reference/runtime/messaging.mdx` documents the `PortChannel`
    surface, including the new `onDisconnect(reason?)` hook and the
    auto-cleanup of message listeners.
  - `reference/cli/commands.mdx` documents the cross-platform packager
    (system `zip` preferred, pure-Node fallback) and the archive name
    sanitisation.
  - `reference/cli/flags.mdx` documents the parser change that rejects
    leading-dash values for string flags.
  - `reference/config/index.mdx` documents deep-merge semantics for
    nested object keys and the `EXTFORGE_STRICT_CONFIG` escape hatch.
  - `guides/cross-browser.mdx` documents the recursive-walk compat
    scanner, optional-chaining support, regex-literal ignoring, and the
    expanded `browserOverrides` surface.

- [#34](https://github.com/arshad-shah/extforge/pull/34) [`ab7d925`](https://github.com/arshad-shah/extforge/commit/ab7d9256c22b9e15bb62775338c645d207e17091) Thanks [@arshad-shah](https://github.com/arshad-shah)! - builder: close CSS shell-injection, skip `--minify` in dev, clean dist before prod builds
  - `processCSS` used to build its `npx tailwindcss ...` command via a
    template literal. A project root with shell metacharacters in its
    absolute path (or anywhere `input`/`output` came from user-controlled
    config) could execute arbitrary commands. The probe and the tailwind
    call now use `spawnSync` with argv arrays (no shell).
  - The same call hard-coded `--minify`, even in dev mode. Removed for
    dev builds; production keeps it.
  - `build()` now wipes the per-browser `dist/<browser>` directory before
    every production build. Previously a renamed entry left the previous
    chunk on disk, and a mid-build failure could leave a half-written
    manifest from the prior attempt. Dev builds keep their outputs so
    HMR incremental work isn't trashed every rebuild.

- [#34](https://github.com/arshad-shah/extforge/pull/34) [`ab7d925`](https://github.com/arshad-shah/extforge/commit/ab7d9256c22b9e15bb62775338c645d207e17091) Thanks [@arshad-shah](https://github.com/arshad-shah)! - ci: clear the audit + CodeQL findings flagged on PR #34
  - **`pnpm audit --prod`**: pin `devalue >=5.8.1` via the workspace
    `pnpm.overrides`. Astro 6.2.2 pulled in `devalue@5.8.0` which has a
    high-severity DoS via sparse-array deserialisation
    ([GHSA-77vg-94rm-hx3p](https://github.com/advisories/GHSA-77vg-94rm-hx3p)).
    Only docs-site is affected, but the audit job runs on the whole
    workspace.
  - **Docs `build` gate**: `gen-config-reference.ts` re-emits the index
    page on every run, which clobbered the hand-edited "Merging behavior"
    section. Moved that prose into the generator so it survives `pnpm
docs:gen` (and the CI drift check stays green).
  - **CodeQL — uncontrolled shell command**: `scripts/check-bcd-freshness.ts`
    now uses `spawnSync` with an argv array (no shell) instead of an
    `execSync` template literal. The path was always derived from
    `__dirname`, but CodeQL can't see that.
  - **CodeQL — polynomial regex**: `deriveFirefoxId` and the scaffold
    name-normaliser shared a `^-+|-+$` / `-{2,}` chain that CodeQL flags
    for backtracking on pathological dash-heavy input. Replaced both
    call sites with a new `core/util/slug.ts` helper that walks the
    string once. Locked in by a slug.test.ts that exercises a 100 K dash
    prefix and finishes under 500 ms.
  - **CodeQL — insecure tmp file usage**: tests/validator + tests/scaffold
    switched from `join(tmpdir(), \`name-${Date.now()}-${random}\`)`to`mkdtempSync(...)` which is atomic and owner-only.
  - **CodeQL — unused import**: removed `mkdirSync` from
    tests/hmr-watcher.test.ts.

- [#34](https://github.com/arshad-shah/extforge/pull/34) [`ab7d925`](https://github.com/arshad-shah/extforge/commit/ab7d9256c22b9e15bb62775338c645d207e17091) Thanks [@arshad-shah](https://github.com/arshad-shah)! - cli: fix shell injection in `package`/`icons` and SIGINT pre-empting dev shutdown
  - `extforge package`: previously built its `zip` command via a template
    literal that interpolated `manifest.name`, `manifest.version`, and the
    build output path directly into a shell string. A maliciously crafted
    manifest could execute arbitrary commands. Now uses `spawnSync` with an
    argv array (no shell) and sanitises the archive filename so only
    `[a-zA-Z0-9._-]` characters survive into the filesystem path.
  - `extforge icons`: same fix — replaced `execSync`/template literals with
    `spawnSync` + argv arrays for both the `sharp-cli` and `cairosvg`
    fallback paths.
  - `installProcessGuards`: removed the synchronous `process.exit(130)`
    SIGINT handler. Long-running commands like `extforge dev` register
    their own async shutdown listeners; the previous synchronous handler
    ran first (handler-registration order) and killed the process before
    HMR sockets, file watchers, and esbuild contexts could close cleanly.
    Short-lived commands still exit on Ctrl-C via Node's default behaviour.

- [#34](https://github.com/arshad-shah/extforge/pull/34) [`ab7d925`](https://github.com/arshad-shah/extforge/commit/ab7d9256c22b9e15bb62775338c645d207e17091) Thanks [@arshad-shah](https://github.com/arshad-shah)! - compat: scan imported helpers, not just top-level entry files

  The pre-build cross-browser compat scan used to read only the files
  referenced by `entryPoints` — so `chrome.tabGroups.query()` in a helper
  module imported by `src/background/index.ts` was invisible. Anyone with a
  normal modular project layout got vacuous "no compat issues" reports.

  The scan now walks the configured `build.srcDir` (defaulting to `src/`),
  inspects every TS/JS source up to a 2000-file cap, and skips the usual
  non-source directories (`node_modules`, `dist`, `.git`, `coverage`,
  `.cache`). The doctor's compat check uses the same walk.

- [#34](https://github.com/arshad-shah/extforge/pull/34) [`ab7d925`](https://github.com/arshad-shah/extforge/commit/ab7d9256c22b9e15bb62775338c645d207e17091) Thanks [@arshad-shah](https://github.com/arshad-shah)! - config: deep-merge nested objects so partial overrides keep default siblings

  Previously a user config like `dev: { port: 9000 }` silently dropped
  `host: 'localhost'`, `debounce: 150`, and `open: false` from the
  defaults, because the loader shallow-merged top-level keys only. Same
  problem applied to `build: { sourcemap: true }` and to programmatic
  overrides passed to `loadExtForgeConfig`.

  `loadConfigFile` and `loadExtForgeConfig` now share a single
  `mergeConfig` helper that recurses into plain-object branches and
  replaces arrays/primitives wholesale. List-shaped config keys
  (`browsers`, `plugins`) keep their existing replace-not-concat
  semantics.

- [#34](https://github.com/arshad-shah/extforge/pull/34) [`ab7d925`](https://github.com/arshad-shah/extforge/commit/ab7d9256c22b9e15bb62775338c645d207e17091) Thanks [@arshad-shah](https://github.com/arshad-shah)! - csui: fix nested `matches:` extraction, closed-shadow crash, and duplicate manifest entries
  - `extractMatches` previously picked the _first_ `matches:` key after
    `defineCSUI(`, so a config like
    `defineCSUI({ routerMap: { matches: ['/inner'] }, matches: ['*://*/*'] }, ...)`
    silently wrote the wrong match list into the manifest. It now walks the
    options literal balancing braces and reads only the OUTER `matches:` key.
  - `discoverCSUI` previously emitted two descriptors when both `foo.csui.ts`
    and `foo.csui.tsx` existed (same `entryKey: 'contents/foo'`), making
    Chrome run the content script twice. Discovery now dedupes by entryKey
    with a stable lexicographic resolution.
  - `mountCSUI` used to crash with `NotSupportedError` when the host page
    already attached a _closed_ shadow root to the user-provided
    `getRootContainer` element. The runtime now falls back to rendering
    directly into the host element instead of throwing.
  - `augmentManifestWithCSUI` no longer appends a duplicate
    `content_scripts` entry for a CSUI file the user already declared in
    `extforge.config.ts`. Existing entries' `js` paths are indexed and
    skipped on the auto-augmentation pass.

- [#34](https://github.com/arshad-shah/extforge/pull/34) [`ab7d925`](https://github.com/arshad-shah/extforge/commit/ab7d9256c22b9e15bb62775338c645d207e17091) Thanks [@arshad-shah](https://github.com/arshad-shah)! - csui: `extractRunAt` reads the outer `defineCSUI` options object only

  `runAt` extraction used to grep the file for the first `runAt: '...'`
  literal anywhere. A helper constant (`const runAt = 'document_end'`) or
  a nested object with its own `runAt:` won over the real `defineCSUI`
  options entry. Like `extractMatches`, it now walks the options literal
  balancing braces and only matches the key at brace depth 1, reading the
  quoted string value from the original source.

- [#34](https://github.com/arshad-shah/extforge/pull/34) [`ab7d925`](https://github.com/arshad-shah/extforge/commit/ab7d9256c22b9e15bb62775338c645d207e17091) Thanks [@arshad-shah](https://github.com/arshad-shah)! - doctor + builder + compat + csui: medium-severity polish
  - `dist-gitignored` doctor check now recognises every common gitignore
    spelling of "dist" (`/dist`, `/dist/`, `**/dist`, `dist/*`, `dist/**`,
    …), strips inline `#` comments, and ignores `!` negations and a
    leading UTF-8 BOM. Previously only three exact forms were matched.
  - `validateManifestConfig` and `generateManifest` guard against a
    missing `permissions` object. JS callers that omit the key used to
    hit `TypeError: Cannot read properties of undefined (reading
'required')`. Validation now surfaces a clear error; generation
    treats missing arrays as empty.
  - Builder error wrapping (`throwAsBuildError`) now includes every
    esbuild error in the thrown `ExtForgeError.message`. The first
    error still populates `file`/`line`/`column` for editor jump-to.
    Previously only the first error was surfaced; the rest were dropped.
  - Compat scanner regex matches optional-chained `chrome?.foo.bar`
    access too. Previously dotted-only chains were detected.
  - CSUI `defineCSUI` auto-mount failures now log the underlying error
    object instead of a generic "auto-mount failed" string, so users
    can actually debug.

- [#34](https://github.com/arshad-shah/extforge/pull/34) [`ab7d925`](https://github.com/arshad-shah/extforge/commit/ab7d9256c22b9e15bb62775338c645d207e17091) Thanks [@arshad-shah](https://github.com/arshad-shah)! - doctor: fix three checks that silently no-oped on real projects
  - `permissions-known`: accept both the flat-array (`permissions: ['storage']`)
    and the scaffolded object (`permissions: { required, optional, host }`)
    shapes. Previously the object form threw, the catch swallowed it, and
    the check reported "Skipped (config invalid)" on every scaffolded project.
  - `compat`: walk `src/` recursively instead of looking at a fixed list of
    top-level filenames (`src/background.ts`, etc.) that the current scaffold
    doesn't create. Previously the check always reported "no compat issues"
    because it never opened any of the user's source files.
  - `port-free`: honour `dev.port` from `extforge.config` instead of
    hardcoding 35729, and bind to `0.0.0.0` so a process bound to any local
    interface is detected.

- [#34](https://github.com/arshad-shah/extforge/pull/34) [`ab7d925`](https://github.com/arshad-shah/extforge/commit/ab7d9256c22b9e15bb62775338c645d207e17091) Thanks [@arshad-shah](https://github.com/arshad-shah)! - env: support standard dotenv escape sequences and backtick quoting

  `parseDotenv` now matches Vite / dotenv conventions:
  - Double-quoted values process `\n`, `\r`, `\t`, `\"`, and `\\` escapes
    (so `FOO="line1\nline2"` produces a newline, not the two-character
    string `\n`).
  - Single-quoted values are kept literal (no escape processing) — useful
    for paths that contain backslashes.
  - Backtick-quoted values are also kept literal — handy when the value
    contains both single and double quotes.
  - Unquoted values still strip the trailing ` #` inline comment.

- [#34](https://github.com/arshad-shah/extforge/pull/34) [`ab7d925`](https://github.com/arshad-shah/extforge/commit/ab7d9256c22b9e15bb62775338c645d207e17091) Thanks [@arshad-shah](https://github.com/arshad-shah)! - hmr + compat + builder + manifest: smaller follow-ups
  - HMR v3 update envelopes now hash the rebuilt chunk's bytes (sha256
    → first 12 hex chars) instead of the rebuild timestamp. The runtime's
    hash-equality short-circuit in `apply()` was dead before — every
    update looked unique even when the bundled output was identical.
  - The compat scanner's `stripStringsAndComments` now recognises regex
    literals (`/chrome\.tabGroups/`) and blanks out their bodies. A
    `chrome.*` token inside a RegExp body used to produce a false-positive
    compat warning.
  - `ESBUILD_TARGETS` refreshed to chrome120/firefox128/safari17/edge120
    (was chrome110/firefox115/safari16, missing edge). MV3 floors are
    Chrome 88, Firefox 109, Safari 17; the new floors give us the widest
    install base without forcing legacy transforms.
  - `applyInjectedDefaults` now narrows the auto-generated
    `web_accessible_resources.matches` to the union of declared
    contentScript matches rather than blanket `<all_urls>`. Falls back to
    `<all_urls>` only when no content_scripts are declared. Reduces store
    review friction for the common case of site-specific extensions.

- [#34](https://github.com/arshad-shah/extforge/pull/34) [`ab7d925`](https://github.com/arshad-shah/extforge/commit/ab7d9256c22b9e15bb62775338c645d207e17091) Thanks [@arshad-shah](https://github.com/arshad-shah)! - hmr: tighter start/stop lifecycle + SWC cache can pick up mid-session installs
  - `createHMRServer.start()` now races `'listening'` vs `'error'` after
    `new WebSocketServer(...)`. Previously a TOCTOU port grab — another
    process binding the port in the window between `reservePort` releasing
    it and the WebSocket server binding — resolved `start()` successfully
    with a non-functional server.
  - `stop()` now terminates open client sockets and awaits `wss.close()`'s
    callback. Sockets used to linger after stop, keeping the event loop
    alive in tests and CI.
  - `@swc/core` resolution had a permanent in-process negative cache:
    once "not installed" was decided, installing it mid-session never
    re-enabled React Fast Refresh until restart. The cache now expires
    after 60 s, and a successful re-probe surfaces a one-time
    "RFR enabled" info line.

- [#34](https://github.com/arshad-shah/extforge/pull/34) [`ab7d925`](https://github.com/arshad-shah/extforge/commit/ab7d9256c22b9e15bb62775338c645d207e17091) Thanks [@arshad-shah](https://github.com/arshad-shah)! - hmr: align the v3 update envelope shape between server and runtime

  The dev server emits `{ id, hash, file }` per update (and the browser
  HMR client template already reads `u.file`), but the in-runtime helper
  `applyV3Update` in `src/core/hmr/runtime.ts` was reading `u.chunkUrl`,
  which never existed in the wire format. The helper was dead code at
  runtime — if ever invoked it would have crashed on `undefined`.

  The runtime now reads `u.file`, matching the server. `HMRUpdateV3` in
  `runtime.ts` documents the field. This is the public type imported by
  test setups and any user of `applyV3Update`; the rename is a breaking
  change at the type level for that helper only.

- [#34](https://github.com/arshad-shah/extforge/pull/34) [`ab7d925`](https://github.com/arshad-shah/extforge/commit/ab7d9256c22b9e15bb62775338c645d207e17091) Thanks [@arshad-shah](https://github.com/arshad-shah)! - hmr: fix watcher missed-unlink, port-exhaustion silent failure, and infinite client reconnect
  - `createWatcher` previously misclassified the first delete after start as
    `change` (existence map defaulted to `false`, so `had=false && now=false`
    produced "change"). The HMR server treats `change` as a JS hot-swap, so
    a brand-new deletion of a previously-tracked file silently skipped the
    required full reload. The watcher now seeds the existence map by walking
    the watch root once at start.
  - `createWatcher` also gains an `onUnsupported(reason)` callback. The dev
    server wires it up so a recursive-watch failure (path missing, Linux
    Node <20, kernel without inotify recursive support) surfaces a warning
    instead of silently returning a no-op watcher.
  - `reservePort` used to log a warning and return `start` when every port
    in the candidate range was occupied. The subsequent `WebSocketServer`
    bind then crashed mid-`start()`, leaving the file watcher and esbuild
    context alive. Now throws `EXT_HMR_PORT_IN_USE` with a hint pointing at
    `--port`.
  - The injected browser HMR client used to retry forever after the dev
    server shut down (advertised as "infinite reconnect"). Closed tabs
    hammered the dev box every 8 s until the user closed them. Capped at
    30 attempts; the badge then advises a manual refresh once the dev
    server is back.

- [#34](https://github.com/arshad-shah/extforge/pull/34) [`ab7d925`](https://github.com/arshad-shah/extforge/commit/ab7d9256c22b9e15bb62775338c645d207e17091) Thanks [@arshad-shah](https://github.com/arshad-shah)! - logger + publish: harden `jsonTransport` and drop tarball source maps
  - `jsonTransport` used `JSON.stringify(args)` directly, so a circular
    reference in a logged value threw — tearing down `--json` mode in
    the middle of a build / dev session. It also serialised `Error`
    instances as `{}` (useless in production logs) and crashed on
    `BigInt`. The transport now goes through a safe stringifier that
    expands Errors to `{ name, message, stack, cause? }`, coerces
    BigInts to strings, and replaces seen objects with `"[Circular]"`.
    A final try/catch emits a single "failed to serialise" line as a
    last-resort fallback.
  - `tsup.config.ts` no longer emits source maps. They added ~40 KB of
    `.map` files to every npm tarball and leaked the maintainer's local
    source paths to consumers. Library users build their own extension;
    internal debugging happens in the repo, not in node_modules.

- [#34](https://github.com/arshad-shah/extforge/pull/34) [`ab7d925`](https://github.com/arshad-shah/extforge/commit/ab7d9256c22b9e15bb62775338c645d207e17091) Thanks [@arshad-shah](https://github.com/arshad-shah)! - manifest: `browserOverrides` now applies to every top-level key, not just name/version/description

  Previously only `name`, `version`, and `description` were threaded through
  the per-browser override, so a config like
  `browserOverrides: { firefox: { permissions: {...}, background: {...} } }`
  silently dropped the override and produced the base manifest. The type
  signature said `Partial<ManifestConfig>` but the generator never read those
  fields.

  Per-browser overrides are now applied via a shallow merge: nested objects
  (`permissions`, `action`, `background`, `sidePanel`, `commands`) are merged
  key-by-key so a partial override doesn't blow away unrelated fields; arrays
  (`contentScripts`, `webAccessibleResources`) and primitives are replaced
  wholesale.

- [#34](https://github.com/arshad-shah/extforge/pull/34) [`ab7d925`](https://github.com/arshad-shah/extforge/commit/ab7d9256c22b9e15bb62775338c645d207e17091) Thanks [@arshad-shah](https://github.com/arshad-shah)! - manifest + scaffold: sanitise extension names for Firefox addon-id and npm package-name
  - The default Firefox addon id was `${name.toLowerCase().replace(/\s+/g,'-')}@extension`,
    which produced invalid ids for unicode names (`Résumé Helper`),
    emoji-containing names, and names with `&` / `/`. Firefox rejects ids
    outside `[a-zA-Z0-9-._]+@[a-zA-Z0-9-._]+`. A new `deriveFirefoxId`
    helper collapses unsupported character runs to `-`, trims leading and
    trailing `-`, and falls back to `extension` if nothing survives.
  - The interactive scaffold prompter validated names by checking the
    _normalised_ form (`replace(/\s+/g,'-')`) but stored the original
    un-trimmed input. A name like `My Cool Ext` then ended up in
    `package.json`'s `name` field, which npm rejects. The scaffold now
    normalises the stored name the same way for both `--defaults` and
    interactive flows.

- [#34](https://github.com/arshad-shah/extforge/pull/34) [`ab7d925`](https://github.com/arshad-shah/extforge/commit/ab7d9256c22b9e15bb62775338c645d207e17091) Thanks [@arshad-shah](https://github.com/arshad-shah)! - messaging: always drain `chrome.runtime.lastError`

  When a receiver disconnects mid-flight (service worker respawn, tab
  closed, no listener), `chrome.runtime.sendMessage` resolves with
  `undefined` and Chrome writes "Could not establish connection." to
  `chrome.runtime.lastError`. If the property is never read, Chrome logs
  an "Unchecked runtime.lastError" warning to the user's console.

  `sendMessage` and `sendMessageToTab` now read `lastError` after every
  call (success or failure) and include its message in the thrown error
  when no reply was received.

- [#34](https://github.com/arshad-shah/extforge/pull/34) [`ab7d925`](https://github.com/arshad-shah/extforge/commit/ab7d9256c22b9e15bb62775338c645d207e17091) Thanks [@arshad-shah](https://github.com/arshad-shah)! - paths: use platform `node:path` for filesystem ops; keep wire/manifest paths POSIX

  Sixteen files imported from `node:path/posix` and used the result for
  real filesystem operations. On POSIX systems this happens to work, but on
  Windows `posix.join("C:\\proj\\src", "background")` produces a broken
  mixed path. Among the consequences listed in the audit:
  - `relative(projectRoot, absoluteFile)` returned garbage in the HMR
    broadcast `files` array.
  - `path.join` calls used to compute fs targets in the builder, validator,
    scaffold, config loader, and doctor checks all silently produced
    mixed-separator paths.

  All `'node:path/posix'` imports under `src/` are now `'node:path'`. The
  HMR server explicitly normalises paths to forward-slash before they go
  on the wire or are compared against the source prefix (`toPosix`
  helper). Manifest output paths are already POSIX-literal in the
  emitter.

  Locked in by a `classifyChange` test that exercises Windows-style
  backslash paths.

- [#34](https://github.com/arshad-shah/extforge/pull/34) [`ab7d925`](https://github.com/arshad-shah/extforge/commit/ab7d9256c22b9e15bb62775338c645d207e17091) Thanks [@arshad-shah](https://github.com/arshad-shah)! - plugins + messaging + cli: small but user-facing fixes
  - `PluginRunner.fireManifestTransform` no longer accepts `null`/non-object
    returns from `onManifestTransform`. The hook signature type forbids it,
    but a misbehaving plugin returning `null` used to overwrite the manifest
    and crash every downstream plugin on its first property access.
  - `PortChannel` gains an `onDisconnect(reason?)` method and the wrapper
    auto-removes all `onMessage` listeners when the underlying Port
    disconnects. `chrome.runtime.lastError` is read at the disconnect
    boundary to suppress Chrome's console spam.
  - The CLI parser used to accept `--port -X` as `port="-X"`, producing
    `NaN` once the value was parsed as an integer. Any leading-dash token
    is now rejected; use `--port=-X` to pass a literal leading-dash value.
  - The interactive scaffold prompter registers a one-shot `process.exit`
    listener that restores cooked terminal mode. Without this an
    uncaught exception or SIGTERM during a prompt left the user's shell
    in raw mode.

- [#34](https://github.com/arshad-shah/extforge/pull/34) [`ab7d925`](https://github.com/arshad-shah/extforge/commit/ab7d9256c22b9e15bb62775338c645d207e17091) Thanks [@arshad-shah](https://github.com/arshad-shah)! - build: include `lint` in `prepublishOnly`

  `prepublishOnly` previously ran `typecheck && build && test` but not
  `lint`, so a maintainer publishing locally could ship code with lint
  regressions / banned `console.*` calls. The script now runs `lint`
  first.

- [#36](https://github.com/arshad-shah/extforge/pull/36) [`da5a874`](https://github.com/arshad-shah/extforge/commit/da5a8748a35470e25dcca9e34c484ae0919ca015) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Fix `TypeError: $RefreshReg$ is not a function` after the first React Fast Refresh module loads.

  The RFR runtime header set `globalThis.$RefreshReg$` / `globalThis.$RefreshSig$` to their no-op stubs only inside the `__extforge_refresh_inited__` guard, but the footer unconditionally restored both globals to the saved `prev` values (which are `undefined` for the very first module). The second module's header then re-ran, found the init flag already true, skipped the no-op assignments, and its body immediately called `$RefreshReg$(...)` against `undefined`.

  The stubs now live outside the init guard so every wrapped module re-installs them at its own top. `injectIntoGlobalHook` (which isn't idempotent) stays inside the guard.

- [#34](https://github.com/arshad-shah/extforge/pull/34) [`ab7d925`](https://github.com/arshad-shah/extforge/commit/ab7d9256c22b9e15bb62775338c645d207e17091) Thanks [@arshad-shah](https://github.com/arshad-shah)! - scaffold: fix interactive prompts printing literal `[2K`/`[1A` text

  The `select`/`multiselect` prompts in `extforge init` were missing the `\x1b`
  escape byte from their cursor-control sequences, so users saw garbage like
  `[3A[2K[2K` printed between redraws instead of the prompt actually being
  redrawn. Now emits real ANSI escapes and skips the cursor-up move when only a
  single line was previously rendered.

- [#34](https://github.com/arshad-shah/extforge/pull/34) [`ab7d925`](https://github.com/arshad-shah/extforge/commit/ab7d9256c22b9e15bb62775338c645d207e17091) Thanks [@arshad-shah](https://github.com/arshad-shah)! - storage: round-trip strings correctly in the localStorage fallback; share the chrome onChanged listener
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

- [#34](https://github.com/arshad-shah/extforge/pull/34) [`ab7d925`](https://github.com/arshad-shah/extforge/commit/ab7d9256c22b9e15bb62775338c645d207e17091) Thanks [@arshad-shah](https://github.com/arshad-shah)! - validator: wire manifest-config validation into the build pipeline

  `validateManifestConfig` was exported but never called from the build /
  dev paths, so users with a missing `manifest.name`, a non-semver
  `version`, or a too-long `description` got a silently invalid manifest
  written to disk.

  `validateProject` now accepts an optional `manifest` in its options
  object and surfaces manifest-level errors/warnings as project
  validation issues. The CLI's `dev` and `validate` commands pass
  `config.manifest` through so the check actually runs.

- [#34](https://github.com/arshad-shah/extforge/pull/34) [`ab7d925`](https://github.com/arshad-shah/extforge/commit/ab7d9256c22b9e15bb62775338c645d207e17091) Thanks [@arshad-shah](https://github.com/arshad-shah)! - storage/react: add unit tests for the `useStorage` hook

  `extforge/storage/react` is a public subpath export but had zero test
  coverage. Six tests now cover: initial loading state, default-value
  fallback, `setValue` round-trip, external `chrome.storage.onChanged`
  propagation into React state, `remove`, and unmount/unsubscribe safety.

## 0.3.1

### Patch Changes

- [#22](https://github.com/arshad-shah/extforge/pull/22) [`6bedd0d`](https://github.com/arshad-shah/extforge/commit/6bedd0d1c87ffceff3193389c2f1437f43f21c84) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Docs, badges, and release-pipeline hardening.
  - **`extforge/logger`** now has a dedicated reference page covering `LogLevel`, scoped loggers, timers, the JSON transport, formatters, and the ANSI / `NO_COLOR` rules. The subpath was already exported from `package.json` but undocumented.
  - **README badges** for CI, CodeQL, OpenSSF Scorecard, npm downloads, npm provenance, and the security policy. New "Security & supply chain" section with `npm audit signatures` verification snippet.
  - **Supply-chain guide** at `/guides/supply-chain/` documents the hardened release pipeline (OIDC trusted publishing, required-reviewer environment, SHA-pinned actions, `persist-credentials: false`, provenance attestations).
  - **Release workflow fix:** pin `npm` to `11.5.1` in `release.yml` and `publish.yml`. The unpinned `npm@latest` started failing with `Cannot find module 'promise-retry'` on Node 22 runners; pinning gives us deterministic publishes.

  No runtime behaviour change to any exported API.

## 0.3.0

### Minor Changes

- [#2](https://github.com/arshad-shah/extforge/pull/2) [`e028a1d`](https://github.com/arshad-shah/extforge/commit/e028a1d6eb66234d43ba855b6892b2d1468ff486) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Add Plasmo-parity first-party packages.
  - **`extforge/storage`** — typed `Storage` class wrapping `chrome.storage.{local,sync,session,managed}` with watch API, namespaces, and a transparent `localStorage` fallback for non-extension contexts.
  - **`extforge/storage/react`** — `useStorage(key, defaultValue)` hook in its own subpath so the core stays React-free.
  - **`extforge/messaging`** — typed RPC over `chrome.runtime`. `defineHandler` / `sendMessage` with full inference via the augmentable `MessageMap` interface. Plus `sendMessageToTab`, `openPort` / `onPort` for long-lived connections.
  - **`extforge/csui`** — Content Script UI runtime. `defineCSUI(options, render)` declares a Shadow-DOM-mounted UI; auto-mounts on import in DOM contexts so `export default defineCSUI(...)` works without a separate call. Files matching `src/contents/*.csui.{ts,tsx}` are auto-discovered by the builder and added to the manifest's `content_scripts` from the statically-extracted `matches:` array.
  - **`extforge/env`** — build-time `.env` loader with Vite-style precedence. Variables prefixed `EXTFORGE_PUBLIC_` are inlined into bundles via esbuild's `define`.

  `react` is now an optional peer dep (used only by `extforge/storage/react`).

- [#2](https://github.com/arshad-shah/extforge/pull/2) [`e028a1d`](https://github.com/arshad-shah/extforge/commit/e028a1d6eb66234d43ba855b6892b2d1468ff486) Thanks [@arshad-shah](https://github.com/arshad-shah)! - True 0-reload UI updates via SWC + React Fast Refresh.
  - New esbuild plugin `extforge/hmr/swc/refresh-plugin` runs `@swc/core` over `.tsx` / `.jsx` in dev mode with `react.refresh: true`. SWC chosen over Babel for ~20× faster transforms.
  - `@swc/core` and `react-refresh` are **optional peer deps**. Install them to get RFR; without them dev mode falls back to esbuild's TS/JSX loader (current full-reload behavior) with a single warning.
  - HMR protocol bumped to **v3**. v2 envelopes still emitted for non-hot-applicable changes (manifest / background / content scripts / CSS / assets). v3 envelopes (`{ v:3, type:'hmr-update', updates:[{id, hash, file}] }`) emitted for popup/options/sidepanel-only JS changes — client refetches `chrome-extension://<id>/<file>?t=<hash>` and the new module's RFR header calls `performReactRefresh()` to update the DOM in place with state preserved.
  - New module registry runtime at `src/core/hmr/runtime.ts` with `accept` / `dispose` / `decline` primitives, attached to `globalThis.__EXTFORGE_HMR__`.
  - Phase 6 scaffolding: `src/core/hmr/content-script.ts` generates a dev-only background snippet that registers content scripts dynamically via `chrome.scripting.registerContentScripts` and re-registers on HMR. Opt-in via `extforge.config.ts` `hmr.contentScripts: 'dynamic'`.

### Patch Changes

- [#2](https://github.com/arshad-shah/extforge/pull/2) [`e028a1d`](https://github.com/arshad-shah/extforge/commit/e028a1d6eb66234d43ba855b6892b2d1468ff486) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Production dependency tree: 130 → 32 packages (–75%). All vulnerabilities resolved.
  - `pnpm audit --prod` reports **0 vulnerabilities** (previously 8 — 6 high tar CVEs via the c12 → giget → tar 6.2.1 chain plus 2 moderate esbuild advisories).
  - Replaced `c12` with first-party `src/core/config/loader.ts` (~200 LOC). Kills the entire vulnerable tar chain and drops ~25 transitive packages. No public API change — `loadExtForgeConfig()` signature is unchanged.
  - Replaced `pathe` with `node:path/posix` directly. Identical semantics on Node 20+.
  - Replaced `picocolors` with `src/core/logger/ansi.ts` (~50 LOC). Brand-aware, NO_COLOR / FORCE_COLOR / TERM=dumb / isTTY all honored.
  - Replaced `citty` with `src/cli/parser.ts` (~250 LOC). Same `defineCommand` / `runMain` API surface so `src/cli/index.ts` only changed its import line.
  - Replaced `chokidar` with `src/core/hmr/watcher.ts` (~150 LOC) on top of `node:fs.watch({ recursive: true })`. add/change/unlink event synthesis from existence tracking, awaitWriteFinish-style stat-stable polling, glob-string ignore patterns.
  - Replaced `prompts` with `src/core/scaffold/prompter.ts` (~250 LOC) using `node:readline` raw mode. Non-TTY mode resolves prompts to defaults (CI-safe).
  - Removed declared-but-unused `fast-glob`, `glob`, `pkg-types`, `defu`.
  - Bumped `esbuild` to `^0.28.0` (closes [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)).

  ESLint `no-console: error` now enforced across `src/`. Library code routes through Logger (server-side) or `runtimeLog` (in-browser HMR). New `Logger.raw()` method for unstructured UX text (scaffold banners).

All notable changes to ExtForge are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added — true 0-reload UI updates via SWC + React Fast Refresh (Phase 4 complete)

- **`src/core/hmr/swc/refresh-plugin.ts`** — esbuild plugin that runs `@swc/core` over `.tsx`/`.jsx` in dev mode with `react.refresh: true`. Emits the `$RefreshReg$`/`$RefreshSig$` calls Fast Refresh needs, plus a header that initialises `react-refresh/runtime` and a footer that wires `import.meta.hot.accept` to `performReactRefresh()`. SWC chosen over Babel for ~20× faster transforms — matches our esbuild philosophy.
- **`@swc/core` and `react-refresh` are optional peer deps**: install them to enable RFR; without them the plugin no-ops with a single warning and dev-mode falls back to esbuild's TS/JSX loader (current full-reload behaviour).
- **HMR protocol bumped to v3.** v2 envelopes still emitted for everything that can't be hot-applied (manifest / background / content / CSS / asset changes). v3 envelopes (`{ v:3, type:'hmr-update', updates:[{id, hash, file}] }`) emitted for popup/options/sidepanel-only JS changes — client refetches `chrome-extension://<id>/<file>?t=<hash>`, the new module's RFR header re-registers components, `performReactRefresh()` updates the DOM in place with state preserved.
- **Server-side classifier `tryClassifyV3`** decides per-batch whether v3 is safe. Falls through to v2 the moment any non-UI source touches the change set (one content-script edit and we reload the whole extension — correctness over cleverness).
- **Client-side `handleHotUpdate`** in the HMR client template fetches each chunk in parallel, falls back to a clean reload on any import failure or non-extension context.
- 3 new unit tests for the SWC plugin (no-op-when-disabled, transform-runs-or-no-ops-without-swc, skip-node_modules).

### Added — content-script HMR scaffolding (Phase 6)

- **`src/core/hmr/content-script.ts`** — generator for a dev-only background snippet that registers content scripts dynamically via `chrome.scripting.registerContentScripts` (instead of the static manifest entry) and re-registers on HMR. Pairs with a per-tab dispose registry runtime exposing `__extforgeDispose__()` for cleanup.
- 6 new unit tests cover descriptor embedding, fallback behaviour without `chrome.scripting`, cache-busting, and re-register hook.
- Opt-in via `extforge.config.ts` `hmr.contentScripts: 'dynamic'` (config schema entry lands in next minor). Default behaviour unchanged.

### Changed — centralized logging

- All `console.*` calls in library code now route through Logger (`src/core/logger`) or the in-browser `runtimeLog` helper. Scattered `console.error('[extforge] ...')` from `src/core/config.ts` removed.
- Added `Logger.raw(line)` for unstructured user-facing UX text (scaffold banners, prompt-side output) so the scaffold no longer touches `console` directly.
- Added an `in-browser` runtime logger (`src/core/hmr/runtime.ts → runtimeLog`) that respects `globalThis.__EXTFORGE_HMR_QUIET__` for opt-out.
- ESLint `no-console: error` enabled across `src/`, with a small whitelist of files that have a documented reason: `src/cli/error-handler.ts` (top-level CLI renderer; runs before any logger exists), `src/core/hmr/runtime.ts` (in-browser; routes through `runtimeLog`), `src/core/compat/build-data.ts` (release-time tool, not user-facing).

### Fixed — docs-site build

- Astro Starlight 0.30 → 0.38 changed the `social:` config syntax from object to array. `docs-site/astro.config.mjs` updated. `pnpm --filter extforge-docs build` now passes against Astro 6 + Starlight 0.38.

### Added — HMR runtime scaffolding (Phase 4 part 1)

- New module `src/core/hmr/runtime.ts` with `createHMRRuntime()` and the `HotApi` (`accept` / `dispose` / `decline`) primitives. This is the registry that backs true 0-reload swaps once the v3 protocol fires.
- v3 envelope shape (`HMRUpdateV3`) and `applyV3Update()` helper documented and unit-tested.
- 12 unit tests cover the runtime: register/swap, accept-with-new-exports, dispose-before-swap ordering, decline → reload fallback, hash-deduped no-op, factory-throw safety, accept-returns-false abort.
- `HMR_PROTOCOL_VERSION` stays at 2 in this release; bumping to 3 happens alongside the esbuild module-rewrite plugin (Phase 4.2 follow-up).

### Removed — dep trim (Phases 3, 7, 8)

- **Production dep tree: 38 → 32 packages.** Total drop since Phase 1: **130 → 32 (-98 packages, -75%).** Vulnerabilities still 0.
- Dropped runtime deps: `pathe`, `picocolors`, `citty`, `chokidar`, `prompts`. Each replaced by a first-party module:
  - `pathe` → `node:path/posix` directly. Identical semantics on every Node 20+ platform; saves the whole pathe transitive surface.
  - `picocolors` → `src/core/logger/ansi.ts` (50 LOC) with NO_COLOR / FORCE_COLOR / TERM=dumb / isTTY detection. Brand-aware.
  - `citty` → `src/cli/parser.ts` (~250 LOC) — defineCommand/runMain shape preserved so `src/cli/index.ts` only changes its import. Supports subcommands, positional + string + boolean flags, --no-flag, --flag=value, `--`, --help, --version. 10 dedicated unit tests.
  - `chokidar` → `src/core/hmr/watcher.ts` (~150 LOC) on top of `node:fs.watch({ recursive: true })`. add/change/unlink synthesis from existence tracking, awaitWriteFinish polling, glob-string ignore patterns. No-op fallback when watch isn't supported.
  - `prompts` → `src/core/scaffold/prompter.ts` (~250 LOC) using `node:readline` raw mode. text/select/multiselect prompts with brand-coloured cursors. Non-TTY mode resolves to defaults (CI-safe).

### Added — Plasmo parity (Phase 5)

- **`extforge/storage`** — typed `Storage` class wrapping `chrome.storage.{local,sync,session,managed}` with watch API, namespaces, and a transparent `localStorage` fallback for non-extension contexts. Plus `extforge/storage/react` `useStorage()` hook (subpath kept React-free in the core).
- **`extforge/messaging`** — typed RPC over `chrome.runtime.sendMessage`. Routes register via `defineHandler`; callers use `sendMessage(route, payload)` with full type inference via the augmentable `MessageMap` interface. Also `sendMessageToTab`, `openPort`/`onPort` for long-lived connections.
- **`extforge/csui`** — Content Script UI. `defineCSUI({ matches, getMountPoint, getStyle, getRootContainer, shouldMount, ...id, runAt })` declares a Shadow-DOM-mounted UI; `mountCSUI(descriptor)` performs idempotent mount/remount with a cleanup contract. Files matching `src/contents/*.csui.{ts,tsx}` are **auto-discovered by the builder** and added to the manifest's `content_scripts` from the statically-extracted `matches:` array — zero manifest configuration required.
- **`extforge/env`** — build-time `.env` loader with Vite-style precedence (`.env` → `.env.local` → `.env.<mode>` → `.env.<mode>.local` → process env). Variables prefixed `EXTFORGE_PUBLIC_` are inlined into bundles via esbuild's `define` as both `import.meta.env.<KEY>` and `process.env.<KEY>`. Non-public vars stay out of the bundle.
- Subpath exports wired in `package.json#exports`: `extforge/storage`, `extforge/storage/react`, `extforge/messaging`, `extforge/csui`, `extforge/env`.
- `react` is now an optional peer dep (used only by `extforge/storage/react`).
- 43 new unit tests (storage 10, messaging 7, env 13, csui 13). `happy-dom` added as a devDep so CSUI runtime tests can exercise Shadow DOM.

### Changed

- Both example extensions migrated to use the new packages — the React example deleted its `src/content/` and now relies on auto-discovered CSUI; both backgrounds use `defineHandler` + `Storage`.

### Security

- **Production dependency tree now reports 0 vulnerabilities** (`pnpm audit --prod`). Previously 8 (6 high tar CVEs via the c12 → giget → tar 6.2.1 chain, plus 2 moderate esbuild advisories).
- Bumped `esbuild` from `^0.24.0` to `^0.28.0` — closes [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) (dev-server SSRF).
- Bumped `astro` (docs-site) from `^5.0.0` to `^6.1.6` and `@astrojs/starlight` to `^0.38.0` — closes [GHSA-j687-52p2-xcff](https://github.com/advisories/GHSA-j687-52p2-xcff) (define:vars XSS).

### Removed

- **Replaced `c12` with a 200-line first-party config loader** (`src/core/config/loader.ts`). Kills the entire vulnerable `tar` chain (6 high-severity CVEs) and drops ~25 transitive packages. The new loader supports `.ts`/`.mts`/`.cts`/`.mjs`/`.js`/`.cjs` config files, default + named exports, and shallow-merges over defaults. No public API change — `loadExtForgeConfig()` signature is unchanged.
- Removed five declared-but-never-imported runtime deps: `fast-glob`, `glob`, `pkg-types`, `defu`, plus the indirect `consola`. **Production dep count: 130 → 38 packages.**

### Removed (breaking — pre-1.0)

- Aspirational support for Vue, Svelte, and Solid frameworks. Only React and vanilla TypeScript are actually supported today; the schema and scaffold no longer claim Vue/Svelte/Solid. They will return as separate plugin presets when properly implemented.

### Added

- Vanilla popup scaffolding now writes a working `src/ui/popup/index.ts` (previously only the HTML was written; users had to fill in the script themselves).

### Added

- `ExtForgeError` class with codes (`EXT_*` registry) and docs URLs; CLI now renders code, file:line:column, hint, and docs link.
- Zod-based config validation with pretty error formatting and field-level suggestions.
- `extforge doctor` command with 9 checks: node version, config validity, icons present, HMR port free, dist gitignored, permissions known, browser overrides match, recommended scripts present, cross-browser API compat.
- Cross-browser API compatibility check using MDN browser-compat-data: warns by default during `extforge build`/`extforge dev`, fails the build with `--strict`. Per-line opt-out via `// extforge-ignore-compat: <reason>`.
- `--quiet` and `--json` flags on `dev`, `build`, `validate`, `doctor`.
- `extforge upgrade` stub command (codemods land in track 3).
- `Logger` gains `group`, `step`, `summary`, and a JSON transport (`jsonTransport`).

### Changed

- esbuild build failures are now wrapped as `ExtForgeError(EXT_BUILD_FAILED)` with file/line/column.
- `buildAll` ends with a grouped summary showing each browser's output dir, file count, and total size.

### HMR

- Versioned websocket protocol envelope (`v: 2`); legacy clients tolerated, future versions ignored with one warning.
- Targeted content-script reloads — server emits `scriptIds` and the in-page client filters via `__EXTFORGE_SCRIPT_ID__`. Tabs that don't host the changed script are not touched.
- Infinite reconnect with capped exponential backoff (250ms → 8s) and a visible reconnect badge in matched pages.
- One-line reload log on both server and client: `[hmr] reloaded <files> — <reason> — <ms> (<n> client(s))`.
- `extforge dev --verbose` prints per-change file detail.
- `extforge dev --once` runs a single dev build then exits (CI smoke).
- `HMR_STRATEGY` constant exposes the per-entry-point reload matrix as the single source of truth.
- Pure HMR client logic extracted to `src/core/hmr/client-logic.ts` with full unit-test coverage.

### Backwards compatibility (HMR)

No breaking changes. Old projects rebuilt against this version automatically inherit the new client. Old clients connecting to a new server still receive the same legacy message shapes (the new fields are optional). No `extforge.config.ts` changes required.

### Plugins

- New plugin API: `setup(ctx)` with hooks `onConfigResolved`, `onManifestTransform`, `onBuildStart`, `onBuildEntry`, `onBuildEnd`, `onDevReload`. Plugins are versioned via `apiVersion: 1`.
- Subpath export: `import { presetReact, type ExtForgePluginV1 } from 'extforge/plugins'`.
- First-party `presetReact()` ships built-in. Auto-injected when `framework: 'react'` is set; users may also pass it explicitly to override `jsxImportSource` or `jsxRuntime`.
- Plugin throws now produce `ExtForgeError(EXT_PLUGIN_FAILED)` carrying the plugin name and hook.
- Legacy thin plugin shape (`{ name, setup(config), buildStart, buildEnd }`) keeps working unchanged via a compatibility shim.

### Removed (internal)

- Hardcoded `jsxImportSource: 'react'` and `jsx: 'automatic'` in the builder. React JSX is now supplied by `presetReact()`.

### Backwards compatibility (Plugins)

No breaking changes. Existing configs continue to work; legacy plugins continue to load via a shim.

### Testing

- New subpath exports: `extforge/testing` (typed `chrome.*` fakes for `runtime`, `storage`, `tabs`, `action`, `scripting`) and `extforge/testing/vitest` (vitest setup-file preset that auto-installs fakes and resets them between tests).
- `installChromeFakes()` / `resetChromeFakes()` for granular control.
- Unmodeled `chrome.*` calls throw a clear "not modeled" error pointing at the docs.
- Scaffolded projects now ship a `vitest.config.ts` wired to the preset and an `extension.test.ts` with real, passing tests.
- New scaffold templates for Playwright E2E: `tests/e2e/fixture.ts` and `tests/e2e/smoke.test.ts`.

### Backwards compatibility (Testing)

No breaking changes. Existing scaffolded projects are unaffected; the new template applies only to projects created via `extforge init` from this version onward.

### Docs

- New documentation site at https://extforge.arshadshah.com (Astro Starlight on Cloudflare Pages).
- Auto-generated reference from code: configuration schema, error codes, plugin API. Drift-checked in CI.
- Hand-written guides: getting started, configuration, HMR, cross-browser, plugins, testing, deployment.
- README slimmed to a one-screen pitch. Old anchor IDs preserved (#features, #installation, #quick-start, #docs).
- Brand guidelines documented at /brand/guidelines.

### Backwards compatibility (Docs)

No breaking changes. Old README anchors still resolve.

### Backwards compatibility

No breaking changes. The Zod schema uses `.passthrough()` so unknown config keys still work today; they will become warnings in v0.4.0 and errors thereafter.

## [0.2.0] — 2026-04-30

### Added

- Centralized CLI error handler (`withErrorHandler`) with friendly messages, hint mapping for common failure modes (`EADDRINUSE`, missing templates, missing config, missing esbuild peer, permission errors), and `EXTFORGE_DEBUG=1` for full stack traces.
- Process-level guards: `unhandledRejection` and `uncaughtException` are now caught and formatted instead of dumping raw stack traces. `SIGINT`/`SIGTERM` exit cleanly.
- Scaffolded React projects now ship with an `ErrorBoundary` component (`src/components/ErrorBoundary.tsx`) and the popup template wraps its root render in it. Added `window.error` and `unhandledrejection` listeners in the popup entry.
- New scaffold template: `error-boundary.tsx.tpl`.

## [0.1.0] — 2026-04-30

Initial public release.

### Added

- `extforge init` — interactive project scaffolder (framework, CSS, browsers, entry points).
- `extforge dev` — esbuild-based dev server with WebSocket HMR for background, popup, side panel, and content scripts.
- `extforge build` — production builds for Chrome, Firefox, Safari, and Edge from a single config.
- `extforge validate` — project structure and manifest sanity checks.
- `extforge package` — store-ready `.zip` archives per browser.
- `extforge icons` — PNG generation from `icons/icon.svg` (sharp-cli or cairosvg).
- Programmatic API: `build`, `buildAll`, `createBuildContext`, `createHMRServer`, `validateProject`, `generateManifest`, `loadExtForgeConfig`.
- TypeScript typings shipped in `dist/core/index.d.ts`.
- HMR client auto-injected into ESM bundles via esbuild `banner`. Service worker context calls `chrome.runtime.reload()`; window contexts swap CSS hrefs in place and reload on JS changes.
- Free-port reservation for the HMR WebSocket server so the embedded client always points at the actual listening port.
