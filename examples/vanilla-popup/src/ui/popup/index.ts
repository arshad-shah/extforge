/// <reference types="chrome" />

const KEY = 'tabsSeen';

const button = document.getElementById('ping') as HTMLButtonElement;
const result = document.getElementById('result') as HTMLPreElement;

async function refresh(): Promise<void> {
  const cur = await chrome.storage.local.get(KEY);
  const total = cur[KEY] ?? 0;
  result.textContent = `tabs seen: ${total}`;
}

button?.addEventListener('click', async () => {
  const res = await chrome.runtime.sendMessage({ type: 'PING' });
  result.textContent = JSON.stringify(res, null, 2);
});

void refresh();
