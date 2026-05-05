import { useEffect, useState } from 'react';
import { sendMessage } from 'extforge/messaging';
import { useStorage } from 'extforge/storage/react';

declare module 'extforge/messaging' {
  interface MessageMap {
    'csui-mounted': { req: void; res: { total: number } };
    'get-count':    { req: void; res: { count: number } };
    'ping':         { req: void; res: { type: 'PONG'; from: string; ts: number } };
  }
}

export function Widget(): JSX.Element {
  const [hidden, setHidden] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  // useStorage demo: persists the "minimised" preference across reloads.
  const { value: minimised, setValue: setMinimised } = useStorage<boolean>('csui:minimised', false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await sendMessage('csui-mounted', undefined as never);
        setCount(res.total);
      } catch {
        // Background may not be reachable yet — try a fallback read.
        try {
          const r = await sendMessage('get-count', undefined as never);
          setCount(r.count);
        } catch { /* ignore */ }
      }
    })();
  }, []);

  if (hidden) return <></>;

  return (
    <div
      data-testid="csui-widget"
      style={{
        position: 'fixed',
        bottom: '12px',
        right: '12px',
        background: '#0F172A',
        color: '#fff',
        padding: '12px 16px',
        borderRadius: '8px',
        font: '14px/1.4 system-ui, sans-serif',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        zIndex: 2147483647,
        minWidth: minimised ? '120px' : '200px',
      }}
    >
      <div style={{ color: '#A78BFA', fontWeight: 600, marginBottom: '4px' }}>
        ExtForge CSUI {minimised ? '·' : ''}
      </div>
      {!minimised && <div data-testid="csui-count">Mounts seen: {count ?? '…'}</div>}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button
          data-testid="csui-toggle"
          onClick={() => setMinimised(!minimised)}
          style={btnStyle}
        >
          {minimised ? 'Expand' : 'Minimise'}
        </button>
        <button
          data-testid="csui-close"
          onClick={() => setHidden(true)}
          style={btnStyle}
        >
          Close
        </button>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '4px 8px',
  background: '#5B21B6',
  color: '#fff',
  border: 0,
  borderRadius: '4px',
  cursor: 'pointer',
  font: 'inherit',
};
