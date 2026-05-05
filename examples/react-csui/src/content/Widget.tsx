import { useEffect, useState } from 'react';

export function Widget(): JSX.Element {
  const [count, setCount] = useState(0);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    void chrome.runtime
      .sendMessage({ type: 'GET_COUNT' })
      .then((res: { count?: number }) => setCount(res?.count ?? 0))
      .catch(() => {});
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
        minWidth: '200px',
      }}
    >
      <div style={{ color: '#A78BFA', fontWeight: 600, marginBottom: '4px' }}>
        ExtForge CSUI
      </div>
      <div data-testid="csui-count">Mounts seen: {count}</div>
      <button
        data-testid="csui-close"
        onClick={() => setHidden(true)}
        style={{
          marginTop: '8px',
          padding: '4px 8px',
          background: '#5B21B6',
          color: '#fff',
          border: 0,
          borderRadius: '4px',
          cursor: 'pointer',
          font: 'inherit',
        }}
      >
        Close
      </button>
    </div>
  );
}
