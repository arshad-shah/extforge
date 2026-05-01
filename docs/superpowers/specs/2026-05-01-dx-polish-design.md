# Design: Developer-Experience Polish

**Date:** 2026-05-01
**Status:** Approved for implementation planning
**Repo:** `Documents/practice/extforge`
**Track:** 1 of 5 (DX polish → HMR robustness → Plugin API → Testing helpers → Docs site)

## Goal

Make every interaction with the ExtForge CLI feel deliberate, informative, and forgiving. When a user misconfigures something, we point at the offending file and line, explain the problem in plain language, and suggest a concrete fix. When the build runs, output is grouped, predictable, and quiet on success. When something is wrong with the user's environment (Node version, missing icons, port in use, stale `dist/`), `extforge doctor` tells them in one place.

This is the first track because it raises the perceived quality of every other feature without changing any architecture.

## Non-goals

- New build features, plugin hooks, or HMR changes (those are tracks 2 and 3).
- Replacing `consola` or the existing logger module — we extend it.
- Localizing CLI output. English only for now.
- Telemetry. Nothing phones home.

## Backwards-compatibility constraint

This track must not break a single existing extension. All changes are additive:

- No `extforge.config.ts` shape changes. Existing configs keep working unchanged.
- Stricter validation runs in **warn mode by default** for one minor version, then promotes to error in the next minor with a clear deprecation message that names the offending field and the fix.
- `extforge doctor` is a new subcommand. Nothing in the existing pipeline calls it.
- New flags (`--strict`, `--quiet`, `--json`) default to today's behavior.

---

## Pieces

### 1. Typed config validation with pretty errors

**Today:** `src/core/config.ts` loads `extforge.config.ts` via `c12` and merges defaults via `defu`. Invalid fields silently pass through; the user discovers problems later as confusing build errors.

**Change:** Add a Zod schema that mirrors the public `ExtForgeConfig` type. After `c12` resolves the config, validate against the schema. On failure, format errors with file path, JSON path (`manifest.permissions[2]`), the bad value, the expected shape, and a one-line suggestion.

Example output:

```
✖ extforge.config.ts is invalid

  manifest.permissions[2]
    expected: string (valid Chrome permission)
    received: "tabz"
    suggestion: did you mean "tabs"?

  browsers[0]
    expected: one of "chrome" | "firefox" | "edge" | "safari"
    received: "brave"
    suggestion: Brave is Chromium-based; use "chrome" and load the dist/chrome/ folder in Brave.

Fix these and re-run. (See https://extforge.dev/config for the full schema.)
```

The schema lives at `src/core/config/schema.ts`. The pretty formatter lives at `src/core/config/format-errors.ts`. The schema is the source of truth — the existing TS types are derived from it via `z.infer`.

For backwards compat: unknown top-level keys produce a **warning**, not an error, in this release. They become errors in the following minor.

### 2. Actionable build errors

**Today:** esbuild errors and manifest validation errors print as raw exceptions or terse messages.

**Change:** A central `src/core/errors/` module with a small `ExtForgeError` class:

```ts
class ExtForgeError extends Error {
  code: string;          // e.g. "EXT_MANIFEST_MISSING_ICON"
  file?: string;         // absolute path
  line?: number;
  column?: number;
  hint?: string;         // one-line suggestion
  docsUrl?: string;      // anchored URL to the docs site
}
```

The CLI's `error-handler.ts` recognizes `ExtForgeError` and renders it with the format above. esbuild errors are caught in the builder and wrapped (`code: "EXT_BUILD_FAILED"`, `file/line/column` from esbuild's `location`).

Every error code is documented at `docs-site/errors/<code>` (track 5). Until the docs site exists, `docsUrl` is omitted gracefully.

### 3. `extforge doctor` command

A new CLI subcommand that runs a battery of read-only checks and prints a grouped report. It exits 0 if all checks pass or only warn, and 1 if any check is critical.

Checks (each is a small async function in `src/core/doctor/checks/`):

