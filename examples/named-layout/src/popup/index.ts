import '../lib/messages';
import { sendMessage } from 'extforge/messaging';

const button = document.getElementById('ping') as HTMLButtonElement;
const result = document.getElementById('result') as HTMLPreElement;

async function refresh(): Promise<void> {
  const r = await sendMessage('get-tabs-seen', undefined as never);
  result.textContent = `tabs seen: ${r.count}`;
}

button?.addEventListener('click', async () => {
  result.textContent = JSON.stringify(await sendMessage('ping', undefined as never), null, 2);
});

void refresh();
