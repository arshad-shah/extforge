import { defineCommand } from '@arshad-shah/clif';

export const doctor = defineCommand({
  name: 'doctor',
  description: 'Diagnose project & environment',
  args: {
    json:  { type: 'boolean', description: 'Emit JSON', default: false },
    quiet: { type: 'boolean', description: 'Suppress info-level output', default: false },
  },
  async handler({ args }) {
    const { runDoctor } = await import('../../core/doctor/index.js');
    const { nodeVersionCheck } = await import('../../core/doctor/checks/node-version.js');
    const { configValidCheck } = await import('../../core/doctor/checks/config-valid.js');
    const { iconsPresentCheck } = await import('../../core/doctor/checks/icons-present.js');
    const { portFreeCheck } = await import('../../core/doctor/checks/port-free.js');
    const { distGitignoredCheck } = await import('../../core/doctor/checks/dist-gitignored.js');
    const { permissionsKnownCheck } = await import('../../core/doctor/checks/permissions-known.js');
    const { browserOverridesCheck } = await import('../../core/doctor/checks/browser-overrides.js');
    const { scriptsPresentCheck } = await import('../../core/doctor/checks/scripts-present.js');
    const { compatCheck } = await import('../../core/doctor/checks/compat.js');
    const { createLogger, LogLevel } = await import('../../core/logger/index.js');

    const checks = [
      nodeVersionCheck, configValidCheck, iconsPresentCheck, portFreeCheck,
      distGitignoredCheck, permissionsKnownCheck, browserOverridesCheck,
      scriptsPresentCheck, compatCheck,
    ];
    const report = await runDoctor(checks, { cwd: process.cwd() });

    if (args.flags.json) {
      process.stdout.write(JSON.stringify({ v: 1, ...report }, null, 2) + '\n');
      process.exit(report.exitCode);
    }
    const log = createLogger({ scope: 'doctor', level: args.flags.quiet ? LogLevel.Warn : LogLevel.Info });
    for (const r of report.results) {
      const fn = r.status === 'pass' ? log.success.bind(log)
              : r.status === 'warn' ? log.warn.bind(log)
              : r.status === 'fail' ? log.error.bind(log)
              : log.info.bind(log);
      fn(`${r.name}: ${r.message}`);
      if (r.hint) log.info(`  hint: ${r.hint}`);
    }
    log.summary('Summary', [
      { label: 'pass', value: String(report.summary.pass) },
      { label: 'warn', value: String(report.summary.warn) },
      { label: 'fail', value: String(report.summary.fail) },
    ]);
    process.exit(report.exitCode);
  },
});
