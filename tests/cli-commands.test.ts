import { describe, it, expect } from 'vitest';
import type { CommandDef } from '@arshad-shah/clif';
import { main } from '../src/cli/commands.js';

/**
 * The CLI parser itself is now provided (and tested) by @arshad-shah/clif.
 * These tests guard ExtForge's *wiring*: that the command tree exposes the
 * commands, flags, and defaults we commit to as part of the v1 surface.
 * If a flag is renamed or a default drifts, this fails.
 */

function cmd(name: string): CommandDef {
  const found = (main.commands ?? []).find((c) => c.name === name);
  if (!found) throw new Error(`command not found: ${name}`);
  return found;
}

describe('extforge CLI command tree', () => {
  it('is rooted at `extforge` with a version', () => {
    expect(main.name).toBe('extforge');
    expect(typeof main.version).toBe('string');
    expect(main.version!.length).toBeGreaterThan(0);
  });

  it('exposes exactly the documented commands', () => {
    const names = (main.commands ?? []).map((c) => c.name).sort();
    expect(names).toEqual(
      ['build', 'dev', 'doctor', 'icons', 'init', 'package', 'upgrade', 'validate'],
    );
  });

  it('every command has a description and a handler', () => {
    for (const c of main.commands ?? []) {
      expect(c.description, `${c.name} description`).toBeTruthy();
      expect(typeof c.handler, `${c.name} handler`).toBe('function');
    }
  });

  it('dev keeps its flag defaults', () => {
    const a = cmd('dev').args!;
    expect(a.browser).toMatchObject({ type: 'string', default: 'chrome' });
    expect(a.port).toMatchObject({ type: 'string', default: '35729' });
    expect(a.host).toMatchObject({ type: 'string', default: 'localhost' });
    for (const f of ['quiet', 'verbose', 'json', 'once']) {
      expect(a[f], f).toMatchObject({ type: 'boolean', default: false });
    }
  });

  it('build keeps its flags; --browser has no default (falls back to config)', () => {
    const a = cmd('build').args!;
    expect(a.browser).toMatchObject({ type: 'string' });
    expect(a.browser.default).toBeUndefined();
    for (const f of ['dev', 'sourcemap', 'strict', 'quiet', 'json']) {
      expect(a[f], f).toMatchObject({ type: 'boolean', default: false });
    }
  });

  it('init takes a positional project name (not a flag) plus --defaults/--dir', () => {
    const a = cmd('init').args!;
    expect(a.name).toBeUndefined(); // project name is positional, not a flag
    expect(a.defaults).toMatchObject({ type: 'boolean', default: false });
    expect(a.dir).toMatchObject({ type: 'string' });
  });

  it('package accepts an optional --browser', () => {
    expect(cmd('package').args!.browser).toMatchObject({ type: 'string' });
  });

  it('upgrade and icons take no flags', () => {
    expect(cmd('upgrade').args).toBeUndefined();
    expect(cmd('icons').args).toBeUndefined();
  });
});
