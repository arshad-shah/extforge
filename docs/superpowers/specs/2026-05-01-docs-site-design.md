# Design: Docs Site + Examples

**Date:** 2026-05-01 (deepened from outline)
**Status:** Approved for implementation planning
**Repo:** `Documents/practice/extforge`
**Track:** 5 of 5 (final)

## Problem

ExtForge has shipped four substantial tracks (DX polish, HMR robustness, plugin API, testing helpers). The README has grown into a wall of text and no longer scales. Users hitting a CLI error see `Docs: https://extforge.arshadshah.com/errors/EXT_BUILD_FAILED` and get a 404. We need a production-grade documentation site that:

1. Lives at `extforge.arshadshah.com` (Cloudflare Pages).
2. Documents every public surface — config, CLI, plugin API, testing helpers, error codes, brand.
3. Stays in sync with code via generated reference pages (config schema, error codes, plugin types).
4. Carries the ExtForge brand through theme, typography, and tone.
5. Is easy to extend. Future tracks add a new doc by writing one MDX file, not by wiring boilerplate.

## What "production-grade" means here

- **No 404s on CLI-emitted URLs.** Every error code referenced by `ExtForgeError` has a live page.
- **No drift between code and docs.** Config keys, error codes, and plugin hooks come from code at build time, not hand-maintained tables.
- **Searchable.** Built-in full-text search (Pagefind, ships with Starlight).
- **Mobile-readable.** Default Starlight theme is mobile-friendly; we don't break it.
- **Light + dark mode.** Auto-switches; both consume the brand tokens.
- **Per-PR preview deployments.** Cloudflare Pages does this for free via Git integration.
- **Builds in under 30 seconds.** Astro is fast; we don't load heavy media.
- **Real content, not placeholders.** Each section answers a real question a user would ask.

## Goals

- Static site under `docs-site/` deployed to Cloudflare Pages at `extforge.arshadshah.com`.
- Sections: Getting started, Guides, Configuration reference, CLI reference, Plugin API reference, Testing reference, Errors, Branding.
- Three core generators that emit MDX from code:
  - `gen-config-reference.ts` — walks the Zod schema in `src/core/config/schema.ts`.
  - `gen-error-codes.ts` — walks `src/core/errors/codes.ts`.
  - `gen-plugin-reference.ts` — walks the TypeScript types in `src/core/plugins/types.ts` via `ts-morph`.
- The brand kit (`brand/tokens.json`) is consumed at build time by an Astro CSS layer so colors and typography are single-source.
- README slimmed to a one-screen pitch + Quick start + link.
- Cloudflare Pages config (`wrangler.toml` / `_headers` / build command) committed.

## Non-goals

- **Versioned docs.** Single-version site for now. Revisit at v1.0.
- **Blog.** Not for v0.3.
- **Localization.** English only.
- **Live REPL / playground.** Not for v0.3.
- **Search-as-a-service** (Algolia, etc.). Pagefind is sufficient.
- **API docs for every internal helper.** Public surface only.

## Backwards compatibility

- New `docs-site/` directory at the repo root. No impact on the published `extforge` package — `docs-site/` is excluded via `.npmignore` (or by virtue of not being in `files`).
- README links update to point at the new docs site, but old README anchors (`#features`, `#installation`, etc.) keep resolving from the slimmed README so existing external links don't 404.
- No code changes outside `docs-site/` and `scripts/` (the generators).

---

## Architecture

### Framework

**Astro Starlight.** Reasons:
- Cloudflare Pages support is straightforward (`npm run build` produces `dist/`).
- MDX out of the box.
- Pagefind search built in.
- Sidebar/nav are config-driven (`astro.config.mjs`).
- Light + dark theming via CSS variables — easy brand override.
- Active project, predictable upgrades.

**Why not alternatives:**
- Nextra: heavier React tree, slower builds.
- Docusaurus: heavier, slower, opinions about translations we don't need.
- Plain Astro: would re-implement Starlight features (sidebar, search, on-page nav) by hand.

### Repo layout

