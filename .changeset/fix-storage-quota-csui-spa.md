---
"extforge": minor
---

storage + csui: quota errors and an opt-in SPA remount trigger

- `Storage.set` (localStorage fallback) now throws a typed
  `StorageQuotaExceededError` (with `cause` set to the underlying
  DOMException) when `setItem` fails for quota reasons. Callers can
  catch it and evict / warn / fall through instead of seeing a raw
  `QuotaExceededError` DOMException from a confusing call site.
- `CSUIOptions` gains a `remountOn` option:
  - `'navigation'` — listens for `pushState`/`replaceState`/`popstate`
    and remounts after each, so SPA route changes that swap the DOM
    don't orphan the mounted host.
  - `'mutation'` — observes the mount point and remounts whenever the
    host is removed from the tree.
  - A custom subscriber function for full control.
  Opt-in, off by default. The previous "mount once and hope" behaviour
  is preserved when the option is omitted.
- Config validation in non-strict mode now hints `EXTFORGE_STRICT_CONFIG=1`
  for users who'd rather fail fast.
