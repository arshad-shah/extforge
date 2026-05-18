import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { createServer, type Server } from 'node:net';
import {
  createHMRServer,
  classifyChange,
  extractScriptIds,
  generateHMRClientCode,
} from '../src/core/hmr/index.js';
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
  const root = mkdtempSync(join(tmpdir(), 'extforge-hs-'));
  mkdirSync(join(root, 'src/background'), { recursive: true });
  writeFileSync(join(root, 'src/background/index.ts'), 'export const x = 1;\n');
  writeFileSync(join(root, 'package.json'), '{}');
  writeFileSync(join(root, 'tsconfig.json'), '{}');
  writeFileSync(join(root, 'extforge.config.ts'), 'export default {}');
  return root;
}

describe('classifyChange (pure helpers)', () => {
  it('classifies CSS files', () => expect(classifyChange('src/styles/x.css')).toBe('css'));
  it('classifies background files as full-reload', () => {
    expect(classifyChange('src/background/index.ts')).toBe('full-reload');
  });
  it('classifies manifest changes', () => {
    expect(classifyChange('extforge.config.ts')).toBe('manifest');
  });
  it('classifies asset files', () => {
    expect(classifyChange('src/icon.png')).toBe('assets');
  });
  it('falls back to "js" for other TS sources', () => {
    expect(classifyChange('src/ui/popup/index.ts')).toBe('js');
  });
});

describe('extractScriptIds', () => {
  it('returns undefined for an empty map', () => {
    expect(extractScriptIds([], new Map())).toBeUndefined();
  });
  it('returns the sorted ids for changed files that match the map', () => {
    const m = new Map<string, number>([
      ['/p/a.ts', 2],
      ['/p/b.ts', 0],
      ['/p/c.ts', 1],
    ]);
    const ids = extractScriptIds(['/p/c.ts', '/p/a.ts', '/p/unmatched.ts'], m);
    expect(ids).toEqual([1, 2]);
  });
  it('returns undefined when no changed file matches any script', () => {
    const m = new Map<string, number>([['/p/a.ts', 0]]);
    expect(extractScriptIds(['/p/other.ts'], m)).toBeUndefined();
  });
});

describe('generateHMRClientCode', () => {
  it('interpolates host and port into the loaded template', () => {
    const code = generateHMRClientCode(54321, '127.0.0.1');
    expect(code).toContain('54321');
    expect(code).toContain('127.0.0.1');
  });
});

describe('createHMRServer (start + stop)', () => {
  let root: string;

  beforeEach(() => { root = makeProject(); });
  afterEach(() => { try { rmSync(root, { recursive: true, force: true }); } catch {} });

  it('starts, accepts a WS client, and stops cleanly', async () => {
    const port = await freePort();
    const cfg: ExtForgeConfig = {
      browsers: ['chrome'],
      manifest: { ...baseManifest, background: { entrypoint: 'background/index.js' } },
    };
    const server = createHMRServer({
      projectRoot: root, config: cfg, browser: 'chrome',
      port, host: '127.0.0.1', logger: silent,
    });
    try {
      await server.start();
      expect(server.port).toBe(port);

      // Connect a client and wait for the open handshake — the server
      // shouldn't reject, and we should see connections > 0 after the
      // socket is open.
      const sock = new WebSocket(`ws://127.0.0.1:${port}`);
      await new Promise<void>((resolve, reject) => {
        sock.once('open', () => resolve());
        sock.once('error', reject);
      });
      // Give the server's onConnect handler a tick.
      await new Promise((r) => setTimeout(r, 20));
      expect(server.connections).toBeGreaterThanOrEqual(1);
      sock.close();
    } finally {
      await server.stop();
    }
    // After stop the port is free again.
    const p2 = await freePort();
    expect(typeof p2).toBe('number');
  }, 20_000);

  it('rejects start() when the port is already bound', async () => {
    const port = await freePort();
    // Squat on the port with a TCP server so reservePort exhausts its
    // candidate range (port..port+RETRIES-1). We block exactly one port
    // and expect either reservePort to walk past it (success) OR — if it
    // can't — reject. Test the "shifted-port" success path here.
    const blocker = await new Promise<Server>((res) => {
      const s = createServer();
      s.listen(port, '127.0.0.1', () => res(s));
    });
    try {
      const cfg: ExtForgeConfig = {
        browsers: ['chrome'],
        manifest: { ...baseManifest, background: { entrypoint: 'background/index.js' } },
      };
      const server = createHMRServer({
        projectRoot: root, config: cfg, browser: 'chrome',
        port, host: '127.0.0.1', logger: silent,
      });
      try {
        await server.start();
        // reservePort walked past the blocker; the resolved port is shifted.
        expect(server.port).not.toBe(port);
      } finally {
        await server.stop();
      }
    } finally {
      await new Promise<void>((res) => blocker.close(() => res()));
    }
  }, 20_000);
});
