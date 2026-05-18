---
"extforge": patch
---

cli: fix shell injection in `package`/`icons` and SIGINT pre-empting dev shutdown

- `extforge package`: previously built its `zip` command via a template
  literal that interpolated `manifest.name`, `manifest.version`, and the
  build output path directly into a shell string. A maliciously crafted
  manifest could execute arbitrary commands. Now uses `spawnSync` with an
  argv array (no shell) and sanitises the archive filename so only
  `[a-zA-Z0-9._-]` characters survive into the filesystem path.
- `extforge icons`: same fix — replaced `execSync`/template literals with
  `spawnSync` + argv arrays for both the `sharp-cli` and `cairosvg`
  fallback paths.
- `installProcessGuards`: removed the synchronous `process.exit(130)`
  SIGINT handler. Long-running commands like `extforge dev` register
  their own async shutdown listeners; the previous synchronous handler
  ran first (handler-registration order) and killed the process before
  HMR sockets, file watchers, and esbuild contexts could close cleanly.
  Short-lived commands still exit on Ctrl-C via Node's default behaviour.
