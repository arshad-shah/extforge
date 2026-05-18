import * as __ExtForgeRefreshRuntime__ from 'react-refresh/runtime';
const __extforge_prevRefreshReg = globalThis.$RefreshReg$;
const __extforge_prevRefreshSig = globalThis.$RefreshSig$;
if (!globalThis.__extforge_refresh_inited__) {
  globalThis.__extforge_refresh_inited__ = true;
  __ExtForgeRefreshRuntime__.injectIntoGlobalHook(globalThis);
  globalThis.$RefreshReg$ = () => {};
  globalThis.$RefreshSig$ = () => (type) => type;
}