| Check | Severity on fail |
|---|---|
| Node ≥ 20 | critical |
| Package manager detected (npm/pnpm/yarn/bun) | info |
| `extforge.config.ts` parses and validates | critical |
| Required icons present at sizes declared in manifest | warn |
| `dist/` is gitignored | warn |
| HMR port (default 8765) is free | warn |
| `manifest.permissions` only contains known Chrome permissions | warn |
| Browser-specific overrides reference declared browsers | warn |
| Cross-browser API usage matches declared target browsers | warn |
| `package.json` has the recommended `dev`/`build`/`package` scripts | info |
| No leftover `dist/` from a different ExtForge major version | warn |

Each check returns `{ name, status: 'pass' | 'warn' | 'fail' | 'info', message, hint? }`. The report is grouped by status. `--json` emits machine-readable output for CI.

### 4. Consistent CLI output

**Today:** `consola` is used unevenly. Some places `console.log` directly. Spinners are inconsistent.

**Change:** A thin internal façade over `consola` at `src/core/logger/cli.ts` exposing `group(title)`, `step(name, fn)`, `success`, `warn`, `error`, `summary(stats)`. All CLI commands route through it. Behavior:

- TTY: color, spinners on `step`, grouped output.
- Non-TTY (CI, piped): no color, no spinners, plain timestamped lines.
- `--quiet`: suppress info and step lines; warnings and errors still print.
- `--json`: machine-readable event stream (one JSON object per line) — for `doctor`, `validate`, and `build`.

