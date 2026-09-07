---
'extforge': minor
---

`extforge dev --open --debug-port <port>` opens a CDP endpoint on the launched browser, so Playwright, Puppeteer or any CDP client can drive the same browser the developer is looking at — same profile, same logged-in state, same extension build — instead of launching a second one and reproducing the flags by hand. Also settable as `dev.debugPort`. Chromium only; the endpoint is unauthenticated and is bound to 127.0.0.1.
