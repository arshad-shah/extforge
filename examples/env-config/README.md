# env-config example

Demonstrates [`extforge/env`](https://extforge.arshadshah.com/reference/runtime/env/):
loading `.env` files at build time and inlining `EXTFORGE_PUBLIC_*` values into
the bundle.

## What it shows

- **Public vs. private keys.** `.env` defines two inlinable keys
  (`EXTFORGE_PUBLIC_API_BASE`, `EXTFORGE_PUBLIC_FEATURE_FLAG`) and one private
  key (`EXTFORGE_BACKEND_TOKEN`). Only the public ones are replaced with string
  literals in the bundle; the private one is `undefined` in client code.
- **Build metadata.** `import.meta.env.MODE` / `PROD` / `DEV` are populated by
  ExtForge (`production` for `build`, `development` for `dev`).
- **Typing.** `src/env.d.ts` declares the keys so `import.meta.env.*` is typed.

The popup renders each value; the background service worker logs the API base.

## Run it

```bash
# From the repo root (builds the workspace extforge first):
pnpm build
pnpm -C examples/env-config build

# Then load dist/chrome/ as an unpacked extension, or use dev mode:
pnpm -C examples/env-config dev
```

## .env files & precedence

`extforge/env` reads, in increasing priority:

1. `.env`
2. `.env.local`
3. `.env.<mode>` (`.env.production` / `.env.development`)
4. `.env.<mode>.local`
5. `process.env`

This example commits `.env` because it holds only public, non-secret demo
values. Put real secrets in `.env.local` (gitignored) — and remember that only
`EXTFORGE_PUBLIC_*` keys ever reach the browser.
