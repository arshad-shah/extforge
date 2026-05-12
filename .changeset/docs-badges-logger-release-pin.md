---
"extforge": patch
---

Docs, badges, and release-pipeline hardening.

- **`extforge/logger`** now has a dedicated reference page covering `LogLevel`, scoped loggers, timers, the JSON transport, formatters, and the ANSI / `NO_COLOR` rules. The subpath was already exported from `package.json` but undocumented.
- **README badges** for CI, CodeQL, OpenSSF Scorecard, npm downloads, npm provenance, and the security policy. New "Security & supply chain" section with `npm audit signatures` verification snippet.
- **Supply-chain guide** at `/guides/supply-chain/` documents the hardened release pipeline (OIDC trusted publishing, required-reviewer environment, SHA-pinned actions, `persist-credentials: false`, provenance attestations).
- **Release workflow fix:** pin `npm` to `11.5.1` in `release.yml` and `publish.yml`. The unpinned `npm@latest` started failing with `Cannot find module 'promise-retry'` on Node 22 runners; pinning gives us deterministic publishes.

No runtime behaviour change to any exported API.
