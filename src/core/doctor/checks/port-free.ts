import type { Check } from '../index.js';
import { createServer } from 'node:net';

async function isFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}

export const portFreeCheck: Check = {
  name: 'port-free',
  async run() {
    const port = 35729;
    const free = await isFree(port);
    return free
      ? { name: 'port-free', status: 'pass', message: `HMR port ${port} is free` }
      : { name: 'port-free', status: 'warn', message: `HMR port ${port} is in use`, hint: 'Pass --port to extforge dev.' };
  },
};
