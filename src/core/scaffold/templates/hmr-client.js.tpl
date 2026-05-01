// ═══ ExtForge HMR Client ═══
// Auto-injected in development mode. DO NOT commit this file.
//
// Pure logic mirrors src/core/hmr/client-logic.ts — keep both in sync.
(function extforgeHMR() {
  if (typeof window === 'undefined' && typeof self !== 'undefined') {
    setupServiceWorkerHMR();
    return;
  }

  var WS_URL = 'ws://{{HMR_HOST}}:{{HMR_PORT}}';
  var HMR_PROTOCOL_VERSION = 2;
  // keep in sync with src/core/hmr/client-logic.ts — BACKOFF array and nextBackoff
  var BACKOFF = [250, 500, 1000, 2000, 4000, 8000];
  var OWN_SCRIPT_ID = (typeof globalThis !== 'undefined' && typeof globalThis.__EXTFORGE_SCRIPT_ID__ === 'number')
    ? globalThis.__EXTFORGE_SCRIPT_ID__
    : undefined;

  var ws = null;
  var reconnectAttempts = 0;

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
        case 'css':       handleCSSUpdate(update.files); logUpdate(update, t0); break;
        case 'js':        handleJSUpdate(update); logUpdate(update, t0); break;
        case 'full-reload':
        case 'manifest':  handleFullReload(update.type); logUpdate(update, t0); break;
        case 'assets':    handleFullReload('assets'); logUpdate(update, t0); break;
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
    reconnectAttempts++;
    showBadge('ExtForge HMR — reconnecting (#' + reconnectAttempts + ')');
    setTimeout(connect, nextBackoff(reconnectAttempts));
  }

  // ─── Update handlers ────────────────────────────────────────────────
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

  function handleFullReload(reason) {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.reload) {
      chrome.runtime.reload();
    } else {
      location.reload();
    }
  }

  // ─── Service worker path ────────────────────────────────────────────
  function setupServiceWorkerHMR() {
    var swWs = null;
    var swAttempts = 0;
    function swConnect() {
      try { swWs = new WebSocket('ws://{{HMR_HOST}}:{{HMR_PORT}}'); }
      catch (e) { setTimeout(swConnect, nextBackoff(++swAttempts)); return; }
      swWs.onopen = function () { swAttempts = 0; };
      swWs.onmessage = function (event) {
        var update;
        try { update = JSON.parse(event.data); } catch (e) { return; }
        if (update.type === 'full-reload' || update.type === 'manifest') {
          chrome.runtime.reload();
        }
      };
      swWs.onclose = function () { swWs = null; setTimeout(swConnect, nextBackoff(++swAttempts)); };
      swWs.onerror = function () { if (swWs) swWs.close(); };
    }
    swConnect();
  }

  connect();
})();
