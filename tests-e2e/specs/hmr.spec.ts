import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const EXAMPLE = resolve(REPO_ROOT, 'examples/vanilla-popup');

interface DevServer {
  proc: ChildProcess;
  port: number;
  stop: () => Promise<void>;
}

async function startDev(): Promise<DevServer> {
  const proc = spawn('pnpm', ['exec', 'extforge', 'dev', '--browser', 'chrome'], {
    cwd: EXAMPLE,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' },
  });

  const port = await new Promise<number>((resolveP, rejectP) => {
    const timeout = setTimeout(() => rejectP(new Error('dev server did not start in 30s')), 30_000);
    const onData = (buf: Buffer): void => {
      const s = buf.toString();
      const m = /HMR server listening on ws:\/\/[^:]+:(\d+)/.exec(s);
      if (m) {
        clearTimeout(timeout);
        proc.stdout?.off('data', onData);
        proc.stderr?.off('data', onData);
        resolveP(parseInt(m[1]!, 10));
      }
    };
    proc.stdout?.on('data', onData);
    proc.stderr?.on('data', onData);
    proc.once('exit', (code) => {
      clearTimeout(timeout);
      rejectP(new Error(`dev server exited early (code ${code})`));
    });
  });

  return {
    proc,
    port,
    stop: () =>
      new Promise<void>((res) => {
        if (proc.exitCode !== null) return res();
        proc.once('exit', () => res());
        proc.kill('SIGTERM');
        // Hard-kill if it's still alive after 3s.
        setTimeout(() => {
          if (proc.exitCode === null) proc.kill('SIGKILL');
        }, 3_000);
      }),
  };
}

test.describe('HMR protocol', () => {
  let dev: DevServer;

  test.beforeAll(async () => {
    dev = await startDev();
  });
  test.afterAll(async () => {
    await dev.stop();
  });

  test('emits a v=2 envelope on file change', async () => {
    // Subscribe to the WS first so we don't miss the broadcast.
    const ws = new WebSocket(`ws://localhost:${dev.port}`);
    await new Promise<void>((res, rej) => {
      ws.once('open', () => res());
      ws.once('error', rej);
    });

    const messagePromise = new Promise<unknown>((res) => {
      ws.once('message', (data) => res(JSON.parse(data.toString()) as unknown));
    });

    // Touch the popup script to trigger a rebuild + broadcast.
    const file = resolve(EXAMPLE, 'src/ui/popup/index.ts');
    const original = readFileSync(file, 'utf8');
    try {
      writeFileSync(file, original + `\n// hmr-trigger ${Date.now()}\n`);
      const msg = (await Promise.race([
        messagePromise,
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('no HMR message in 10s')), 10_000)),
      ])) as { v?: number; type?: string; files?: string[] };

      expect(msg).toBeDefined();
      expect(msg.v).toBe(2);
      expect(['js', 'full-reload', 'manifest', 'css', 'assets']).toContain(msg.type);
      expect(Array.isArray(msg.files)).toBe(true);
    } finally {
      writeFileSync(file, original);
      ws.close();
    }
  });
});
