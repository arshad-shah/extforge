import { describe, it, expect } from 'vitest';
import { runDoctor, type CheckResult } from '../src/core/doctor/index.js';
import { nodeVersionCheck } from '../src/core/doctor/checks/node-version.js';

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
