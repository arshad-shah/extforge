import { lookup } from 'node:dns/promises';
import { createServer } from 'node:net';
import { loadExtForgeConfig } from '../../config.js';
import type { Check } from '../index.js';

/**
 * Whether the dev server could bind this port on this host.
 *
 * The host matters and used to be `0.0.0.0`, with a comment saying that was
 * to "catch processes bound to any local interface". It does the opposite.
 * A wildcard bind asks the OS for every interface, and on macOS that
 * succeeds while something else holds `127.0.0.1:<port>` — so the check
 * reported a port as free that `extforge dev` then failed to take, which is
 * the one thing it exists to prevent.
 *
 * Binding the host the dev server will bind is the question actually worth
 * asking, and it is the same question `createHMRServer` asks a moment later.
 */
function canBind(port: number, address: string): Promise<boolean> {
  return new Promise((resolve) => {
    const s = createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, address);
  });
}

async function isFree(port: number, host: string): Promise<boolean> {
  /*
   * Every address the host resolves to, not just the first.
   *
   * `localhost` is two addresses on a modern machine — `::1` and
   * `127.0.0.1` — and Node binds whichever the resolver returns first. On
   * macOS that is `::1`, so a bind succeeds while something else holds
   * `127.0.0.1:<port>`, and the check calls a port free that `extforge dev`
   * then fails to take. Checking every address is the only answer that does
   * not depend on resolver order.
   */
  let addresses: string[];
  try {
    addresses = (await lookup(host, { all: true })).map((entry) => entry.address);
  } catch {
    // Not a name we can resolve — an IP literal, or a host that is simply
    // wrong. Either way, try it as given and let the bind decide.
    addresses = [host];
  }
  if (addresses.length === 0) addresses = [host];

  for (const address of addresses) {
    if (!(await canBind(port, address))) return false;
  }
  return true;
}

export const portFreeCheck: Check = {
  name: 'port-free',
  async run({ cwd }) {
    let port = 35729;
    // The same default `extforge dev` uses, so the check and the thing it
    // checks cannot disagree about where the server goes.
    let host = 'localhost';
    try {
      const cfg = await loadExtForgeConfig(cwd);
      const configured = cfg.dev?.port;
      if (typeof configured === 'number' && Number.isFinite(configured)) port = configured;
      if (typeof cfg.dev?.host === 'string' && cfg.dev.host) host = cfg.dev.host;
    } catch {
      /* fall back to the defaults */
    }
    const free = await isFree(port, host);
    return free
      ? { name: 'port-free', status: 'pass', message: `HMR port ${port} is free on ${host}` }
      : {
          name: 'port-free',
          status: 'warn',
          message: `HMR port ${port} is in use on ${host}`,
          hint: 'Pass --port to extforge dev.',
        };
  },
};
