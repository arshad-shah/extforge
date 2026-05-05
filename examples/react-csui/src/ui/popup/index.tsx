/// <reference types="chrome" />

import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';

function Popup(): JSX.Element {
  const [count, setCount] = useState<number | null>(null);
  const [pong, setPong] = useState<string>('');

  useEffect(() => {
    void chrome.runtime
      .sendMessage({ type: 'GET_COUNT' })
      .then((r: { count?: number }) => setCount(r?.count ?? 0))
      .catch(() => setCount(0));
  }, []);

  return (
    <div>
      <h1
        data-testid="title"
        style={{ fontSize: 14, color: '#A78BFA', margin: '0 0 8px' }}
      >
        ExtForge React CSUI
      </h1>
      <div data-testid="count" style={{ marginBottom: 8 }}>
        Mounts: {count ?? '…'}
      </div>
      <button
        data-testid="ping"
        onClick={async () => {
          const r = await chrome.runtime.sendMessage({ type: 'PING' });
          setPong(JSON.stringify(r));
        }}
        style={{
          padding: '6px 10px',
          background: '#5B21B6',
          color: '#fff',
          border: 0,
          borderRadius: 4,
          cursor: 'pointer',
        }}
      >
        Ping background
      </button>
      <pre
        data-testid="pong"
        style={{
          fontSize: 12,
          background: '#1E293B',
          padding: 8,
          borderRadius: 4,
          marginTop: 8,
          minHeight: 24,
        }}
      >
        {pong || '—'}
      </pre>
    </div>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<Popup />);
