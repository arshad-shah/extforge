/// <reference types="chrome" />

// EXTFORGE_PUBLIC_* values are replaced with string literals at build time by
// esbuild's `define` — there is no runtime lookup. Non-public keys are never
// inlined, so reading one yields `undefined`.

const set = (id: string, value: string): void => {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
};

set('api', import.meta.env.EXTFORGE_PUBLIC_API_BASE);
set('flag', import.meta.env.EXTFORGE_PUBLIC_FEATURE_FLAG);
set('mode', `${import.meta.env.MODE} (prod=${import.meta.env.PROD})`);

// Not prefixed EXTFORGE_PUBLIC_ → not inlined → undefined in client code.
const backendToken = (import.meta.env as Record<string, string | undefined>).EXTFORGE_BACKEND_TOKEN;
set('secret', backendToken === undefined ? 'undefined (not inlined ✓)' : backendToken);
