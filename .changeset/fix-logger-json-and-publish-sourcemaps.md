---
"extforge": patch
---

logger + publish: harden `jsonTransport` and drop tarball source maps

- `jsonTransport` used `JSON.stringify(args)` directly, so a circular
  reference in a logged value threw — tearing down `--json` mode in
  the middle of a build / dev session. It also serialised `Error`
  instances as `{}` (useless in production logs) and crashed on
  `BigInt`. The transport now goes through a safe stringifier that
  expands Errors to `{ name, message, stack, cause? }`, coerces
  BigInts to strings, and replaces seen objects with `"[Circular]"`.
  A final try/catch emits a single "failed to serialise" line as a
  last-resort fallback.
- `tsup.config.ts` no longer emits source maps. They added ~40 KB of
  `.map` files to every npm tarball and leaked the maintainer's local
  source paths to consumers. Library users build their own extension;
  internal debugging happens in the repo, not in node_modules.
