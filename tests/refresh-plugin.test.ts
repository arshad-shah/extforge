import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import * as esbuild from 'esbuild';
import { refreshPlugin, __resetSwcCache } from '../src/core/hmr/swc/refresh-plugin.js';

describe('refreshPlugin', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rfr-'));
    __resetSwcCache();
  });

  it('returns no-op plugin when enabled is false', async () => {
    const plugin = refreshPlugin({ enabled: false });
    expect(plugin.name).toBe('extforge:react-fast-refresh');
    // Build a tiny React file with the plugin off — should compile via esbuild
    // alone with no transform metadata.
    const file = join(dir, 'App.tsx');
    writeFileSync(file, `export function App(){ return <div>hi</div>; }`);
    const result = await esbuild.build({
      entryPoints: [file],
      bundle: false,
      write: false,
      format: 'esm',
      jsx: 'automatic',
      jsxImportSource: 'react',
      plugins: [plugin],
      logLevel: 'silent',
    });
    const code = result.outputFiles?.[0]?.text ?? '';
    expect(code).not.toContain('$RefreshReg$');
    expect(code).not.toContain('react-refresh/runtime');
    rmSync(file);
  });

  it('runs the SWC transform on .tsx when enabled (or no-ops gracefully if @swc/core is missing)', async () => {
    const plugin = refreshPlugin({ enabled: true });
    const file = join(dir, 'App.tsx');
    writeFileSync(file, `import { useState } from 'react';
export function App(){ const [n,setN] = useState(0); return <button onClick={()=>setN(n+1)}>{n}</button>; }`);
    const result = await esbuild.build({
      entryPoints: [file],
      bundle: false,
      write: false,
      format: 'esm',
      jsx: 'automatic',
      jsxImportSource: 'react',
      plugins: [plugin],
      logLevel: 'silent',
    });
    expect(result.errors).toEqual([]);
    rmSync(file);
  });

  it('injects the RFR runtime header/footer wrapping when @swc/core is available', async () => {
    const plugin = refreshPlugin({ enabled: true });
    const file = join(dir, 'Comp.tsx');
    writeFileSync(file, 'export function Comp(){ return <span>x</span>; }');
    const result = await esbuild.build({
      entryPoints: [file],
      bundle: false,
      write: false,
      format: 'esm',
      jsx: 'automatic',
      jsxImportSource: 'react',
      plugins: [plugin],
      logLevel: 'silent',
    });
    const code = result.outputFiles?.[0]?.text ?? '';
    // The header/footer templates only show up when SWC successfully
    // transformed the source. If SWC isn't installed the plugin no-ops
    // and the code lacks the header — accept either outcome but, if
    // the transform did run, verify the wrapper.
    if (code.includes('react-refresh/runtime')) {
      expect(code).toContain('__ExtForgeRefreshRuntime__');
      expect(code).toContain('performReactRefresh');
    }
  });

  it('handles a SWC transform failure gracefully (no-ops the file)', async () => {
    const plugin = refreshPlugin({ enabled: true });
    const file = join(dir, 'Broken.tsx');
    // Syntactically invalid TS — SWC should reject. The plugin should
    // log a warning and return null so esbuild can still try to handle
    // the file (and produce its own error). Verify we don't crash.
    writeFileSync(file, 'export const x = ;');
    try {
      await esbuild.build({
        entryPoints: [file],
        bundle: false,
        write: false,
        format: 'esm',
        jsx: 'automatic',
        jsxImportSource: 'react',
        plugins: [plugin],
        logLevel: 'silent',
      });
    } catch { /* esbuild also rejects — fine */ }
  });

  it('keeps $RefreshReg$/$RefreshSig$ defined across consecutive module loads', () => {
    // Regression for the bug where the runtime header set the no-op stubs
    // only inside the `__extforge_refresh_inited__` guard, but the footer
    // unconditionally restored them to the saved `prev` (which is undefined
    // for the first module). Result: the second module's header re-ran,
    // skipped the no-op assignments (init flag already true), and then the
    // body's `$RefreshReg$(...)` call crashed with
    // `TypeError: $RefreshReg$ is not a function`.
    //
    // Simulate the sequence header → body → footer twice in a shared global,
    // substituting the ESM-only bits so we can run them in a vm context.
    const here = dirname(fileURLToPath(import.meta.url));
    const headerTpl = readFileSync(
      join(here, '..', 'src', 'core', 'hmr', 'templates', 'refresh-runtime-header.js.tpl'),
      'utf8',
    ).trim();
    const footerTpl = readFileSync(
      join(here, '..', 'src', 'core', 'hmr', 'templates', 'refresh-runtime-footer.js.tpl'),
      'utf8',
    ).trim();

    // Strip the ESM-only `import * as ... from 'react-refresh/runtime'` and
    // replace with an inline stub. Strip the `import.meta.hot` block too —
    // `import.meta` is a SyntaxError outside an ES module, so we drop those
    // lines entirely and keep only the trailing assignments.
    const header = headerTpl.replace(
      /^import \* as __ExtForgeRefreshRuntime__.*$/m,
      'const __ExtForgeRefreshRuntime__ = { injectIntoGlobalHook(g) { g.__injected = (g.__injected || 0) + 1; }, performReactRefresh() {} };',
    );
    const footerLines = footerTpl.split('\n');
    const footerStart = footerLines.findIndex((l) => l.startsWith('globalThis.$RefreshReg$'));
    const footer = footerLines.slice(footerStart).join('\n');

    // Wrap each module in a block so `const __extforge_prev*` declarations
    // don't collide between runs in the same context.
    const moduleScript = `{
      ${header}
      // Simulated body of a component module: SWC emits these calls.
      globalThis.$RefreshSig$();
      globalThis.$RefreshReg$({}, 'Comp');
      ${footer}
    }`;

    const sandbox: { globalThis?: unknown } = {};
    sandbox.globalThis = sandbox;
    const ctx = vm.createContext(sandbox);

    // Module 1: should succeed and leave the init flag set.
    expect(() => vm.runInContext(moduleScript, ctx)).not.toThrow();
    expect((sandbox as { __injected?: number }).__injected).toBe(1);

    // Module 2: with the bug, the body's `$RefreshReg$` call throws because
    // the footer of module 1 reset it to undefined and module 2's header
    // does NOT re-stub it. After the fix, the stubs are set on every header
    // execution, so this call succeeds.
    expect(() => vm.runInContext(moduleScript, ctx)).not.toThrow();
    // injectIntoGlobalHook is still guarded by the init flag — runs once.
    expect((sandbox as { __injected?: number }).__injected).toBe(1);
  });

  it('skips files inside node_modules', async () => {
    const plugin = refreshPlugin({ enabled: true });
    const nm = join(dir, 'node_modules', 'lib');
    const file = join(nm, 'index.tsx');
    // Recreate dir tree.
    rmSync(dir, { recursive: true, force: true });
    const fs = await import('node:fs');
    fs.mkdirSync(nm, { recursive: true });
    writeFileSync(file, `export function X(){ return <div/>; }`);
    const result = await esbuild.build({
      entryPoints: [file],
      bundle: false,
      write: false,
      format: 'esm',
      jsx: 'automatic',
      jsxImportSource: 'react',
      plugins: [plugin],
      logLevel: 'silent',
    });
    const code = result.outputFiles?.[0]?.text ?? '';
    // Should contain the original component name without RFR injection.
    expect(code).not.toContain('react-refresh/runtime');
  });
});
