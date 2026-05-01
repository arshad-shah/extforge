# Design: Docs Site + Examples

**Date:** 2026-05-01
**Status:** Outline — to be deepened before implementation
**Repo:** `Documents/practice/extforge`
**Track:** 5 of 5 (last, so it documents a stable surface)

## Problem

A long README is fine until a project has more than a few primitives. ExtForge will, by track 4, have a config schema, plugin API, testing helpers, and an error-code registry — none of which are discoverable from a single scrolling document. A real docs site lets users land on the page they need (e.g., `/errors/EXT_MANIFEST_MISSING_ICON` from a CLI link), reduces the README to a concise pitch, and gives examples a stable home.

## Goals

- Static docs site under `docs-site/` deployed to **Cloudflare Pages**.
- Sections: Getting Started, Guides, Config Reference (auto-generated from the Zod schema in track 1), Plugin API Reference (auto-generated from TS types in track 3), Errors (one page per code), Recipes, Migration.
- An `examples/` folder in the repo with one runnable example per supported framework (React, Vue, Svelte, Solid, vanilla) and one per "interesting" use case (page-realm interceptor, side panel, declarative net request).
- README slimmed to a pitch + quick start + link.

## Non-goals

- Versioned docs. Single-version site for now; revisit at v1.0.
- A blog or changelog rendered into the site (CHANGELOG.md stays in repo for now).
- Search-as-a-service (use the framework's built-in search).
- Localization.

## Backwards compatibility

- Docs site is additive. README keeps a working quick start that does not depend on the docs site being live.
- Existing links in README to fragment anchors (`#features`, etc.) keep working — the slim README preserves those anchor IDs or 301s them via the README's own structure (we control it).

## Approach (sketch)

**Framework choice:** Astro Starlight.
- Cloudflare Pages support is straightforward (`npm run build` → `dist/`).
- MDX out of the box for embedding diagrams and live snippets.
- Built-in search (Pagefind) — no third-party service.
- Sidebar/navigation and theming are config-driven.
- Trade-off vs. Nextra: less React-coupled; vs. Docusaurus: lighter and faster to build.

**Repo layout:**

```
docs-site/                # Astro Starlight project
  src/content/docs/
    index.mdx
    getting-started/
    guides/
    config/               # generated from Zod schema
    plugins/              # generated from TS types
    errors/               # generated from src/core/errors/codes.ts
    recipes/
    migration/
  astro.config.mjs
examples/
  react-popup/
  vue-sidepanel/
  vanilla-content-script/
  page-realm-interceptor/
  ...
.github/workflows/docs.yml   # build only; deploy via Cloudflare Pages Git integration
```

**Generation:** A small `scripts/gen-docs.ts` runs in CI before the Astro build. It:
- Walks the Zod schema and emits `config/<key>.mdx`.
- Walks `src/core/errors/codes.ts` and emits `errors/<CODE>.mdx`.
- Walks the `ExtForgePlugin`/`PluginContext` types via `ts-morph` and emits `plugins/api.mdx`.

**Deployment:** Cloudflare Pages reads `docs-site/` as the build root. Build command `pnpm --filter docs-site build`, output `docs-site/dist/`. Custom domain `extforge.dev` (or whatever is registered; placeholder URL in CI until decided). Preview deployments per PR via Cloudflare's Git integration.

## Key decisions to make in the plan

- Domain. Until the user picks one, the site lives on the default `*.pages.dev` URL.
- Whether examples are part of `pnpm` workspaces (linked to the local ExtForge build) or pinned to a published version. **Lean:** workspace-linked in the repo so they break loudly when ExtForge changes; pin only in the standalone examples repo if we ever spin one out.
- Whether the docs build runs on every PR or only on main. **Lean:** every PR (Cloudflare preview deployments are free and useful).

## Open questions

- Do we want a CLI link integration (`extforge --help` references docs URLs)? Yes — already wired through `ExtForgeError.docsUrl` in track 1.
- Do we generate API docs from TSDoc comments or from raw types? `ts-morph` over types is more reliable; TSDoc enriches it.

## Success criteria

- Site builds cleanly on Cloudflare Pages from a clean clone.
- `extforge` CLI errors link to live docs pages and the links resolve (200, not 404).
- Every config key, every error code, and every plugin hook has a generated page; nothing hand-maintained drifts from source.
- README is under 100 lines and points at the docs site.
- Each example in `examples/` builds and runs against the workspace-linked ExtForge.
