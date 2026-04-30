// ═══ ExtForge HMR Client ═══
// Auto-injected in development mode. DO NOT commit this file.
(function extforgeHMR() {
  if (typeof window === 'undefined' && typeof self !== 'undefined') {
    setupServiceWorkerHMR();
    return;
  }

  var WS_URL = 'ws://{{HMR_HOST}}:{{HMR_PORT}}';
  var ws = null;
  var reconnectAttempts = 0;
  var MAX_RECONNECT = 10;
  var RECONNECT_DELAY = 1000;

  function connect() {
    try { ws = new WebSocket(WS_URL); } catch (e) { scheduleReconnect(); return; }

    ws.onopen = function() {
      reconnectAttempts = 0;
      console.log('[ExtForge HMR] Connected');
    };

    ws.onmessage = function(event) {
      var update;
      try { update = JSON.parse(event.data); } catch (e) { return; }
      switch (update.type) {
        case 'css':          handleCSSUpdate(update.files); break;
        case 'js':           handleJSUpdate(update.files); break;
        case 'full-reload':
        case 'manifest':     handleFullReload(update.type); break;
        case 'assets':       handleFullReload('assets'); break;
      }
    };

    ws.onclose = function() { ws = null; scheduleReconnect(); };
    ws.onerror = function() { if (ws) ws.close(); };
  }

  function scheduleReconnect() {
    if (reconnectAttempts >= MAX_RECONNECT) {
      console.warn('[ExtForge HMR] Max reconnection attempts reached');
      return;
    }
    reconnectAttempts++;
    setTimeout(connect, RECONNECT_DELAY * Math.min(reconnectAttempts, 5));
  }

  function handleCSSUpdate(files) {
    console.log('[ExtForge HMR] CSS update:', files);
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    links.forEach(function(link) {
      var href = link.getAttribute('href');
      if (href && files.some(function(f) { return href.indexOf(f) !== -1; })) {
        var url = new URL(href, location.href);
        url.searchParams.set('t', Date.now().toString());
        link.setAttribute('href', url.toString());
      }
    });
    // Shadow DOM support
    var hosts = document.querySelectorAll('[data-extforge-shadow]');
    hosts.forEach(function(host) {
      if (host.shadowRoot) {
        host.shadowRoot.querySelectorAll('link[rel="stylesheet"]').forEach(function(link) {
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

  function handleJSUpdate(files) {
    console.log('[ExtForge HMR] JS update — reloading tab:', files);
    location.reload();
  }

  function handleFullReload(reason) {
    console.log('[ExtForge HMR] Full reload (' + reason + ') — reloading extension');
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.reload) {
      chrome.runtime.reload();
    } else {
      location.reload();
    }
  }

  function setupServiceWorkerHMR() {
    var swWs;
    function swConnect() {
      try { swWs = new WebSocket(WS_URL); } catch (e) { return; }
      swWs.onmessage = function(event) {
        var update;
        try { update = JSON.parse(event.data); } catch (e) { return; }
        if (update.type === 'full-reload' || update.type === 'manifest') {
          console.log('[ExtForge HMR SW] Reloading extension');
          chrome.runtime.reload();
        }
      };
      swWs.onclose = function() { setTimeout(swConnect, 2000); };
    }
    swConnect();
  }

  connect();
})();