Build-end summary (replaces today's terse "Built in 42ms"):

```
✔ Build complete in 412ms
  ├─ chrome   →  dist/chrome    (12 files, 184 KB)
  ├─ firefox  →  dist/firefox   (12 files, 186 KB)
  └─ edge     →  dist/edge      (12 files, 184 KB)
```

### 5. Cross-browser API compatibility check

**Today:** Nothing stops a developer from calling `chrome.declarativeNetRequest.updateDynamicRules` in a project that targets Safari, where the API doesn't exist. The mismatch surfaces only at runtime, in the wrong browser, often weeks later.

**Change:** During build, walk each entry's AST and check every `chrome.X.Y(...)` and `browser.X.Y(...)` member access against the compatibility matrix for the project's declared target browsers. Emit one warning per unsupported call site with file, line, column, the API, the browsers that support it, and the browsers that don't.

**Data source:** `@mdn/browser-compat-data`, scoped to the `webextensions.api.*` subtree (we don't ship the whole BCD payload — a build step extracts only the webextensions slice into `src/core/compat/data.json` to keep install size reasonable). The dep is bumped on a regular cadence; users get up-to-date support data by upgrading ExtForge.

**Where it runs:**
- `extforge build` and `extforge dev` — runs in-process during bundling, adds a single AST visitor pass per entry. Warnings are grouped under one `[compat]` section in the build summary.
- `extforge validate` — runs the same check, exits 1 only with `--strict`.
- `extforge doctor` — includes a summary line: "3 cross-browser compat warnings — run `extforge validate` for details."

**Severity:** warning by default. The build succeeds with warnings printed. Opt-in escalation via `--strict` (or `dev.strictCompat: true` in the config) turns warnings into errors.

**Per-line opt-out:** A leading-line comment suppresses the warning for the next statement, with a required reason:

```ts
// extforge-ignore-compat: gated behind isFirefox check below
chrome.declarativeNetRequest.updateDynamicRules(...)
```

The reason is required (enforced by the linter) so reviewers see why the suppression exists. Suppressions without a reason still warn.

**False positives:** runtime feature-detection (`if (chrome.sidePanel) { ... }`) is intentionally not detected as "safe usage" — too easy to get wrong. The opt-out comment is the documented escape hatch.

**Output example:**

```
[compat] 2 unsupported APIs found

  src/background.ts:42:3
    chrome.declarativeNetRequest.updateDynamicRules
    supported in: chrome ✓  edge ✓  firefox ✓
    unsupported in: safari ✗
    suggestion: gate the call behind a runtime check, or add
    "// extforge-ignore-compat: <reason>" if intentional.

  src/sidepanel.ts:8:1
    chrome.sidePanel.open
    supported in: chrome ✓  edge ✓
    unsupported in: firefox ✗  safari ✗
```

**File layout addition:**

```
src/core/compat/
  index.ts          # NEW — visitor + checker
  data.json         # NEW — extracted webextensions slice of BCD
  build-data.ts     # NEW — extraction script run at ExtForge release time
  suppressions.ts   # NEW — parses // extforge-ignore-compat comments
tests/
  compat.test.ts    # NEW
```

### 6. Deprecation & upgrade ergonomics

To keep the "no breaking changes" promise visible:

- Every soft-deprecated config key prints `⚠ extforge.config.ts: <key> is deprecated; use <replacement> instead. This will become an error in v0.4.0.` at most once per process.
- A new `extforge upgrade` command (stub in this track, real in track 3) reads the user's config and offers codemods. In track 1 it just prints "Your config is up to date." or "1 deprecation found — see above." It is **not** automatic.

---

## File layout

```
src/core/
  config.ts                    # existing, refactored to use schema
  config/
    schema.ts                  # NEW — Zod schema, source of truth for types
    format-errors.ts           # NEW
  errors/
    index.ts                   # NEW — ExtForgeError class + codes
    codes.ts                   # NEW — typed error code registry
  compat/
    index.ts                   # NEW — AST visitor + per-call lookup
    data.json                  # NEW — extracted webextensions BCD slice
    build-data.ts              # NEW — extraction script (release-time)
    suppressions.ts            # NEW — // extforge-ignore-compat parser
  doctor/
    index.ts                   # NEW — runner
    checks/                    # NEW — one file per check
      node-version.ts
      config-valid.ts
      icons-present.ts
      port-free.ts
      ...
  logger/
    cli.ts                     # NEW — façade over consola
src/cli/
  index.ts                     # add `doctor`, `upgrade` subcommands
  error-handler.ts             # render ExtForgeError nicely
tests/
  doctor.test.ts               # NEW
  config-schema.test.ts        # NEW
  errors.test.ts               # NEW
  compat.test.ts               # NEW
```

## Testing

- Unit tests for each doctor check, with fakes for fs/network where needed.
- Snapshot tests for error formatting (config errors, build errors, doctor report).
- One end-to-end test that runs `extforge doctor` against the fixtures in `tests/fixtures/` and asserts on grouped output.
- Existing tests continue to pass without modification — that's the backwards-compat gate.

## Open questions

1. Do we want `extforge doctor --fix` in this track (auto-add missing icon sizes, update gitignore)? **Recommendation:** no — defer to track 3 once the plugin/codemod machinery exists.
2. Error code naming: `EXT_BUILD_FAILED` vs. `extforge/build-failed`. **Recommendation:** `EXT_*` prefix with SCREAMING_SNAKE — matches Node convention, easy to grep.
3. Should `--json` output be stable enough to depend on in CI scripts? **Recommendation:** yes; document the schema and version it (`{ "version": 1, ... }`).
4. Compat data extraction: run on every `pnpm install` of ExtForge, or commit the extracted `data.json` to the repo? **Recommendation:** commit it. Reproducible builds, no install-time work, and the diff is reviewable when BCD updates.
5. Whether to detect computed access like `chrome[apiName].method()`. **Recommendation:** no — too dynamic to reason about; the opt-out comment covers these.

## Success criteria

- A user with a typo in `extforge.config.ts` sees the typo, the path, and a fix suggestion within 200ms of running any command.
- `extforge doctor` runs in under one second on a typical project and produces a useful report.
- Every code path that previously called `console.log` or threw a raw `Error` now goes through the logger façade or `ExtForgeError`.
- A test fixture targeting `chrome` + `safari` that calls a Safari-unsupported API produces a warning with file/line; the same fixture builds successfully without `--strict` and fails the build with `--strict`.
- All existing tests pass; new tests cover doctor, schema, and error formatting.
- Zero breaking changes — verified by running an existing extension repo (e.g., the Request Interceptor) against the new build.
