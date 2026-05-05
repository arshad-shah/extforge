# ExtForge — Plasmo-Beat & Slim-Down Tasks

> Durable task plan derived from the 2026-05-05 dep/feature audit. Each task is
> self-contained: reason, scope, acceptance, test plan. Do not skip the
> "Acceptance" or "Out of scope" sections — they are how we avoid drift.
>
> Source of truth for ordering: high-ROI, low-blast-radius first, then bigger
> features. **Do not begin a phase before the previous phase is committed,
> green in CI, and tagged in the changelog.**

---

## Phase 1 — Slim deps & patch all CVEs (no-behavior-change)

### 1.1 Delete unused declared dependencies

**Why.** Five packages are declared in `package.json` `dependencies` but never imported anywhere in `src/` or `scripts/`: `fast-glob`, `glob`, `pkg-types`, `defu`. (`consola` is not declared but pulled by c12 — handled in 1.3.) Each still inflates the install footprint and the lockfile and grants future imports the right to drift.

**Scope.**
- Remove `fast-glob`, `glob`, `pkg-types`, `defu` from `dependencies` in `/package.json`.
- Run `pnpm install` to regenerate `pnpm-lock.yaml`.
- Run `pnpm typecheck && pnpm test && pnpm build` to confirm no implicit usage.

**Out of scope.** Replacing `c12`/`pathe`/`picocolors` etc. (later phases). Touching dev-deps.

**Acceptance.**
- [ ] `package.json` `dependencies` block lists only: `c12`, `chokidar`, `citty`, `pathe`, `picocolors`, `prompts`, `ws`, `zod`, plus `esbuild` (peer).
- [ ] `pnpm test` green.
- [ ] `pnpm build` green.
- [ ] `pnpm list --prod --depth Infinity` shows ≤ 130 packages (currently 130; expect ~125).

### 1.2 Bump esbuild, astro, vitest to patched versions

