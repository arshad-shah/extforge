/// <reference lib="dom" />
/**
 * extforge/csui — Content Script UI runtime.
 *
 * Plasmo parity: matches the public surface of Plasmo's CSUI without coupling
 * to React. The mount function is framework-agnostic — pass any function that
 * receives a DOM container and renders into it (works with React, Preact,
 * Vue, Svelte, vanilla DOM, lit-html…).
 *
 * Discovery: ExtForge's builder treats `src/contents/*.csui.{ts,tsx}` as
 * content-script entries automatically. Each file's default export is a
 * `CSUIDescriptor`; the builder also reads `descriptor.matches` at build
 * time (lightweight static AST) to populate the manifest's content_scripts
 * entry. (Run-time-computed matches still work but won't auto-augment the
 * manifest — declare them in extforge.config.ts in that case.)
 */

export interface CSUIOptions {
  /**
   * Returns the element (or shadow host) under which to attach the Shadow
   * Root. Defaults to `document.documentElement`.
   */
  getMountPoint?: () => Element | null | Promise<Element | null>;
  /**
   * Inline CSS string injected into the Shadow Root before mount. Use this
   * to ship Tailwind output, design-system styles, etc. The string is wrapped
   * in a `<style>` element inside the shadow tree.
   */
  getStyle?: () => string | Promise<string>;
  /**
   * If you need full control of the host element (e.g. attaching a closed
   * shadow root or using a custom tag), return it from here. Default behaviour
   * creates a `<div data-extforge-csui>` host with an open shadow root.
   */
  getRootContainer?: () => HTMLElement | Promise<HTMLElement>;
  /**
   * Optional DOM/match-readiness guard. Returning false aborts mount; useful
   * when a page's URL passes the manifest match but the page-internal route
   * doesn't (e.g. `https://example.com/*` but only `/app/*` should mount).
   */
  shouldMount?: () => boolean | Promise<boolean>;
  /**
   * Anchor styling on the host element. Inlined as `host.style.cssText`. Only
   * the OUTER host — not the shadow tree contents.
   */
  hostStyle?: string;
  /**
   * Stable identifier so re-mounts (HMR or SPA route change) replace the
   * previous instance instead of stacking. Default: filename-derived. Falls
   * back to a synthetic id if the build pipeline didn't inject one.
   */
  id?: string;
  /**
   * Manifest matches for builder auto-augmentation. Read at build time.
   */
  matches?: string[];
  /**
   * Run-at timing forwarded to the manifest entry. Default: `'document_idle'`.
   */
  runAt?: 'document_start' | 'document_end' | 'document_idle';
  /**
   * Opt-in: watch for SPA navigations / DOM replacements that would orphan
   * the mounted host. When the configured trigger fires, the previous
   * mount is torn down (cleanup is invoked, host is removed) and the
   * descriptor is mounted again — useful for client-side routers that
   * replace `document.documentElement` or the chosen `getMountPoint()`
   * subtree.
   *
   * - `'navigation'` (default off): listens for `pushState`/`replaceState`
   *   and `popstate` and remounts after each.
   * - `'mutation'`: observes the mount point and remounts whenever the
   *   host element is removed from the tree.
   * - A function: a custom subscriber. Called with a remount callback;
   *   must return an unsubscribe function.
   */
  remountOn?:
    | 'navigation'
    | 'mutation'
    | ((remount: () => void) => () => void);
}

export interface CSUIDescriptor<TRender = (root: Element) => void | (() => void)> {
  options: CSUIOptions;
  /**
   * Render fn. Receives the inner mount element (the user-facing root inside
   * the shadow tree). MAY return a cleanup function called on unmount.
   */
  render: TRender;
}

export type Renderer = (root: Element) => void | (() => void) | Promise<void | (() => void)>;

/**
 * Helper for declaring a CSUI entry. The `matches` field is read by the
 * builder via static AST scan to populate the manifest.
 *
 * Side-effecting: when called in a DOM context (the content-script case),
 * `defineCSUI` schedules `mountCSUI(descriptor)` on the next microtask. This
 * is what makes `export default defineCSUI(...)` actually mount the widget
 * at runtime — IIFE content scripts have no caller to consume the default
 * export, so without auto-mount the descriptor sits inert.
 *
 * Opt-out: `globalThis.__EXTFORGE_CSUI_NO_AUTOMOUNT__ = true` before
 * importing skips the auto-mount (used by unit tests that exercise the
 * manual `mountCSUI()` path).
 */
export function defineCSUI(options: CSUIOptions, render: Renderer): CSUIDescriptor<Renderer> {
  const descriptor: CSUIDescriptor<Renderer> = { options, render };
  if (
    typeof document !== 'undefined' &&
    !(globalThis as { __EXTFORGE_CSUI_NO_AUTOMOUNT__?: boolean }).__EXTFORGE_CSUI_NO_AUTOMOUNT__
  ) {
    // Defer one microtask so synchronous module-evaluation order isn't
    // disturbed (e.g. user code that captures `descriptor.render` after
    // module load).
    queueMicrotask(() => {
      void mountCSUI(descriptor).catch((err) => {
        // Surface the underlying error so the user can actually debug.
        // We don't have access to the runtime logger here; fall back to
        // console (this file is a content-script runtime, not a Node module).
        // eslint-disable-next-line no-console
        console.warn('[extforge:csui] auto-mount failed', err);
      });
    });
  }
  return descriptor;
}

