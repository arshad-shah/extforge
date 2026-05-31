/// <reference types="chrome" />

// The same EXTFORGE_PUBLIC_* values are available in the background service
// worker. Useful for, e.g., pointing fetch() at the configured API base.

const API_BASE = import.meta.env.EXTFORGE_PUBLIC_API_BASE;

console.log(`[env-example] background up — API base: ${API_BASE}, mode: ${import.meta.env.MODE}`);

export {};
