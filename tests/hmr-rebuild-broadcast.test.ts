import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { createServer } from 'node:net';
import { createHMRServer } from '../src/core/hmr/index.js';
import { createLogger, LogLevel } from '../src/core/logger/index.js';
import type { ExtForgeConfig } from '../src/core/config.js';

const silent = createLogger({ level: LogLevel.Silent });

const baseManifest = {
  name: 'x', version: '0.0.1', description: '', manifestVersion: 3 as const,
  permissions: { required: [], optional: [], host: [] },
};

function freePort(): Promise<number> {
  return new Promise((res) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => res(p));
    });
  });
}

function makeProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'extforge-rb-'));
  mkdirSync(join(root, 'src/background'), { recursive: true });
  writeFileSync(join(root, 'src/background/index.ts'), 'export const x = 1;\n');
  writeFileSync(join(root, 'package.json'), '{}');
  writeFileSync(join(root, 'tsconfig.json'), '{}');
  writeFileSync(join(root, 'extforge.config.ts'), 'export default {}');
  return root;
}

describe('createHMRServer rebuild broadcasts', () => {
  let root: string;

  beforeEach(() => { root = makeProject(); });
  afterEach(() => { try { rmSync(root, { recursive: true, force: true }); } catch {} });

  it('broadcasts a `build-ok` envelope after recovering from a build failure', async () => {
    // build-ok only fires when there's an overlay to dismiss — i.e. when
    // the previous rebuild errored. A vanilla green-after-green rebuild
    // should NOT spam the wire with empty acknowledgements.
    const port = await freePort();
    const cfg: ExtForgeConfig = {
      browsers: ['chrome'],
      manifest: { ...baseManifest, background: { entrypoint: 'background/index.js' } },
    };
    const server = createHMRServer({
      projectRoot: root, config: cfg, browser: 'chrome',
      port, host: '127.0.0.1', logger: silent,
    });
    const received: Array<{ type: string }> = [];
    let sock: WebSocket | undefined;
    try {
      await server.start();
      sock = new WebSocket(`ws://127.0.0.1:${port}`);
      await new Promise<void>((resolve, reject) => {
        sock!.once('open', () => resolve());
        sock!.once('error', reject);
      });
      sock.on('message', (data) => {
        try { received.push(JSON.parse(data.toString())); } catch {}
      });
      // Break the source first → triggers build-error.
      writeFileSync(join(root, 'src/background/index.ts'), 'export const x = ;\n');
      for (let i = 0; i < 80 && !received.some((m) => m.type === 'build-error'); i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      // Now fix it → triggers build-ok (because the previous rebuild errored).
      writeFileSync(join(root, 'src/background/index.ts'), 'export const x = 3;\n');
      for (let i = 0; i < 80 && !received.some((m) => m.type === 'build-ok'); i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(received.some((m) => m.type === 'build-ok')).toBe(true);
    } finally {
      try { sock?.close(); } catch {}
      await server.stop();
    }
  }, 30_000);

  it('broadcasts a `build-error` envelope when a rebuild fails', async () => {
    const port = await freePort();
    const cfg: ExtForgeConfig = {
      browsers: ['chrome'],
      manifest: { ...baseManifest, background: { entrypoint: 'background/index.js' } },
    };
    const server = createHMRServer({
      projectRoot: root, config: cfg, browser: 'chrome',
      port, host: '127.0.0.1', logger: silent,
    });

    const received: Array<{ type: string; error?: { message: string; code: string } }> = [];
    let sock: WebSocket | undefined;
    try {
      await server.start();
      sock = new WebSocket(`ws://127.0.0.1:${port}`);
      await new Promise<void>((resolve, reject) => {
        sock!.once('open', () => resolve());
        sock!.once('error', reject);
      });
      sock.on('message', (data) => {
        try { received.push(JSON.parse(data.toString())); } catch {}
      });
      // Break the source file. The watcher debounces ~150 ms; give it time.
      writeFileSync(join(root, 'src/background/index.ts'), 'export const x = ;\n');
      // Wait for both the watcher to fire and the rebuild to error.
      for (let i = 0; i < 80 && !received.some((m) => m.type === 'build-error'); i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      const errEnvelope = received.find((m) => m.type === 'build-error');
      expect(errEnvelope).toBeDefined();
      expect(errEnvelope!.error?.code).toBe('EXT_BUILD_FAILED');
    } finally {
      try { sock?.close(); } catch {}
      await server.stop();
    }
  }, 30_000);
});