```
docs-site/
  package.json                       # standalone — its own deps
  astro.config.mjs                   # Starlight config (sidebar, theme, site URL)
  tsconfig.json
  src/
    content.config.ts                # Astro content collection registration
    content/
      docs/
        index.mdx                    # landing page
        getting-started/
          install.mdx
          quick-start.mdx
          project-layout.mdx
        guides/
          configuration.mdx
          hmr.mdx
          cross-browser.mdx
          plugins.mdx
          testing.mdx
          deployment.mdx
        reference/
          config/                    # GENERATED from src/core/config/schema.ts
            index.mdx
            <key>.mdx
          cli/
            commands.mdx
            flags.mdx
          plugins/                   # GENERATED from src/core/plugins/types.ts
            api.mdx
            preset-react.mdx
          testing/
            chrome-fakes.mdx
            vitest-preset.mdx
            playwright.mdx
          errors/                    # GENERATED from src/core/errors/codes.ts
            index.mdx
            <CODE>.mdx
        brand/
          guidelines.mdx
    styles/
      brand.css                      # generated from brand/tokens.json
      overrides.css                  # Starlight theme overrides
    assets/
      logo.svg                       # symlink/copy of /brand/logo-wordmark.svg
      logo-dark.svg
      favicon.svg
  public/
    _headers                         # Cloudflare Pages headers (security, cache)
    _redirects                       # `/errors → /reference/errors` etc.
scripts/
  gen-config-reference.ts            # NEW
  gen-error-codes.ts                 # NEW
  gen-plugin-reference.ts            # NEW
  gen-brand-css.ts                   # NEW — emits docs-site/src/styles/brand.css from brand/tokens.json
  gen-docs.ts                        # NEW — orchestrator: runs all four generators
.github/workflows/
  docs.yml                           # NEW — typecheck + build the docs on every PR
```

The repo gains a top-level pnpm workspace at `pnpm-workspace.yaml`:

```yaml
packages:
  - .
  - docs-site
```

The main package's `prepublishOnly` is unchanged. Docs build is independent.

### Generators

All generators are TypeScript files runnable via `tsx`. They're invoked by `pnpm docs:gen` (added as a top-level script). The Cloudflare Pages build command runs `pnpm docs:gen && pnpm --filter docs-site build` so the generators always fire pre-build.

Each generator writes to a known directory under `docs-site/src/content/docs/reference/`. Generated files are committed to the repo (so the docs site can be built standalone in CI without running the generators); the generators are idempotent and a CI step asserts no diff after `pnpm docs:gen` (catches drift in PRs that change source without regenerating).

#### `gen-config-reference.ts`

Imports `extForgeConfigSchema` from `src/core/config/schema.ts`. For each field, emits an MDX page with:

