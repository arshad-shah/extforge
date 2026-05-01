export type CheckStatus = 'pass' | 'warn' | 'fail' | 'info';

export interface CheckContext {
  cwd: string;
}

export interface CheckResult {
  name: string;
  status: CheckStatus;
  message: string;
  hint?: string;
}

export interface Check {
  name: string;
  run(ctx: CheckContext): Promise<CheckResult>;
}

export interface DoctorReport {
  results: CheckResult[];
  summary: { pass: number; warn: number; fail: number; info: number };
  exitCode: 0 | 1;
}

export async function runDoctor(checks: Check[], ctx: CheckContext): Promise<DoctorReport> {
  const results: CheckResult[] = [];
  for (const c of checks) {
    try {
      results.push(await c.run(ctx));
    } catch (err) {
      results.push({
        name: c.name,
        status: 'fail',
        message: `Check threw: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
  const summary = { pass: 0, warn: 0, fail: 0, info: 0 };
  for (const r of results) summary[r.status]++;
  return { results, summary, exitCode: summary.fail > 0 ? 1 : 0 };
}
