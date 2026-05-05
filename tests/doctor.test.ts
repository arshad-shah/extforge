import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path/posix';
import { runDoctor, type CheckResult } from '../src/core/doctor/index.js';
import { nodeVersionCheck } from '../src/core/doctor/checks/node-version.js';
import { iconsPresentCheck } from '../src/core/doctor/checks/icons-present.js';
import { distGitignoredCheck } from '../src/core/doctor/checks/dist-gitignored.js';
import { configValidCheck } from '../src/core/doctor/checks/config-valid.js';
import { scriptsPresentCheck } from '../src/core/doctor/checks/scripts-present.js';
import { permissionsKnownCheck } from '../src/core/doctor/checks/permissions-known.js';
import { browserOverridesCheck } from '../src/core/doctor/checks/browser-overrides.js';
import { portFreeCheck } from '../src/core/doctor/checks/port-free.js';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'extforge-doctor-'));
}

describe('doctor', () => {
  it('runs a list of checks and aggregates results', async () => {
    const ok: CheckResult = { name: 'ok', status: 'pass', message: 'fine' };
    const warn: CheckResult = { name: 'w', status: 'warn', message: 'meh' };
    const report = await runDoctor([
      { name: 'ok', run: async () => ok },
      { name: 'w',  run: async () => warn },
    ], { cwd: process.cwd() });
    expect(report.results).toHaveLength(2);
    expect(report.summary.pass).toBe(1);
    expect(report.summary.warn).toBe(1);
    expect(report.exitCode).toBe(0);
  });

  it('exits 1 when any check fails', async () => {
    const fail: CheckResult = { name: 'f', status: 'fail', message: 'broken' };
    const report = await runDoctor([{ name: 'f', run: async () => fail }], { cwd: process.cwd() });
    expect(report.exitCode).toBe(1);
  });

  it('captures thrown errors as fail results', async () => {
    const report = await runDoctor([
      { name: 'thrower', run: async () => { throw new Error('boom'); } },
    ], { cwd: process.cwd() });
    expect(report.results[0].status).toBe('fail');
    expect(report.results[0].message).toContain('boom');
  });

  it('node version check runs and returns pass or fail', async () => {
    const r = await nodeVersionCheck.run({ cwd: process.cwd() });
    expect(['pass', 'fail']).toContain(r.status);
  });
});

describe('iconsPresentCheck', () => {
  it('passes when all required icons exist', async () => {
    const cwd = tempDir();
    mkdirSync(join(cwd, 'icons'));
    for (const s of [16, 32, 48, 128]) writeFileSync(join(cwd, `icons/icon-${s}.png`), '');
    const r = await iconsPresentCheck.run({ cwd });
    expect(r.status).toBe('pass');
  });
  it('warns when icons are missing', async () => {
    const cwd = tempDir();
    const r = await iconsPresentCheck.run({ cwd });
    expect(r.status).toBe('warn');
  });
});

describe('distGitignoredCheck', () => {
  it('passes when dist is gitignored', async () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, '.gitignore'), 'node_modules\ndist/\n');
    const r = await distGitignoredCheck.run({ cwd });
    expect(r.status).toBe('pass');
  });
  it('warns when dist is not gitignored', async () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, '.gitignore'), 'node_modules\n');
    const r = await distGitignoredCheck.run({ cwd });
    expect(r.status).toBe('warn');
  });
});

describe('configValidCheck', () => {
  it('passes when config is valid', async () => {
    const cwd = tempDir();
    writeFileSync(
      join(cwd, 'extforge.config.ts'),
      'export default { browsers: ["chrome"], manifest: { name: "x", version: "0.0.1" } }',
    );
    const r = await configValidCheck.run({ cwd });
    expect(r.status).toBe('pass');
  });
  it('fails when config is invalid', async () => {
    const cwd = tempDir();
    writeFileSync(
      join(cwd, 'extforge.config.ts'),
      'export default { browsers: ["brave"] }',
    );
    const r = await configValidCheck.run({ cwd });
    expect(r.status).toBe('fail');
  });
});

describe('scriptsPresentCheck', () => {
  it('passes when recommended scripts are present', async () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ scripts: { dev: 'x', build: 'x', package: 'x' } }));
    const r = await scriptsPresentCheck.run({ cwd });
    expect(r.status).toBe('pass');
  });
  it('reports info when scripts are missing', async () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ scripts: { dev: 'x' } }));
    const r = await scriptsPresentCheck.run({ cwd });
    expect(r.status).toBe('info');
  });
});

describe('permissionsKnownCheck', () => {
  it('passes when all permissions are known', async () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, 'extforge.config.ts'),
      'export default { browsers: ["chrome"], manifest: { name: "x", version: "0.0.1", permissions: ["storage", "tabs"] } }');
    const r = await permissionsKnownCheck.run({ cwd });
    expect(r.status).toBe('pass');
  });
  it('warns when an unknown permission is present', async () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, 'extforge.config.ts'),
      'export default { browsers: ["chrome"], manifest: { name: "x", version: "0.0.1", permissions: ["bogus"] } }');
    const r = await permissionsKnownCheck.run({ cwd });
    expect(r.status).toBe('warn');
  });
});

describe('browserOverridesCheck', () => {
  it('passes when overrides match declared browsers', async () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, 'extforge.config.ts'),
      'export default { browsers: ["chrome", "firefox"], manifest: { name: "x", version: "0.0.1", browsers: { chrome: {} } } }');
    const r = await browserOverridesCheck.run({ cwd });
    expect(r.status).toBe('pass');
  });
  it('warns on stray override', async () => {
    const cwd = tempDir();
    // Use 'edge' as the stray override — it's not in DEFAULT_CONFIG.browsers (['chrome','firefox'])
    // so it remains stray after c12 merges defaults.
    writeFileSync(join(cwd, 'extforge.config.ts'),
      'export default { browsers: ["chrome"], manifest: { name: "x", version: "0.0.1", browsers: { edge: {} } } }');
    const r = await browserOverridesCheck.run({ cwd });
    expect(r.status).toBe('warn');
  });
});

describe('portFreeCheck', () => {
  it('returns pass or warn', async () => {
    const r = await portFreeCheck.run({ cwd: process.cwd() });
    expect(['pass', 'warn']).toContain(r.status);
  });
});
