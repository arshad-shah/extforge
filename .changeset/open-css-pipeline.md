---
"extforge": minor
---

Open up the CSS pipeline so any styling toolchain can plug in.

Previously `css` was limited to `'tailwind' | 'vanilla' | 'none'`, and the
builder ran the Tailwind CLI on every stylesheet regardless of that value.
Styling is now extensible end to end:

- **Custom processors.** `css` accepts a `CssProcessor` object — an inline
  `transform(ctx)` function, a CLI `command` (+ `args`, with `{input}` /
  `{output}` placeholders), or both. Sass, Lightning CSS, UnoCSS, PostCSS
  pipelines, etc. all plug in without a plugin. Commands are spawned without a
  shell, and a failing command falls back to copying the source through.
- **`onCssTransform` plugin hook.** Plugins can register a CSS transform that
  runs after the base processor; hooks chain (each receives the previous
  output), so you can layer on top of a preset. New types `CssProcessor`,
  `CssTransform`, and `CssTransformContext` are exported from
  `extforge/plugins`.
- **Presets now behave correctly.** `'vanilla'` and `'none'` copy stylesheets
  through untouched instead of silently invoking the Tailwind CLI when it
  happens to be installed. `'tailwind'` is unchanged (and still the default).
- **Scaffold fix.** `extforge init` with a non-Tailwind `css` choice no longer
  writes `@tailwind` layer directives into `src/styles/globals.css`.

Docs: new [Styling guide](https://extforge.arshadshah.com/guides/styling/) plus
updated configuration and plugin references.
