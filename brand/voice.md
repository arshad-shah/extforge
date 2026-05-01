# ExtForge Voice & Brand Guide

## What ExtForge is

A zero-config build system for Manifest V3 browser extensions. Fast, opinionated, cross-browser, with first-class HMR.

## How ExtForge sounds

**Direct.** No filler. Tell the developer what happened, where, and what to do next.

```
✖ EXT_CONFIG_INVALID
  browsers[0] received "brave"  (extforge.config.ts:3:14)
  Hint: Brave is Chromium-based; use "chrome" and load dist/chrome/.
  Docs: https://extforge.arshadshah.com/errors/EXT_CONFIG_INVALID
```

Not:

> ❌ Oops! Looks like something went wrong with your config. Don't worry, we can fix this together! 💪

**Technical, not jargon-y.** Use the real words: manifest, service worker, content script, HMR. Don't invent friendly synonyms.

**Confident.** ExtForge has opinions and ships with defaults. Say "ExtForge does X" not "ExtForge can optionally do X if you want." The user can override; lead with the default.

**Honest.** When something is partial, say so. "Cross-browser compat scan covers entry files (transitive imports land in v0.4)." Not vague reassurance.

## Spelling and casing

| Form | Use case |
|---|---|
| `extforge` | Package name, CLI command, anywhere lowercase fits the surrounding code (imports, npm, shell). Also the wordmark. |
| `ExtForge` | Product name in prose: "ExtForge builds Manifest V3 extensions." |
| `EXTFORGE` | Never. |

The wordmark always renders lowercase, in line with peers (Vite, Bun, esbuild, swc).

## Visual identity

**Mark.** A geometric "Ef" — three violet bars + an amber chevron in the middle row. The chevron carries two meanings: (1) speed/forward (`>`), and (2) a spark from the forge.

**Primary palette.**
- Violet `#5B21B6` — the mark on light backgrounds; the bold/active color.
- Violet-soft `#A78BFA` — the mark on dark backgrounds.
- Amber `#FBBF24` — the chevron, the focused state, the accent. Use sparingly.
- Ink `#0F172A` — body text.

**Avoid:**
- Pastel washes. Saturation should feel decisive.
- Gradients on the mark. The mark is flat.
- Drop shadows. The mark sits on a surface; it doesn't float.
- Stock developer iconography (gears, brackets `</>`, terminal cursors).

## Typography

- Body / UI: **Inter** (variable, weights 400/500/700).
- Code / CLI: **JetBrains Mono** (monospace).
- Wordmark: Inter Bold, lowercase, tight tracking (`-0.02em`).

System-font fallbacks are baked into `tokens.json` — never load a font from a CDN at runtime in the CLI or in compiled extensions.

## CLI tone

- Errors lead with the code: `EXT_CONFIG_INVALID`.
- Success messages are short: `✔ Build complete in 412ms`.
- Hints are one line. If a hint needs three sentences, it belongs in docs.
- Don't print emojis unless they're already part of the brand language (`✔ ✖ ⚠`). No 🎉, 🚀, 💪.

## Docs tone

- Lead with the code example. Explanation supports the code, not the other way around.
- Headings in sentence case ("Getting started" not "Getting Started").
- Code blocks are language-tagged.
- One H1 per page. The H1 is the page title.

## Naming new things

- Library / public API: `camelCase` for functions, `PascalCase` for types/classes, `SCREAMING_SNAKE` for constants.
- CLI commands: `extforge <verb>` — verb is short (`init`, `dev`, `build`, `doctor`, `upgrade`, `validate`, `package`).
- Error codes: `EXT_<DOMAIN>_<KIND>` (e.g. `EXT_CONFIG_INVALID`, `EXT_BUILD_FAILED`).
- Plugin packages (track 3+): `@extforge/<name>` — `@extforge/preset-react`, `@extforge/manifest-defaults`.

## Asset checklist

- `brand/logo.svg` — primary mark (light bg).
- `brand/logo-wordmark.svg` — mark + wordmark, light bg.
- `brand/logo-wordmark-dark.svg` — mark + wordmark, dark bg.
- `brand/favicon.svg` — favicon (32×32 with rounded square background).
- `brand/tokens.json` — design tokens (colors, type, radii).
- `brand/voice.md` — this document.

The docs site (Track 5) will consume `tokens.json` directly via Tailwind / CSS variables. The README and CLI banner consume the SVG and a small ASCII fallback.
