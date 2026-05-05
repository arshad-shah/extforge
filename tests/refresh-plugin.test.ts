import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
