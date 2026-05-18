import { describe, it, expect } from 'vitest';
import { createServer, type Server } from 'node:net';
import { createHMRServer } from '../src/core/hmr/index.js';
import { isExtForgeError } from '../src/core/errors/index.js';
import { createLogger, LogLevel } from '../src/core/logger/index.js';
import { MAX_PORT_RETRIES } from '../src/core/hmr/constants.js';

async function listenOn(port: number): Promise<Server> {
  return await new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(port, '127.0.0.1', () => resolve(s));
  });
}

describe('reservePort (via createHMRServer.start)', () => {
  it('throws EXT_HMR_PORT_IN_USE when the entire candidate range is occupied', async () => {
    // Find a free starting port, then bind every port in [start, start + MAX_PORT_RETRIES).
    const probe = await new Promise<number>((resolve) => {
      const s = createServer();
      s.listen(0, '127.0.0.1', () => {
        const p = (s.address() as { port: number }).port;
        s.close(() => resolve(p));
      });
    });

    const blockers: Server[] = [];
    try {
      for (let i = 0; i < MAX_PORT_RETRIES; i++) {
        try { blockers.push(await listenOn(probe + i)); }
        catch { /* a port may have been taken by something else; skip */ }
      }
      // If we couldn't fully occupy the range, the test is inconclusive but
      // shouldn't false-fail.
      if (blockers.length < MAX_PORT_RETRIES) return;

      const server = createHMRServer({
        projectRoot: process.cwd(),
        config: { manifest: { name: 'x', version: '0.0.1' } } as Parameters<typeof createHMRServer>[0]['config'],
        browser: 'chrome',
        port: probe,
        host: '127.0.0.1',
        logger: createLogger({ level: LogLevel.Silent }),
      });

      let caught: unknown;
      try { await server.start(); }
      catch (e) { caught = e; }
      finally { try { await server.stop(); } catch {} }

      expect(isExtForgeError(caught)).toBe(true);
      if (isExtForgeError(caught)) expect(caught.code).toBe('EXT_HMR_PORT_IN_USE');
    } finally {
      await Promise.all(blockers.map(s => new Promise<void>(r => s.close(() => r()))));
    }
  });
});
