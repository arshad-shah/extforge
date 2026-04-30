import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

function Popup() {
  const [count, setCount] = useState(0);

  return (
    <div className="w-80 p-4">
      <h1 className="text-lg font-bold mb-2">{{NAME}}</h1>
      <p className="text-sm text-gray-600 mb-4">
        Your extension is running!
      </p>
      <button
        onClick={() => setCount(c => c + 1)}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
      >
        Clicked {count} times
      </button>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<Popup />);
