# Contributing to ExtForge

Thanks for your interest. This file is a quick orientation for hacking on
ExtForge. The full code-of-conduct lives in
[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md); the security disclosure
process lives in [SECURITY.md](./SECURITY.md).

## Local setup

The repo is a pnpm workspace. Node `>=20` and pnpm `10.x` are required
(`packageManager` in `package.json` is the source of truth).

```bash
pnpm install
pnpm typecheck                          # tsc --noEmit
pnpm lint                               # eslint flat config
pnpm test                               # vitest run (happy-dom)
pnpm build                              # tsup -> dist/

pnpm docs:dev                           # docs site at http://localhost:4321
pnpm examples:build                     # build example extensions
pnpm test:e2e                           # Playwright e2e against built fixtures
```

A single sequence that mirrors what CI runs:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

CI runs the same matrix on Node 20 / 22 / 24, plus e2e on Ubuntu and macOS.

## Project layout

```
src/
  cli/         extforge CLI entry, scaffolder, commands
  core/        public API surface
    config/    config schema + loader
    plugins/   plugin pipeline + first-party plugins
    storage/   typed chrome.storage wrapper (+ react bindings)
    messaging/ typed runtime messaging + ports
    csui/      content-script UI runtime (Shadow DOM mount)
    env/       .env loading with Vite-style precedence
    testing/   chrome.* fakes + vitest preset
    logger/    structured logger
    compat/    MDN BCD-driven compat checker
    errors/    error catalog
tests/         vitest specs grouped by module
tests-e2e/     Playwright e2e against built fixtures
examples/      example extensions (vanilla-popup, react-csui, ...)
docs-site/     Astro Starlight documentation site
scripts/       doc/codegen scripts (gen-*.ts)
```

## Coding rules

These rules exist because they are paid for by past incidents. Don't
relax them without discussion in an issue first.

- **Minimal runtime dependencies in `src/core/`.** Today the runtime
  surface depends only on `esbuild`, `ws`, and `zod`. New runtime deps
  need a justification in the PR.
- **Cross-browser parity.** Anything that calls `chrome.*` at runtime
  must work on the documented browser matrix (Chrome, Firefox, Safari,
  Edge — MV3). If a feature is unavailable on a browser, the build
  must surface that, not silently swallow it.
- **Manifest writes are append-only.** Plugins compose into the manifest
  through the documented hooks; no plugin reaches into the output
  directory to rewrite `manifest.json` after emit.
- **No `innerHTML` for user-derived content in CSUI runtime.** The CSUI
  mount creates DOM nodes; user-supplied strings go through
  `textContent`.
- **SSR-safe imports.** Anything in `src/core/` must not touch `chrome`,
  `document`, or `window` at module top-level. Touch them inside
  functions/classes that are only called at runtime.
- **Public API stability.** Anything exported from `src/core/index.ts`
  or the subpath entries (`extforge/storage`, `extforge/messaging`,
  `extforge/csui`, `extforge/env`, `extforge/testing`, `extforge/logger`,
  `extforge/plugins`) is the public API. Renames or removals are
  breaking changes; ship them with a Changeset marked `major`.
- **Type-first.** Every public surface change ships with updated types
  and TSDoc comments so the generated reference stays useful.

### Tests

- Every bug fix lands with a regression test that fails on the previous
  code.
- New first-party packages ship with a behaviour test under `tests/` and
  an example consumer (or extension to an existing example).
- E2E specs cover real extension runtime: HMR reload paths, CSUI
  mounting, storage round-trips. Add an e2e spec when changing any of
  those surfaces.

### Generated content

Several reference pages are generated. Re-run the generator and commit
the output when the source changes:

```bash
pnpm docs:gen                # all of the below
pnpm docs:gen:brand          # brand tokens -> brand.css
pnpm docs:gen:config         # config schema -> reference
pnpm docs:gen:errors         # error catalog -> reference
pnpm docs:gen:plugins        # plugin API -> reference
```

CI fails if the committed output drifts from the generator.

## Changesets

ExtForge uses [Changesets](https://github.com/changesets/changesets) for
versioning and changelogs. **Every user-visible change needs a
changeset.**

```bash
pnpm changeset
```

Pick a bump level (patch / minor / major) and write a short, user-facing
note. Commit the `.changeset/*.md` file with your PR. When the PR merges,
Changesets opens a "Version Packages" PR; merging that PR publishes to
npm via the `release.yml` workflow.

## Sending a PR

1. Fork the repo and branch from `main`.
2. Make focused commits. Conventional commit prefixes (`feat:`, `fix:`,
   `docs:`, `chore:`, `refactor:`, `test:`, `ci:`) help future-you read
   the log.
3. Run `pnpm typecheck && pnpm lint && pnpm test && pnpm build` locally
   before pushing.
4. Add a changeset (`pnpm changeset`).
5. Open a PR using the template. CI runs the full matrix, e2e, audit,
   and CodeQL.
6. Address review feedback and keep the branch up to date with `main`.

## Releases

Releases are fully automated by Changesets:

1. A PR lands on `main` with one or more `.changeset/*.md` files.
2. `release.yml` opens (or updates) a "Version Packages" PR that bumps
   `package.json`, regenerates `CHANGELOG.md`, and deletes the consumed
   changesets.
3. Merging that PR triggers `release.yml` again, which publishes to npm
   with provenance via OIDC trusted publishing and creates a GitHub
   Release.
4. Optionally, the GitHub Release also fires `publish.yml` which mirrors
   the package to GitHub Packages.

Versions follow [SemVer](https://semver.org/). Until 1.0.0, minor bumps
may include breaking changes — the changeset note should call them out.
