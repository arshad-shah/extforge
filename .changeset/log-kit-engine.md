---
"extforge": minor
---

logger: reimplement `extforge/logger` on top of `@arshad-shah/log-kit`

The logger now uses [`@arshad-shah/log-kit`](https://www.npmjs.com/package/@arshad-shah/log-kit)
as its record-dispatch engine — gaining per-transport failure isolation (a
throwing transport no longer breaks the others) and an `onTransportError`
diagnostic channel. The public surface is unchanged: `LogLevel`, `LogEntry`,
`createLogger`, the `Logger` methods (including `success`/`banner`/`summary`/
`step`/`child(scope)`), `jsonTransport`'s output shape, and the terminal
formatting are all identical. log-kit is now a runtime dependency (zero-dep,
~1.4 KB).