**Why.** Closes 2 of 8 CVEs without touching code:
- esbuild ≥ 0.25.0 → fixes [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99). Bump to **^0.28.0** (current latest, our `peerDependencies` floor stays `>=0.24.0` for users on older esbuild — but our own dev-dep is the new floor).
- astro ≥ 6.1.6 → fixes [GHSA-j687-52p2-xcff](https://github.com/advisories/GHSA-j687-52p2-xcff). Docs-site only.
- vitest 4.x + @vitest/coverage-v8 4.x → pulls vite ≥ 6.4.2 ([GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9)).

**Scope.**
- `package.json`: `esbuild ^0.28.0`, `vitest ^4.1.0`, `@vitest/coverage-v8 ^4.1.0`.
- `docs-site/package.json`: `astro ^6.1.6` (or `^5.x` patched version if still 5.x line).
- Adapt to vitest 4 breaking changes if any (mostly config shape).

**Out of scope.** Major bumps for typescript, eslint, zod, glob, pathe, c12, citty, chokidar (deferred to later phases or covered when we replace them).

**Acceptance.**
- [ ] `pnpm audit --prod` reports 0 CVEs in production graph (the `tar` chain is the only remaining; that gets killed in 1.3 below).
- [ ] `pnpm test` green.
- [ ] `pnpm -C docs-site build` green.

### 1.3 Replace `c12` with a 100-line custom config loader (kills tar CVE chain)

**Why.** `c12@2 → giget → tar 6.2.1` is the source of all six high-severity CVEs. c12@4-beta still tracks an old giget. Our use of c12 is one call (`loadConfig`), no `extends:` resolution from URLs, no `giget` template fetching. Replacing it deletes ~25 transitive packages.

**Spec.** Create `src/core/config/loader.ts` exporting `loadConfigFile(cwd, name, defaults)`:
1. Resolve `${cwd}/${name}.config.{ts,mts,js,mjs,cjs}` via `existsSync`.
2. If `.ts`/`.mts`: bundle to a temp `.mjs` via in-process `esbuild.build({ entryPoints, bundle: false, format: 'esm', platform: 'node', write: true, outfile: <tmpdir>/extforge-config-<rand>.mjs })`. Then `await import(pathToFileURL(...))`. Delete tmp file after.
3. If `.mjs`/`.js` (when `package.json#type === 'module'`): direct `await import()`.
4. If `.cjs` or `.js` without ESM type: `createRequire(import.meta.url)(absPath)`.
5. Return `{ ...defaults, ...userConfig }` shallow-merged. (Our config schema is flat enough that we don't need `defu`.)

**Scope.**
- New: `src/core/config/loader.ts` (~120 LOC) and `tests/config-loader.test.ts`.
- Modify `src/core/config.ts:5,46-51` to use `loadConfigFile` instead of `c12`'s `loadConfig`.
- Remove `c12` from `dependencies`.

**Out of scope.** `extends:` resolution, dotenv loading (deferred to Phase 5 `extforge/env`), config file watching (the HMR watcher already covers this).

**Acceptance.**
- [ ] All existing `tests/config.test.ts` and `tests/config-schema.test.ts` pass unmodified.
- [ ] New `tests/config-loader.test.ts` covers: TS config, JS-ESM config, JS-CJS config, missing file (returns defaults), syntax error in user config (throws `ExtForgeError(EXT_CONFIG_INVALID)`), defaults merged.
- [ ] `pnpm audit --prod` reports **0** vulnerabilities.
- [ ] `pnpm list --prod --depth Infinity | tail -1` shows ≤ 100 packages (currently 130).

### 1.4 Update CHANGELOG.md

Document removed deps, vuln fixes, and the c12 → custom-loader change under `[Unreleased]`. No version bump yet.

---

## Phase 2 — Examples-as-tests harness

### 2.1 `examples/` workspace with two reference extensions

**Why.** We need real, runnable extensions for two reasons:
1. End-to-end smoke test — catches breakage that unit tests miss (manifest emission, asset copy, IIFE wrapping, HMR client injection).
2. Documentation — copy-paste starting points users can clone.

**Spec.**
- Add `examples/` to `pnpm-workspace.yaml`.
- `examples/vanilla-popup/` — TS, no framework, popup + background + content script. Tests `chrome.storage` + content-script DOM mutation.
- `examples/react-csui/` — React popup + content-script-mounted React widget (uses Phase 4's `extforge/csui` once that lands; until then a hand-rolled Shadow DOM mount). Tests cross-context messaging.
- Each example has its own `extforge.config.ts`, runs `pnpm build` to produce `dist/chrome/`, `dist/firefox/`, etc.

**Out of scope.** Storybook, screenshots, video.

**Acceptance.**
- [ ] `pnpm -r --filter "./examples/*" build` produces `dist/chrome/manifest.json` for each example.
- [ ] Each example's manifest validates (`extforge validate`).

### 2.2 Playwright-based browser harness

**Why.** Validate the produced extension actually loads and works in a real browser. Catches bugs no unit test can: bad CSP in manifest, bad MV3 service-worker registration, content-script not matching, HMR socket handshake wrong.

**Spec.** New `tests-e2e/` workspace at repo root with:
- `tests-e2e/harness.ts`: Playwright fixture that launches Chromium with `--disable-extensions-except=<dist/chrome path>` and `--load-extension=<...>`. Returns `{ browser, context, extensionId, popupPage }`. Uses Playwright's `chromium.launchPersistentContext` (only mode that supports MV3 in Playwright).
- `tests-e2e/vanilla-popup.spec.ts`:
  - Build `examples/vanilla-popup` with `extforge build --browser chrome`.
  - Launch context, open `chrome-extension://<id>/popup/index.html`.
  - Assert `document.title`, click button, assert content script ran on `example.com`.
- `tests-e2e/react-csui.spec.ts`:
  - Build, launch, open `https://example.com`.
  - Assert the CSUI Shadow root mounts, popup ↔ content messaging works.
- `tests-e2e/hmr.spec.ts`:
  - Run `extforge dev --browser chrome` against `examples/vanilla-popup` in a child process.
  - Connect to `ws://localhost:35729` and assert protocol envelope `v: 2`.
  - Modify `src/popup/index.ts` on disk.
  - Assert WS broadcasts `{ type: 'js', files: [...], scriptIds: undefined }` within 500ms.
  - Assert that **after Phase 4** popup state survives the reload (tracked in §4 acceptance, not here).

**Out of scope.** Firefox/Safari runners (Playwright can drive Firefox but extension-loading there is awkward; defer). Visual regression. Performance benchmarks.

**Acceptance.**
- [ ] `pnpm test:e2e` runs all three specs green locally.
- [ ] Specs are deterministic — no flaky waits, all uses Playwright's auto-wait.
- [ ] CI matrix runs them on Linux + macOS.

### 2.3 CI integration

**Spec.** Add `.github/workflows/e2e.yml` that:
- Runs on PRs and main pushes.
- Uses `microsoft/playwright-github-action`.
- Runs `pnpm install`, `pnpm build`, `pnpm test`, `pnpm test:e2e`.
- Uploads Playwright HTML reports as artifacts on failure.

**Acceptance.** Workflow green on a clean PR.

---

## Phase 3 — Replace `pathe`, `picocolors`, `citty` (deps trim)

### 3.1 Replace `pathe` with `node:path/posix`

**Why.** Node 20+ ships `node:path/posix` which is `pathe`'s actual core. We use exactly five functions: `join`, `resolve`, `dirname`, `relative`, `extname` — all identical behavior between `pathe` and `path/posix`. -1 dep, easier to audit.

**Spec.** `find src/ -name '*.ts' -exec sed -i "s|from 'pathe'|from 'node:path/posix'|g" {} +`. Verify on Windows (CI matrix). Tests already cover path handling.

**Out of scope.** Touching `.tpl` files or scripts that use `pathe` for build-time only — those can stay or move incrementally.

**Acceptance.**
- [ ] `pnpm test` green on Linux + Windows.
- [ ] `package.json` no longer lists `pathe`.

### 3.2 Replace `picocolors` with internal `src/core/logger/ansi.ts`

**Why.** We use ~8 colors. picocolors is small but adds surface. Custom helper lets us match brand colors (#5B21B6 violet, etc.) and centralize NO_COLOR/FORCE_COLOR detection (which we partly duplicate in `logger/index.ts`).

**Spec.** New `src/core/logger/ansi.ts` (~50 LOC) exporting `red`, `yellow`, `green`, `blue`, `magenta`, `cyan`, `gray`, `dim`, `bold`, plus `useColor()`. Replace `import pc from 'picocolors'` in 4 sites.

**Acceptance.**
- [ ] All existing logger tests pass.
- [ ] `pnpm dev` and `pnpm build` output visually identical to before (manual eyeball or snapshot).
- [ ] `package.json` no longer lists `picocolors`.

### 3.3 Replace `citty` with hand-rolled CLI parser

**Why.** Citty is fine but pulls a small subdep tree and we use only `defineCommand`/`runMain`. A 200-line parser keyed off `process.argv` does it.

**Spec.** New `src/cli/parser.ts` providing `defineCommand({ name, description, args, run })` and `runMain(cmd)`. Match citty's API surface so `src/cli/index.ts` changes only its import line. Support: positional args, string/boolean flags with defaults, subcommands, `--help`/`-h` rendering, `--version`/`-v`.

**Acceptance.**
- [ ] All `tests/error-handler.test.ts` and CLI smoke tests pass.
- [ ] `extforge --help` renders correctly.
- [ ] `package.json` no longer lists `citty`.

---

## Phase 4 — True 0-reload UI: React Fast Refresh for popup/options/sidepanel

> **Status:** §4.1 (registry) ✅ shipped. §4.2–§4.4 (esbuild plugin, RFR
> transform, server-side v3 emission) are the remaining follow-up.

### 4.1 HMR runtime module registry — DONE

**Spec.** New `src/core/hmr/runtime/registry.ts` (browser-side). Exports `__EXTFORGE_HMR__` global with:
```ts
type ModuleRecord = {
  id: string;
  exports: unknown;
  acceptCallbacks: ((newMod: unknown) => void)[];
  disposeCallbacks: (() => void)[];
};
register(id, factory): ModuleRecord
accept(id, cb): void  // subscribes
update(id, newFactory): boolean  // returns true if accepted, false if reload required
```

### 4.2 esbuild plugin: rewrite ESM modules to use the registry

**Spec.** New `src/core/hmr/runtime/esbuild-plugin.ts`. In dev mode only, transform every ESM module so that:
- Top-level `export const X = ...` becomes `__EXTFORGE_HMR__.register(id, () => { return { X: ... } })`.
- Every `import { X } from './foo'` becomes a dynamic accessor (so swapping `./foo` reflects).
- `import.meta.hot` shimmed to `{ accept: (cb) => __EXTFORGE_HMR__.accept(id, cb), dispose: ... }`.

This is non-trivial. Implementation reference: study `vite/src/node/server/hmr.ts` and the @vitejs/plugin-react Fast Refresh injection. Vendor minimally; do not depend on Vite at runtime.

**Out of scope (4.x).** IIFE/content-script HMR (Phase 5).

### 4.3 React Fast Refresh transform

**Spec.** Add `react-refresh` runtime as a peerDep; integrate the babel-plugin-react-refresh logic via esbuild's `onLoad` hook. Match `@vitejs/plugin-react`'s injection pattern.

### 4.4 WS message: granular `{ type: 'hmr-update', updates: [{ id, hash, kind: 'js' }] }`

**Spec.** Extend `HMRUpdate` with a new `'hmr-update'` type (bump `HMR_PROTOCOL_VERSION` to 3, keep v2 fallback). Server emits the new message when only ESM module bodies changed (no manifest/structural change). Client tries `__EXTFORGE_HMR__.update(id, newFactory)` per change, falls back to `location.reload()` if any returns false.

**Acceptance for Phase 4.**
- [ ] `examples/react-csui` popup: edit a component, see DOM update without full reload, React state preserved.
- [ ] `tests-e2e/hmr.spec.ts` extended: assert `window.__EXTFORGE_HMR_RELOADS__` counter does NOT increment after a hot-accepted change.

---

## Phase 5 — First-party packages: csui, storage, messaging, env

### 5.1 `extforge/csui`

**API.**
```ts
import { defineCSUI } from 'extforge/csui';
export default defineCSUI({
  matches: ['https://*.example.com/*'],
  getMountPoint: () => document.body,
  getStyle: () => `:host { all: initial; }`,
  // optional: getRootContainer, getShadowRoot
}, () => <MyWidget />);
```
Build pipeline detects files matching `src/contents/*.csui.tsx` and emits a content-script entry that:
1. Creates a `data-extforge-shadow` host element.
2. Attaches a Shadow DOM.
3. Injects user CSS into shadow.
4. Mounts the React tree (or vanilla render fn).
5. On HMR accept: unmounts cleanly, remounts new component.

### 5.2 `extforge/storage`

```ts
import { Storage, useStorage } from 'extforge/storage';
const s = new Storage({ area: 'local' });
await s.set('key', value);
await s.get('key');
s.watch({ key: (newVal, oldVal) => {} });
// React: const [val, setVal] = useStorage('key', defaultVal)
```
Wraps `chrome.storage.{local,sync,session,managed}`. Falls back to `localStorage` outside extension context (e.g. on real web pages from a content script). Cross-context sync via `chrome.storage.onChanged`.

### 5.3 `extforge/messaging`

```ts
// background/messages/get-user.ts
import { defineHandler } from 'extforge/messaging';
export default defineHandler<GetUserReq, GetUserRes>(async (req, sender) => { ... });
// popup
import { sendMessage } from 'extforge/messaging';
const res = await sendMessage<GetUserReq, GetUserRes>('get-user', { id: 1 });
```
File-based RPC: every `.ts` in `src/background/messages/` becomes a typed handler. `sendMessage` is fully type-safe (router type derived from filename + handler types via TS magic).

Plus typed Ports API and Relay Flow (page ↔ SW).

### 5.4 `extforge/env`

`.env`/`.env.development`/`.env.production` loaded at build time. Vars prefixed `EXTFORGE_PUBLIC_` are inlined into bundles via esbuild's `define`. Match Vite's `import.meta.env` shape for familiarity.

**Acceptance for each 5.x.**
- [ ] Subpath export wired in `package.json#exports`.
- [ ] Unit tests for each public function.
- [ ] Used in `examples/react-csui` as a dogfood test.
- [ ] Tested end-to-end in `tests-e2e/`.

---

## Phase 6 — Phase B HMR: content script swap without page reload

(Detailed spec to be added when Phase 5 lands. Outline only:)

- Switch content scripts to **dynamic registration** via `chrome.scripting.registerContentScripts` (background-controlled).
- Bootstrap module in each tab knows its scriptId, listens for HMR updates, dynamically `import()` the new chunk URL, calls `dispose()` on the previous instance, then re-mounts.
- `@extforge/csui` benefits automatically.

---

## Phase 7 — Replace `chokidar` with `node:fs.watch` recursive

Bump `engines.node` to `>=22`. Rewrite `src/core/hmr/index.ts:9,242-250`. Keep chokidar behind a `--legacy-watch` flag for one release. Add a fallback to polling mode for FUSE/network mounts where `fs.watch` is unreliable.

---

## Phase 8 — Replace `prompts` with custom readline UI

Last dep to drop. Only used in scaffold. ~200 LOC. Adds value: can render ExtForge brand colors, supports non-TTY mode (CI) without the kludge `prompts` requires.

---

## Anti-drift checklist (read before each phase)

1. **Does this phase have an Acceptance section with ≥1 measurable check?** If not, write it before coding.
2. **Does the change preserve every existing test?** If not, justify each modified test in the commit message.
3. **Does this phase add ≥1 test?** Required.
4. **Did I touch anything in "Out of scope"?** If yes, revert and split into a follow-up task.
5. **Is the changelog updated?** Required before commit.
6. **Did `pnpm audit --prod` regress?** Must be 0 after Phase 1.3.
7. **Did the prod dep count grow?** Must monotonically shrink through Phase 7.
