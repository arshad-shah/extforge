---
'extforge': minor
---

`dev --open` now installs the extension over each browser's debugging protocol instead of a command-line switch, because the switches no longer work: Chrome 137 removed `--load-extension` from branded builds (accepted, ignored, no message), and Firefox has never had one. Chromium uses `Extensions.loadUnpacked` over a CDP pipe, Firefox uses `webExtension.install` over WebDriver BiDi, and both report the id the browser assigned. No new dependency. Adds `dev --debug-port` for attaching Playwright or Puppeteer to the same browser.
