import type { Check } from '../index.js';
import { createServer } from 'node:net';
import { loadExtForgeConfig } from '../../config.js';

async function isFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = createServer();
    s.once('error', () => resolve(false));
    // Bind to 0.0.0.0 so we catch processes bound to any local interface.
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '0.0.0.0');
  });
}

export const portFreeCheck: Check = {
  name: 'port-free',
  async run({ cwd }) {
    let port = 35729;
    try {
      const cfg = await loadExtForgeConfig(cwd);
      const configured = cfg.dev?.port;
      if (typeof configured === 'number' && Number.isFinite(configured)) port = configured;
    } catch { /* fall back to the default port */ }
    const free = await isFree(port);
    return free
      ? { name: 'port-free', status: 'pass', message: `HMR port ${port} is free` }
      : { name: 'port-free', status: 'warn', message: `HMR port ${port} is in use`, hint: 'Pass --port to extforge dev.' };
  },
};