interface ActiveMount {
  host: HTMLElement;
  cleanup?: () => void;
  /** Unsubscribe the SPA / mutation-observer trigger, if any. */
  unwatchRemount?: () => void;
}

const ACTIVE: Map<string, ActiveMount> = new Map();

/**
 * Wire up the `remountOn` trigger and return an unsubscribe function.
 * Returns a no-op when `remountOn` is undefined or the browser doesn't
 * support the requested mechanism.
 */
function subscribeRemount(
  trigger: CSUIOptions['remountOn'],
  mountPoint: Element,
  host: HTMLElement,
  remount: () => void,
): () => void {
  if (!trigger) return () => {};
  if (typeof trigger === 'function') {
    try { return trigger(remount); } catch { return () => {}; }
  }
  if (trigger === 'navigation') {
    // Patch history methods + listen to popstate. Coalesce rapid calls
    // (a router that fires both pushState and a custom event) into one
    // remount via a microtask flag.
    if (typeof window === 'undefined' || !window.history) return () => {};
    let scheduled = false;
    const fire = (): void => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => { scheduled = false; remount(); });
    };
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function (...args: Parameters<typeof origPush>): ReturnType<typeof origPush> {
      const r = origPush.apply(this, args);
      fire();
      return r;
    };
    history.replaceState = function (...args: Parameters<typeof origReplace>): ReturnType<typeof origReplace> {
      const r = origReplace.apply(this, args);
      fire();
      return r;
    };
    const onPop = (): void => fire();
    window.addEventListener('popstate', onPop);
    return () => {
      history.pushState = origPush;
      history.replaceState = origReplace;
      window.removeEventListener('popstate', onPop);
    };
  }
  if (trigger === 'mutation') {
    if (typeof MutationObserver === 'undefined') return () => {};
    const obs = new MutationObserver(() => {
      if (!host.isConnected) remount();
    });
    obs.observe(mountPoint, { childList: true, subtree: false });
    return () => obs.disconnect();
  }
  return () => {};
}

/**
 * Mount (or remount) a CSUI descriptor. Idempotent per `id` — calling twice
 * with the same id replaces the previous instance.
 *
 * Returns an `unmount()` function for manual teardown (HMR uses this).
 */
export async function mountCSUI(descriptor: CSUIDescriptor<Renderer>): Promise<() => void> {
  const opts = descriptor.options;
  const id = opts.id ?? '__extforge_csui_default__';

  // Existing mount with the same id? Tear it down first.
  const prev = ACTIVE.get(id);
  if (prev) {
    try { prev.unwatchRemount?.(); } catch { /* swallow */ }
    try { prev.cleanup?.(); } catch { /* swallow */ }
    prev.host.remove();
    ACTIVE.delete(id);
  }

  if (opts.shouldMount && !(await opts.shouldMount())) {
    return () => {};
  }

  const mountPoint = opts.getMountPoint ? await opts.getMountPoint() : document.documentElement;
  if (!mountPoint) return () => {};

  const host = opts.getRootContainer
    ? await opts.getRootContainer()
    : document.createElement('div');
  host.setAttribute('data-extforge-csui', id);
  // Marker so the HMR client traverses Shadow trees for CSS hot-swap.
  host.setAttribute('data-extforge-shadow', '');
  if (opts.hostStyle) host.style.cssText = opts.hostStyle;
  // If the host page returned a custom container that's already in the DOM,
  // don't re-attach it. Otherwise we'd duplicate it under mountPoint.
  if (!host.isConnected) mountPoint.appendChild(host);

  // Try to attach (or reuse) an open shadow root. If the host already has a
  // CLOSED shadow root the page attached, host.shadowRoot is null and
  // attachShadow throws NotSupportedError — fall back to rendering directly
  // into the host element instead of crashing the mount.
  let renderRoot: ShadowRoot | HTMLElement;
  if (host.shadowRoot) {
    renderRoot = host.shadowRoot;
  } else {
    try {
      renderRoot = host.attachShadow({ mode: 'open' });
    } catch {
      renderRoot = host;
    }
  }

  if (opts.getStyle) {
    const css = await opts.getStyle();
    if (css) {
      const style = document.createElement('style');
      style.textContent = css;
      renderRoot.appendChild(style);
    }
  }

  const inner = document.createElement('div');
  inner.dataset['extforgeCsuiRoot'] = '';
  renderRoot.appendChild(inner);

  const result = await descriptor.render(inner);
  const cleanup = typeof result === 'function' ? result : undefined;

  // Wire the SPA/mutation trigger AFTER the mount succeeds so the
  // remount callback doesn't fire during the initial render.
  const unwatchRemount = subscribeRemount(
    opts.remountOn,
    mountPoint,
    host,
    () => { void mountCSUI(descriptor); },
  );

  ACTIVE.set(id, { host, cleanup, unwatchRemount });

  return () => {
    const cur = ACTIVE.get(id);
    if (!cur) return;
    try { cur.unwatchRemount?.(); } catch { /* swallow */ }
    try { cur.cleanup?.(); } catch { /* swallow */ }
    cur.host.remove();
    ACTIVE.delete(id);
  };
}

/** @internal — clears all active mounts. Used by tests. */
export function __resetCSUI(): void {
  for (const { host, cleanup, unwatchRemount } of ACTIVE.values()) {
    try { unwatchRemount?.(); } catch { /* ignore */ }
    try { cleanup?.(); } catch { /* ignore */ }
    try { host.remove(); } catch { /* ignore */ }
  }
  ACTIVE.clear();
}
