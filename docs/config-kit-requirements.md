# What `@arshad-shah/config-kit` needs to power ExtForge's config

During the v1 prep we evaluated replacing ExtForge's config loader
(`src/core/config.ts` + `src/core/config/loader.ts`) with
[`@arshad-shah/config-kit`](https://www.npmjs.com/package/@arshad-shah/config-kit).
We **deferred** it: config-kit (v1.0.2) is built for *environment-style* config
and can't yet model ExtForge's config. This doc captures the gaps so config-kit
can grow to support this use case "for everyone" — any tool whose config is a
**module that exports a nested object**, not a flat env map.

## The mismatch in one sentence

config-kit sources return `Record<string, string | undefined>` (flat strings)
and the schema is expected to coerce strings via `z.coerce.*`. ExtForge's config
is a **nested object that can contain functions** (`plugins`), arrays
(`browsers`, `content_scripts`), and sub-objects (`manifest`, `build`, `dev`) —
loaded from `extforge.config.{ts,js,mjs,cjs,json}`.

## Gaps, most-impactful first

### 1. Sources that return structured values (the unlock)

Today:

```ts
type ConfigSource = {
  name: string;
  load: () => Record<string, string | undefined> | Promise<…>;
};
```

Needed: a source variant whose `load()` may return `Record<string, unknown>`
(arbitrary nested values, including functions). This single change unlocks
module-based config. Suggested shape:

```ts
type StructuredSource = {
  name: string;
  structured: true;                       // discriminator
  load: () => unknown | Promise<unknown>;  // returns the module's default export
};
```

`loadConfig` would skip string-coercion and value-redaction for structured
sources.

### 2. A built-in module/config-file source

ExtForge needs to load and execute a TS/ESM/CJS/JSON config file. A built-in
would serve every tool with a `*.config.*` file:

```ts
configFileSource({
  name: 'extforge',                                   // → extforge.config.*
  cwd: process.cwd(),
  extensions: ['ts', 'js', 'mjs', 'cjs', 'json'],     // first match wins
  // TS/ESM compiled on the fly (esbuild/jiti) — config-kit could accept a
  // user-supplied `load` transform so it doesn't hard-depend on a compiler.
})
```

It should: discover the first existing candidate walking up from `cwd`, import
it, and return `default` (or `module.exports`). Missing file → empty (soft), so
defaults apply — mirrors `dotenvFileSource`'s ENOENT handling.

### 3. Deep-merge strategy for structured sources

ExtForge deep-merges plain-object keys (`dev`, `build`) against defaults but
**replaces** arrays and primitives wholesale. config-kit's current merge is a
flat last-wins per key. Needed: a configurable merge for structured sources:

- deep-merge plain objects,
- replace arrays and primitives,
- and a `staticSource`-style **defaults** layer that participates in the deep
  merge (not just key-level override).

### 4. Strict-by-default with a documented opt-out

ExtForge (as of v1) throws on invalid config by default and downgrades to a
warning when `EXTFORGE_STRICT_CONFIG=0`. config-kit always throws. Needed: a
`mode: 'strict' | 'warn'` (or `onValidationError`) so the host can choose, plus
pass-through of the raw validation error.

### 5. Host-controlled error formatting

ExtForge renders Zod errors with the config file path and a one-line hint
(`formatZodError`). config-kit redacts values and throws its own message.
Needed: either surface the original `ZodError`/issues to an `onValidationError`
hook, or accept a `formatError(issues, { file }) => Error` callback. (The
secret-redaction default is great for env; it's unnecessary for a public config
file.)

### 6. Minor: optional logger peer

config-kit declares a peer dep on `@arshad-shah/log-kit`. The `ConfigLogger`
type is structural (`{ info, warn, error }`), so ExtForge's own logger can be
adapted — but the peer should stay **optional** (it already is in practice) so
adopting config-kit doesn't force log-kit into the tree.

## What ExtForge would keep regardless

- The `__pluginRunner` wiring and `onConfigResolved` hook firing — that's
  ExtForge-specific orchestration that runs *after* load+validate.
- esbuild-based TS compilation of the config file (unless config-kit grows a
  pluggable loader as in gap #2).

## Bottom line

Gaps **#1 (structured sources)** and **#2 (a config-file source)** are the
core. With those plus **#3 (deep merge)**, config-kit could load
`extforge.config.ts` and any other module-based config. **#4/#5** make the
validation UX match what a build tool needs; **#6** is housekeeping.
