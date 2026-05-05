import { describe, it, expect, vi } from 'vitest';
import { defineCommand, runMain } from '../src/cli/parser.js';

function withArgv<T>(argv: string[], fn: () => T): T {
  const original = process.argv;
  process.argv = ['node', 'extforge', ...argv];
  try { return fn(); } finally { process.argv = original; }
}

describe('CLI parser', () => {
  it('dispatches to a subcommand and passes parsed args', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const cmd = defineCommand({
      meta: { name: 'extforge' },
      subCommands: {
        build: defineCommand({
          meta: { name: 'build' },
          args: {
            browser: { type: 'string', default: 'chrome' },
            dev: { type: 'boolean', default: false },
            sourcemap: { type: 'boolean', default: false },
          },
          run({ args }) { seen.push(args); },
        }),
      },
    });
    await withArgv(['build', '--browser', 'firefox', '--dev'], () => runMain(cmd));
    expect(seen[0]).toEqual({ browser: 'firefox', dev: true, sourcemap: false });
  });

  it('parses --flag=value form', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const cmd = defineCommand({
      meta: { name: 'x' },
      args: { port: { type: 'string', default: '0' } },
      run({ args }) { seen.push(args); },
    });
    await withArgv(['--port=9999'], () => runMain(cmd));
    expect(seen[0]).toEqual({ port: '9999' });
  });

  it('handles --no-foo to set boolean false', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const cmd = defineCommand({
      meta: { name: 'x' },
      args: { foo: { type: 'boolean', default: true } },
      run({ args }) { seen.push(args); },
    });
    await withArgv(['--no-foo'], () => runMain(cmd));
    expect(seen[0]).toEqual({ foo: false });
  });

  it('passes positionals in declaration order', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const cmd = defineCommand({
      meta: { name: 'x' },
      args: {
        first: { type: 'positional' },
        second: { type: 'positional' },
      },
      run({ args }) { seen.push(args); },
    });
    await withArgv(['hello', 'world'], () => runMain(cmd));
    expect(seen[0]).toEqual({ first: 'hello', second: 'world' });
  });

  it('throws on unknown flag', async () => {
    const cmd = defineCommand({
      meta: { name: 'x' },
      args: { ok: { type: 'boolean' } },
      run() {},
    });
    await expect(withArgv(['--bogus'], () => runMain(cmd))).rejects.toThrow(/Unknown flag: --bogus/);
  });

  it('throws when string flag has no value', async () => {
    const cmd = defineCommand({
      meta: { name: 'x' },
      args: { port: { type: 'string' } },
      run() {},
    });
    await expect(withArgv(['--port'], () => runMain(cmd))).rejects.toThrow(/expects a value/);
  });

  it('throws when required positional is missing', async () => {
    const cmd = defineCommand({
      meta: { name: 'x' },
      args: { name: { type: 'positional', required: true } },
      run() {},
    });
    await expect(withArgv([], () => runMain(cmd))).rejects.toThrow(/Missing required argument: name/);
  });

  it('renders help on --help without throwing or running', async () => {
    const ran = vi.fn();
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const cmd = defineCommand({
      meta: { name: 'extforge', description: 'do stuff' },
      subCommands: {
        build: defineCommand({
          meta: { name: 'build', description: 'build it' },
          run: ran,
        }),
      },
    });
    await withArgv(['--help'], () => runMain(cmd));
    expect(ran).not.toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalled();
    writeSpy.mockRestore();
  });

  it('prints version when --version is passed and meta.version is set', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const cmd = defineCommand({
      meta: { name: 'x', version: '1.2.3' },
      run() {},
    });
    await withArgv(['--version'], () => runMain(cmd));
    const calls = writeSpy.mock.calls.map((c) => c[0] as string);
    expect(calls.some((s) => s.includes('1.2.3'))).toBe(true);
    writeSpy.mockRestore();
  });

  it('treats `--` as a positional separator', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const cmd = defineCommand({
      meta: { name: 'x' },
      args: {
        path: { type: 'positional' },
      },
      run({ args }) { seen.push(args); },
    });
    await withArgv(['--', '--looks-like-a-flag'], () => runMain(cmd));
    expect(seen[0]).toEqual({ path: '--looks-like-a-flag' });
  });
});
