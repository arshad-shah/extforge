/**
 * ExtForge dev error overlay — runs inside every extension page that
 * imports the HMR client. Renders a full-coverage shadow-DOM div with
 * the error code, message, file:line:col, source frame, and stack.
 *
 * Hidden when the HMR server reports a successful rebuild.
 */
(function () {
  if (typeof document === 'undefined') return;
  if (window.__EXTFORGE_OVERLAY__) return;

  var HOST_ID = 'extforge-error-overlay';

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildFrame(err) {
    if (!err.frame) return '';
    var safe = escapeHtml(err.frame);
    return '<pre class="frame"><code>' + safe + '</code></pre>';
  }

  function buildStack(err) {
    if (!err.stack) return '';
    return '<details class="stack"><summary>Stack trace</summary><pre>' + escapeHtml(err.stack) + '</pre></details>';
  }

  function buildHint(err) {
    if (!err.hint) return '';
    return '<p class="hint"><span class="hint-tag">Hint</span>' + escapeHtml(err.hint) + '</p>';
  }

  function buildDocs(err) {
    if (!err.docsUrl) return '';
    return '<p class="docs"><a href="' + escapeHtml(err.docsUrl) + '" target="_blank" rel="noopener">Open documentation</a></p>';
  }

  function locString(err) {
    if (!err.file) return '';
    var loc = err.file;
    if (err.line != null) loc += ':' + err.line;
    if (err.column != null) loc += ':' + err.column;
    return loc;
  }

  function render(err) {
    var host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = HOST_ID;
      host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;';
      var rootTarget = document.body || document.documentElement;
      rootTarget.appendChild(host);
    }
    var shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
    shadow.innerHTML = (
      '<style>' +
      ':host{all:initial;}' +
      '.backdrop{position:fixed;inset:0;background:rgba(15,23,42,0.92);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#e2e8f0;overflow:auto;padding:40px 32px;}' +
      '.card{max-width:1024px;margin:0 auto;background:#1e293b;border-radius:12px;border:1px solid #ef4444;box-shadow:0 30px 80px rgba(0,0,0,0.5);overflow:hidden;}' +
      '.header{padding:20px 24px;background:#7f1d1d;border-bottom:1px solid #ef4444;}' +
      '.tag{display:inline-block;padding:2px 10px;background:#ef4444;color:#fff;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;border-radius:4px;margin-right:10px;}' +
      '.code{font-family:inherit;font-weight:600;color:#fecaca;}' +
      '.message{padding:18px 24px 6px;font-size:15px;line-height:1.5;color:#fef2f2;white-space:pre-wrap;word-break:break-word;}' +
      '.loc{padding:0 24px 14px;font-size:12px;color:#94a3b8;}' +
      '.loc a{color:#7dd3fc;text-decoration:none;}' +
      '.frame{margin:0 24px 18px;padding:14px 16px;background:#0f172a;border-radius:8px;border:1px solid #1e293b;font-size:13px;line-height:1.55;white-space:pre;overflow:auto;color:#e2e8f0;}' +
      '.hint{padding:0 24px 14px;font-size:13px;line-height:1.5;color:#cbd5e1;}' +
      '.hint-tag{display:inline-block;padding:2px 8px;background:#1e293b;color:#fbbf24;font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;border-radius:4px;margin-right:8px;}' +
      '.docs{padding:0 24px 18px;font-size:13px;}' +
      '.stack{padding:0 24px 20px;color:#94a3b8;font-size:12px;}' +
      '.stack summary{cursor:pointer;color:#cbd5e1;margin-bottom:6px;}' +
      '.stack pre{margin:0;padding:12px;background:#0f172a;border-radius:6px;overflow:auto;line-height:1.5;}' +
      '.footer{padding:14px 24px;border-top:1px solid #334155;background:#0f172a;display:flex;justify-content:space-between;font-size:12px;color:#94a3b8;}' +
      '.dismiss{background:none;border:1px solid #334155;color:#cbd5e1;padding:4px 10px;border-radius:6px;font-family:inherit;font-size:12px;cursor:pointer;}' +
      '.dismiss:hover{background:#1e293b;}' +
      '</style>' +
      '<div class="backdrop"><div class="card">' +
      '<div class="header"><span class="tag">Build failed</span><span class="code">' + escapeHtml(err.code || 'EXT_BUILD_ERROR') + '</span></div>' +
      '<p class="message">' + escapeHtml(err.message || 'Unknown error') + '</p>' +
      (locString(err) ? '<p class="loc">' + escapeHtml(locString(err)) + '</p>' : '') +
      buildFrame(err) +
      buildHint(err) +
      buildDocs(err) +
      buildStack(err) +
      '<div class="footer"><span>ExtForge dev — fix and save to dismiss</span><button class="dismiss">Dismiss</button></div>' +
      '</div></div>'
    );
    var dismissBtn = shadow.querySelector('.dismiss');
    if (dismissBtn) dismissBtn.addEventListener('click', clear);
  }

  function clear() {
    var host = document.getElementById(HOST_ID);
    if (host) host.remove();
  }

  window.__EXTFORGE_OVERLAY__ = { render: render, clear: clear };
})();