- Path (`browsers`, `dev.port`, etc.)
- Type (`'chrome' | 'firefox' | 'edge' | 'safari'`, etc.)
- Default value
- Whether it's deprecated
- A short description (sourced from a sidecar `src/core/config/schema-docs.ts` map — schema doesn't carry descriptions; we maintain them in one place close to the schema).

#### `gen-error-codes.ts`

Walks `ERROR_CODES` from `src/core/errors/codes.ts`. For each code, emits one MDX page at `reference/errors/<CODE>.mdx`. The page has:

- Code identifier (`EXT_CONFIG_INVALID`)
- Title and one-line description
- "When you see this" — circumstances that produce the error
- "How to fix" — actionable steps

The descriptions come from a sidecar `src/core/errors/error-docs.ts` map.

#### `gen-plugin-reference.ts`

Uses `ts-morph` to parse `src/core/plugins/types.ts`. For each interface (`PluginContext`, `PluginHooks`, `EntryDescriptor`, `ExtForgePluginV1`, `ExtForgePluginLegacy`), emits a section in `reference/plugins/api.mdx` with the field list, types, and JSDoc comments (which we add to the source as part of this track).

Also emits `reference/plugins/preset-react.mdx` with `PresetReactOptions` parsed similarly.

#### `gen-brand-css.ts`

Reads `brand/tokens.json` and emits `docs-site/src/styles/brand.css` with CSS variables in two scopes (light root, `[data-theme=dark]`). The Starlight theme is overridden in `docs-site/src/styles/overrides.css` to consume these variables.

### Hand-written content

These are NOT generated; they're written by hand and committed:

- `getting-started/install.mdx` — install with pnpm/npm/yarn/bun, prerequisites, what `extforge init` does.
- `getting-started/quick-start.mdx` — minute-zero to first reload.
- `getting-started/project-layout.mdx` — what each src/ subdir means.
- `guides/configuration.mdx` — narrative tour of `extforge.config.ts`. Links to generated reference for each key.
- `guides/hmr.mdx` — what reloads when, the strategy matrix, troubleshooting reconnect badge, --once.
- `guides/cross-browser.mdx` — declaring browsers, MV3 quirks per browser, the compat checker, suppressions.
- `guides/plugins.mdx` — author your first plugin, hook reference summary, presets, ordering.
- `guides/testing.mdx` — install the preset, write a unit test, write an E2E test with Playwright.
- `guides/deployment.mdx` — packaging for stores (`extforge package`), zip output, store-specific notes.
- `reference/cli/commands.mdx` — every subcommand with args and example output. NOT auto-generated (citty doesn't expose introspection cleanly); maintained by hand.
- `reference/cli/flags.mdx` — global flags (`--quiet`, `--json`, `--strict`).
- `brand/guidelines.mdx` — distilled from `brand/voice.md`.

### Theme

`docs-site/src/styles/overrides.css` overrides Starlight's CSS variables to match the brand:

```css
:root {
  --sl-color-accent:        #5B21B6;
  --sl-color-accent-high:   #FBBF24;
  --sl-color-text-accent:   #5B21B6;
  /* ... */
}
[data-theme='dark'] {
  --sl-color-accent:        #A78BFA;
  --sl-color-accent-high:   #FBBF24;
  /* ... */
}
```

`brand.css` (generated) provides the raw tokens; `overrides.css` (hand-written) maps them onto Starlight's variables.

The hero on `index.mdx` uses the wordmark logo with a one-line tagline ("The build system for Manifest V3 browser extensions") and three CTA buttons (Get started · GitHub · Configuration reference).

### Cloudflare Pages

- **Build command:** `pnpm install && pnpm docs:gen && pnpm --filter docs-site build`
- **Build output directory:** `docs-site/dist`
- **Root directory:** `/` (repo root)
- **Node version:** 20
- **Custom domain:** `extforge.arshadshah.com` — configured in Cloudflare dashboard (out of scope for code; we ship docs telling the user how to wire it).
- **Per-PR previews:** automatic via Cloudflare's GitHub integration. The generated URL appears as a check.

`docs-site/public/_headers` sets sensible defaults:

```
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: interest-cohort=()

/_pagefind/*
  Cache-Control: public, max-age=31536000, immutable
```

`docs-site/public/_redirects`:

```
/errors  /reference/errors  301
/errors/:code  /reference/errors/:code  301
/config  /reference/config  301
/plugins  /reference/plugins/api  301
/testing  /reference/testing/chrome-fakes  301
```

These match the URLs the CLI emits (`https://extforge.arshadshah.com/errors/EXT_BUILD_FAILED`).

### CI

`.github/workflows/docs.yml` runs on PRs that touch `docs-site/`, `scripts/gen-*.ts`, `src/core/{config,errors,plugins}/`, or `brand/`:

```yaml
name: Docs
on:
  pull_request:
    paths: ['docs-site/**', 'scripts/gen-*', 'src/core/config/**', 'src/core/errors/**', 'src/core/plugins/**', 'brand/**']
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm docs:gen
      - name: Check generated content is up to date
        run: git diff --exit-code docs-site/src/content/docs/reference || (echo "::error::Run \`pnpm docs:gen\` and commit the result"; exit 1)
      - run: pnpm --filter docs-site build
```

(Cloudflare Pages handles deployment; the GitHub workflow only validates.)

---

## File layout summary (new)

```
docs-site/                                # Astro Starlight project (own pnpm workspace)
  package.json
  astro.config.mjs
  tsconfig.json
  src/
    content.config.ts
    content/docs/                         # ~25 MDX files (mix of hand-written + generated)
    styles/
      brand.css                           # GENERATED
      overrides.css                       # hand-written
    assets/
      logo.svg, logo-dark.svg, favicon.svg
  public/
    _headers
    _redirects
scripts/
  gen-brand-css.ts
  gen-config-reference.ts
  gen-error-codes.ts
  gen-plugin-reference.ts
  gen-docs.ts                              # orchestrator
src/core/config/schema-docs.ts             # NEW — descriptions for schema fields
src/core/errors/error-docs.ts              # NEW — descriptions for each error code
pnpm-workspace.yaml                        # NEW
.github/workflows/docs.yml                 # NEW
```

## Key decisions

- **Generated files are committed.** Allows `pnpm --filter docs-site build` to work without running TypeScript generators (Cloudflare Pages doesn't need `tsx`). The CI drift check enforces freshness.
- **One workspace, one lockfile.** pnpm workspaces; the docs site declares its own deps.
- **Sidecar docs maps.** Field/error descriptions live in TS files (typed, refactor-safe) rather than schema annotations or comments-as-docs. Closer to the schema than the docs site, easy to find.
- **Default Starlight visuals, brand tokens injected.** No custom layout components in v1 — keep visual surface area small.
- **CLI reference is hand-written.** citty doesn't expose introspection in a stable way; we maintain it.

## Open questions resolved

- **Custom domain wiring**: documented in the Deployment guide; the user configures it in the Cloudflare dashboard.
- **Search**: Pagefind, default Starlight integration. No external service.
- **Navigation**: sidebar groups match the section folders. Astro Starlight infers most of it; we tweak a few orderings in `astro.config.mjs`.
- **Examples folder**: deferred. The Quick Start and Guides are example-rich. A separate examples/ folder gets revisited at v1.0.

## Success criteria

- `pnpm docs:gen && pnpm --filter docs-site build` produces a site that loads in Astro's preview server.
- Every error code emitted by `ExtForgeError.docsUrl` resolves to a live page.
- The site uses brand colors in both light and dark mode.
- Cloudflare Pages preview URL works on a PR.
- No links in the site 404 (Starlight has a link checker; verify it passes).
- README is under 100 lines, points at the docs site, preserves prior anchor IDs.
- The docs CI workflow passes on a clean PR.
