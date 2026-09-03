// ═══ ExtForge HMR Client ═══
// Auto-injected in development mode. DO NOT commit this file.
//
// Pure logic mirrors src/core/hmr/client-logic.ts — keep both in sync.
(function extforgeHMR() {
  // NOTE: everything the service-worker path touches must be declared BEFORE
  // the early return below — `var` hoists the binding but not the value.
  var WS_URL = 'ws://{{HMR_HOST}}:{{HMR_PORT}}';
  var HMR_PROTOCOL_VERSION = 3;
  // keep in sync with src/core/hmr/client-logic.ts — BACKOFF array and nextBackoff
  var BACKOFF = [250, 500, 1000, 2000, 4000, 8000];
  var MAX_RECONNECT_ATTEMPTS = 30;
  // keep in sync with src/core/hmr/client-logic.ts — RELOAD_RELAY_TYPE
  var RELOAD_RELAY_TYPE = 'extforge:hmr-reload';
  var OWN_SCRIPT_ID = (typeof globalThis !== 'undefined' && typeof globalThis.__EXTFORGE_SCRIPT_ID__ === 'number')
    ? globalThis.__EXTFORGE_SCRIPT_ID__
    : undefined;

  var ws = null;
  var reconnectAttempts = 0;
  var giveUp = false;

  if (typeof window === 'undefined' && typeof self !== 'undefined') {
    setupServiceWorkerHMR();
    return;
  }

  // ─── Pure logic (mirror of client-logic.ts) ─────────────────────────
  function shouldReload(update, ownScriptId) {
    if (update.type !== 'js') return true;
    if (!update.scriptIds || update.scriptIds.length === 0) return true;
    if (ownScriptId === undefined || ownScriptId === null) return true;
    return update.scriptIds.indexOf(ownScriptId) !== -1;
  }
  function nextBackoff(attempt) {
    if (attempt < 1) return BACKOFF[0];
    return BACKOFF[Math.min(attempt - 1, BACKOFF.length - 1)];
  }
  function isCompatible(update) {
    if (update.v === undefined) return true;
    return update.v <= HMR_PROTOCOL_VERSION;
  }
  function reasonLabel(type) {
    if (type === 'css') return 'css hot swap';
    return type;
  }
  function formatLog(update, durationMs) {
    var files = (update.files || []).join(', ');
    return '[ExtForge HMR] reloaded ' + files + ' — ' + reasonLabel(update.type) + ' — ' + durationMs + 'ms';
  }

  // ─── Status badge ───────────────────────────────────────────────────
  function showBadge(text) {
    if (typeof document === 'undefined' || !document.body) return;
    var el = document.querySelector('[data-extforge-hmr-status]');
    if (!el) {
      el = document.createElement('div');
      el.setAttribute('data-extforge-hmr-status', '');
      el.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647;background:#0F172A;color:#A78BFA;padding:6px 10px;border-radius:6px;font:12px/1.4 system-ui,sans-serif;opacity:0.85;pointer-events:none';
      document.body.appendChild(el);
    }
    el.textContent = text;
  }
  function hideBadge() {
    if (typeof document === 'undefined') return;
    var el = document.querySelector('[data-extforge-hmr-status]');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  // ─── Connection ─────────────────────────────────────────────────────
  function connect() {
    try { ws = new WebSocket(WS_URL); } catch (e) { scheduleReconnect(); return; }

    ws.onopen = function () {
      reconnectAttempts = 0;
      hideBadge();
      console.log('[ExtForge HMR] connected');
    };

    ws.onmessage = function (event) {
      var update;
      try { update = JSON.parse(event.data); } catch (e) { return; }
      if (!isCompatible(update)) {
        console.warn('[ExtForge HMR] incompatible server protocol v=' + update.v + '; ignoring');
        return;
      }
      var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      switch (update.type) {
        case 'hmr-update': handleHotUpdate(update, t0); break;
        case 'css':       handleCSSUpdate(update.files); logUpdate(update, t0); break;
        case 'js':        handleJSUpdate(update); logUpdate(update, t0); break;
        case 'full-reload':
        case 'manifest':  handleFullReload(update.type); logUpdate(update, t0); break;
        case 'assets':    handleFullReload('assets'); logUpdate(update, t0); break;
        case 'build-error':
          if (window.__EXTFORGE_OVERLAY__) window.__EXTFORGE_OVERLAY__.render(update.error);
          break;
        case 'build-ok':
          if (window.__EXTFORGE_OVERLAY__) window.__EXTFORGE_OVERLAY__.clear();
          break;
        default: /* ignore unknown types */ break;
      }
    };

    ws.onclose = function () {
      ws = null;
      scheduleReconnect();
    };
    ws.onerror = function () { if (ws) ws.close(); };
  }

  function logUpdate(update, t0) {
    var t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    console.log(formatLog(update, Math.round(t1 - t0)));
  }

  function scheduleReconnect() {
    if (giveUp) return;
    reconnectAttempts++;
    if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      giveUp = true;
      showBadge('ExtForge HMR — dev server unreachable. Refresh page when it\'s back.');
      return;
    }
    showBadge('ExtForge HMR — reconnecting (#' + reconnectAttempts + ')');
    setTimeout(connect, nextBackoff(reconnectAttempts));
  }

  // ─── Update handlers ────────────────────────────────────────────────

  /**
   * v3 hot-update handler. For each {id, hash, file}, refetch the bundled
   * chunk with a cache-busting query string. The new module's React Fast
   * Refresh header re-registers components and calls performReactRefresh,
   * which updates the DOM in place with state preserved.
   *
   * Falls back to full reload if:
   *   - we're not in an extension page (chrome-extension://...) context,
   *   - the dynamic import fails for any update,
   *   - the new module didn't perform an RFR pass within 500ms.
   */
  function handleHotUpdate(update, t0) {
    if (typeof location === 'undefined' || location.protocol !== 'chrome-extension:') {
      // Not an extension page — a content script that received a UI-only
      // envelope. Refresh in place; do NOT relay, or editing the popup would
      // reload the whole extension.
      handleFullReload('hmr-update', false);
      logUpdate(update, t0);
      return;
    }
    var updates = update.updates || [];
    if (updates.length === 0) { logUpdate(update, t0); return; }

    var base = location.origin + '/';
    Promise.all(updates.map(function (u) {
      var url = base + u.file + '?t=' + encodeURIComponent(u.hash);
      // Dynamic import gives us a fresh module instance; the RFR header in the
      // new module re-registers components and triggers a refresh.
      return import(/* @vite-ignore */ url).catch(function (err) {
        console.warn('[ExtForge HMR] failed to fetch update for ' + u.file, err);
        throw err;
      });
    }))
      .then(function () { logUpdate(update, t0); })
      .catch(function () {
        // Any failure → fall back to a clean reload.
        handleFullReload('hmr-update', false);
      });
  }

  function handleCSSUpdate(files) {
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    Array.prototype.forEach.call(links, function (link) {
      var href = link.getAttribute('href');
      if (href && files.some(function (f) { return href.indexOf(f) !== -1; })) {
        var url = new URL(href, location.href);
        url.searchParams.set('t', Date.now().toString());
        link.setAttribute('href', url.toString());
      }
    });
    var hosts = document.querySelectorAll('[data-extforge-shadow]');
    Array.prototype.forEach.call(hosts, function (host) {
      if (host.shadowRoot) {
        var shLinks = host.shadowRoot.querySelectorAll('link[rel="stylesheet"]');
        Array.prototype.forEach.call(shLinks, function (link) {
          var href = link.getAttribute('href');
          if (href) {
            var url = new URL(href, location.href);
            url.searchParams.set('t', Date.now().toString());
            link.setAttribute('href', url.toString());
          }
        });
      }
    });
  }

  function handleJSUpdate(update) {
    if (!shouldReload(update, OWN_SCRIPT_ID)) {
      console.debug('[ExtForge HMR] js update for other script; skipping');
      return;
    }
    location.reload();
  }

  /**
   * Ask the service worker to reload the extension. Content scripts have no
   * `chrome.runtime.reload`, so they hand the request to the worker — which
   * `sendMessage` also wakes up. Mirror of `requestExtensionReload` in
   * client-logic.ts.
   */
  function relayReloadToWorker(reason) {
    chrome.runtime.sendMessage({ type: RELOAD_RELAY_TYPE, reason: reason }, function () {
      // Reading lastError suppresses the "unchecked runtime.lastError" noise.
      // A missing receiver means no background entrypoint answered — say so
      // loudly rather than letting the dev loop go quiet.
      var err = chrome.runtime.lastError;
      if (err && /Receiving end does not exist|Could not establish connection/i.test(err.message || '')) {
        console.warn(
          '[ExtForge HMR] no background service worker answered the reload relay (' + err.message +
          '). Reload the extension manually from the extensions page.'
        );
      }
    });
  }

  function performReload(reason, allowRelay) {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.reload) {
      try { chrome.runtime.reload(); return 'direct'; }
      catch (e) { console.warn('[ExtForge HMR] chrome.runtime.reload() failed; trying the relay', e); }
    }
    if (allowRelay !== false && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      try { relayReloadToWorker(reason); return 'relayed'; }
      catch (e) {
        console.warn(
          '[ExtForge HMR] could not reach the background service worker to reload the extension (' +
          (e && e.message ? e.message : e) + '); reload it manually from the extensions page.'
        );
      }
    }
    if (typeof location !== 'undefined' && location.reload) { location.reload(); return 'page-reload'; }
    console.warn('[ExtForge HMR] no way to apply a "' + reason + '" update from this context.');
    return 'unavailable';
  }

  function handleFullReload(reason, allowRelay) {
    performReload(reason, allowRelay);
  }

  // ─── Service worker path ────────────────────────────────────────────
  /**
   * The worker holds NO socket. MV3 evicts an idle worker after ~30s, which
   * closes any socket it owns; reconnecting on close resurrected the worker
   * and churned forever (issue #88). Instead the worker just listens for the
   * relay message that a page or content script — which already has a live
   * socket — sends when the dev server says `full-reload` / `manifest`.
   */
  function setupServiceWorkerHMR() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage) return;
    var reloading = false;
    chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
      if (!message || message.type !== RELOAD_RELAY_TYPE) return undefined;
      try { sendResponse({ ok: true }); } catch (e) { /* port already closed */ }
      // Every open tab relays the same change at the same moment; only the
      // first one needs to do anything.
      if (reloading) return undefined;
      reloading = true;
      console.log('[ExtForge HMR] reloading extension (' + (message.reason || 'full-reload') + ')');
      if (chrome.runtime.reload) chrome.runtime.reload();
      return undefined;
    });
  }

  connect();
})();
