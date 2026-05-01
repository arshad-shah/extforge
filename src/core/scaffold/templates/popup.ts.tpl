// Popup entry — vanilla TypeScript.

document.addEventListener('DOMContentLoaded', async () => {
  const root = document.getElementById('root');
  if (!root) return;

  root.innerHTML = `
    <main style="font-family: system-ui, sans-serif; padding: 16px;">
      <h1>{{NAME}}</h1>
      <p>Welcome to your extension.</p>
      <button id="ping">Send message</button>
      <pre id="reply"></pre>
    </main>
  `;

  document.getElementById('ping')?.addEventListener('click', async () => {
    const reply = await chrome.runtime.sendMessage({ kind: 'ping' });
    const out = document.getElementById('reply');
    if (out) out.textContent = JSON.stringify(reply, null, 2);
  });
});
