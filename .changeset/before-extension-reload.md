---
'extforge': minor
---

Content scripts are torn down before a dev reload instead of being orphaned on the page, and `extforge/csui` gains `onBeforeExtensionReload(cb)`.

`chrome.runtime.reload()` replaces the extension but leaves every already-injected content script running. The orphan kept its timers, listeners and mounted UI alive while its `chrome.runtime` was dead — so the old UI stayed on the page after every reload, threw `Extension context invalidated` when you interacted with it, and the next navigation mounted a second copy beside it.

The HMR client now broadcasts a dispose pass before it asks for the reload, and waits for it:

- Anything CSUI mounted is unmounted for you — cleanup functions run, hosts are removed. No code change needed.
- `onBeforeExtensionReload(cb)`, exported from `extforge/csui`, registers your own teardown for the state CSUI doesn't own — intervals, observers, listeners on the host page. It returns an unsubscribe function, callbacks may be async, and outside dev builds nothing ever calls them.
- An `extforge:before-reload` event is dispatched on the global for code that would rather listen than register.

```ts
import { onBeforeExtensionReload } from 'extforge/csui';

onBeforeExtensionReload(() => {
  clearInterval(poll);
  observer.disconnect();
});
```

Teardown is best-effort by design: hooks run in parallel, a hook that throws is logged and stepped over, and the whole pass is capped at 500ms. A dev loop that stops reloading would be worse than a leaked listener.

As a second layer for the case where the broadcast never arrives — the dev server is gone, or the socket already gave up — injected scripts poll `chrome.runtime.id` and run the same teardown on their own when the extension context goes away.
