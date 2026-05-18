// extforge content-script HMR runtime
(function() {
  if ((globalThis as any).__extforge_cs_inited__) return;
  (globalThis as any).__extforge_cs_inited__ = true;
  const disposers: Array<() => void> = [];
  (globalThis as { __extforgeDispose__?: (cb: () => void) => void }).__extforgeDispose__ = (cb) => disposers.push(cb);
  // When a new copy of this script is registered + injected, the OLD
  // disposers run first via a message to the prior instance.
  if ((globalThis as { chrome?: typeof globalThis.chrome }).chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.__extforge === 'cs-dispose') {
        for (const d of disposers) try { d(); } catch {}
        disposers.length = 0;
      }
    });
  }
})();
