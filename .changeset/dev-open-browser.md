---
"extforge": minor
---

`extforge dev --open` (or `dev: { open: true }` in `extforge.config.ts`) now launches a browser with the extension already installed, instead of leaving `dev.open` as an unused config field.

- Chrome/Edge: launched with `--load-extension` + `--disable-extensions-except`, pointed at the built `dist/<browser>/` output.
- Firefox: launched via `web-ext run` (install it with `npm i -D web-ext`) if it's found on the project's `node_modules/.bin` or `PATH`.
- A profile persists across `dev` restarts at `.extforge/profile/<browser>/` by default, configurable via `dev.profileDir`. Override the resolved binary with `dev.browserBinary`, and open extra tabs with `dev.startUrls`.
- When no binary (or `web-ext`) can be found — or the target is Safari, which can't be scripted this way — `dev` logs a warning and falls back to the existing "load unpacked from `dist/<browser>/`" instructions.
