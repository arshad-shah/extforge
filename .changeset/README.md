# Changesets

This directory holds the queue of pending releases for the `extforge` package.
Adding a changeset is how a contributor declares their intent for the next
release: which version bump (major / minor / patch), and what the user-facing
release note will read.

## Quick start

```bash
pnpm changeset            # create a new changeset interactively
pnpm changeset version    # apply pending changesets, bump versions, regenerate CHANGELOG.md
pnpm release              # publish the bumped version to npm (CI usually does this)
```

## When you change code

If the change is user-visible — public API surface, behavior, types, runtime
output — add a changeset:

```bash
pnpm changeset
```

Pick:

- **patch** — bug fix, doc-only, internal refactor with no observable difference
- **minor** — new feature, new public API surface, additive change with full back-compat
- **major** — anything that breaks an existing user (config shape, removed
  exports, changed defaults). Pre-1.0, prefer minor + a deprecation pass first

The CLI prompts for a description. Aim for a sentence the reader of the
GitHub release notes can act on. Examples:

> `extforge/csui` now auto-mounts on import — `export default defineCSUI(...)` works without a separate `mountCSUI()` call.

> Drop `picocolors` runtime dependency. Internal terminal colors moved to a 50-LOC `src/core/logger/ansi.ts`. No public API change.

## When NOT to add a changeset

- Pure repo housekeeping with zero user impact (`.gitignore`, CI workflows,
  contributor docs, the docs site itself, internal test fixtures).
- Branch-internal commits while a feature is still in flight — collapse the
  whole feature into one changeset before merging.

## What gets ignored

`.changeset/config.json` declares `extforge-docs`, the example apps, and the
e2e test runner as `ignore`d packages — they're private workspace projects
that are never published to npm and don't need version tracking.
