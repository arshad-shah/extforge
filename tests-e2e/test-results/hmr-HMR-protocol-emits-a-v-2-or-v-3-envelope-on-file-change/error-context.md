# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: hmr.spec.ts >> HMR protocol >> emits a v=2 or v=3 envelope on file change
- Location: specs/hmr.spec.ts:75:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "hmr-update"
Received: "build-ok"
```

# Test source

```ts
  3   | import { writeFileSync, readFileSync } from 'node:fs';
  4   | import { resolve } from 'node:path';
  5   | import { fileURLToPath } from 'node:url';
  6   | import WebSocket from 'ws';
  7   | 
  8   | const __dirname = fileURLToPath(new URL('.', import.meta.url));
  9   | const REPO_ROOT = resolve(__dirname, '..', '..');
  10  | const EXAMPLE = resolve(REPO_ROOT, 'examples/vanilla-popup');
  11  | const EXTFORGE_BIN = resolve(REPO_ROOT, 'dist/cli/index.js');
  12  | 
  13  | interface DevServer {
  14  |   proc: ChildProcess;
  15  |   port: number;
  16  |   stop: () => Promise<void>;
  17  | }
  18  | 
  19  | async function startDev(): Promise<DevServer> {
  20  |   // Invoke the local extforge build via its absolute dist path. `pnpm exec
  21  |   // extforge` doesn't work in CI because pnpm's bin symlink is missed when
  22  |   // `pnpm install` runs before the workspace package's `dist/` exists.
  23  |   const proc = spawn(process.execPath, [EXTFORGE_BIN, 'dev', '--browser', 'chrome'], {
  24  |     cwd: EXAMPLE,
  25  |     stdio: ['ignore', 'pipe', 'pipe'],
  26  |     env: { ...process.env, FORCE_COLOR: '0' },
  27  |   });
  28  | 
  29  |   const port = await new Promise<number>((resolveP, rejectP) => {
  30  |     const timeout = setTimeout(() => rejectP(new Error('dev server did not start in 30s')), 30_000);
  31  |     const onData = (buf: Buffer): void => {
  32  |       const s = buf.toString();
  33  |       const m = /HMR server listening on ws:\/\/[^:]+:(\d+)/.exec(s);
  34  |       if (m) {
  35  |         clearTimeout(timeout);
  36  |         proc.stdout?.off('data', onData);
  37  |         proc.stderr?.off('data', onData);
  38  |         resolveP(parseInt(m[1]!, 10));
  39  |       }
  40  |     };
  41  |     proc.stdout?.on('data', onData);
  42  |     proc.stderr?.on('data', onData);
  43  |     proc.once('exit', (code) => {
  44  |       clearTimeout(timeout);
  45  |       rejectP(new Error(`dev server exited early (code ${code})`));
  46  |     });
  47  |   });
  48  | 
  49  |   return {
  50  |     proc,
  51  |     port,
  52  |     stop: () =>
  53  |       new Promise<void>((res) => {
  54  |         if (proc.exitCode !== null) return res();
  55  |         proc.once('exit', () => res());
  56  |         proc.kill('SIGTERM');
  57  |         // Hard-kill if it's still alive after 3s.
  58  |         setTimeout(() => {
  59  |           if (proc.exitCode === null) proc.kill('SIGKILL');
  60  |         }, 3_000);
  61  |       }),
  62  |   };
  63  | }
  64  | 
  65  | test.describe('HMR protocol', () => {
  66  |   let dev: DevServer;
  67  | 
  68  |   test.beforeAll(async () => {
  69  |     dev = await startDev();
  70  |   });
  71  |   test.afterAll(async () => {
  72  |     await dev.stop();
  73  |   });
  74  | 
  75  |   test('emits a v=2 or v=3 envelope on file change', async () => {
  76  |     // Subscribe to the WS first so we don't miss the broadcast.
  77  |     const ws = new WebSocket(`ws://localhost:${dev.port}`);
  78  |     await new Promise<void>((res, rej) => {
  79  |       ws.once('open', () => res());
  80  |       ws.once('error', rej);
  81  |     });
  82  | 
  83  |     const messagePromise = new Promise<unknown>((res) => {
  84  |       ws.once('message', (data) => res(JSON.parse(data.toString()) as unknown));
  85  |     });
  86  | 
  87  |     // Touch the popup script to trigger a rebuild + broadcast.
  88  |     const file = resolve(EXAMPLE, 'src/ui/popup/index.ts');
  89  |     const original = readFileSync(file, 'utf8');
  90  |     try {
  91  |       writeFileSync(file, original + `\n// hmr-trigger ${Date.now()}\n`);
  92  |       const msg = (await Promise.race([
  93  |         messagePromise,
  94  |         new Promise<never>((_, rej) => setTimeout(() => rej(new Error('no HMR message in 10s')), 10_000)),
  95  |       ])) as { v?: number; type?: string; files?: string[] };
  96  | 
  97  |       expect(msg).toBeDefined();
  98  |       // Servers since v3 may emit either v2 (reload-style) or v3 (hmr-update)
  99  |       // envelopes depending on what changed. UI-only JS edits land in v3.
  100 |       expect([2, 3]).toContain(msg.v);
  101 |       if (msg.v === 3) {
  102 |         // v3 hmr-update envelope: { v:3, type:'hmr-update', updates:[{id,hash,file}] }
> 103 |         expect((msg as unknown as { type: string }).type).toBe('hmr-update');
      |                                                           ^ Error: expect(received).toBe(expected) // Object.is equality
  104 |       } else {
  105 |         expect(['js', 'full-reload', 'manifest', 'css', 'assets']).toContain(msg.type);
  106 |         expect(Array.isArray(msg.files)).toBe(true);
  107 |       }
  108 |     } finally {
  109 |       writeFileSync(file, original);
  110 |       ws.close();
  111 |     }
  112 |   });
  113 | });
  114 | 
```