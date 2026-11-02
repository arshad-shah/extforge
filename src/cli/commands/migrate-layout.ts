import { defineCommand } from '@arshad-shah/clif';

export const migrateLayout = defineCommand({
  name: 'migrate-layout',
  description:
    'Move a legacy project (src/ui, src/content, entry paths in config) to the named layout',
  args: {
    write: {
      type: 'boolean',
      description: 'Apply the changes (default: only print the plan)',
      default: false,
    },
  },
  async handler({ args }) {
    const { existsSync, readFileSync, writeFileSync } = await import('node:fs');
    const { join, relative } = await import('node:path');
    const { loadExtForgeConfig } = await import('../../core/config.js');
    const { createLogger } = await import('../../core/logger/index.js');
    const { applyMigration, planMigration, removeEntryKeys } = await import(
      '../../core/entrypoints/migrate.js'
    );
    const { usesLegacyLayout } = await import('../../core/entrypoints/discover.js');

    const root = process.cwd();
    const log = createLogger({ scope: 'migrate-layout' });
    const config = await loadExtForgeConfig(root);
    if (!usesLegacyLayout(config.manifest, join(root, 'src'))) {
      log.success('Already on the named layout; nothing to do.');
      return;
    }
    const plan = planMigration(root, config.manifest);
    const rel = (p: string) => relative(root, p) || '.';

    log.info('Plan:');
    for (const m of plan.moves) log.info(`  move   ${rel(m.from)} → ${rel(m.to)}`);
    if (plan.contentScript) {
      log.info(
        `  add    defineContentScript({ matches: ${JSON.stringify(plan.contentScript.options.matches)} }) to ${rel(plan.contentScript.file)}`,
      );
    }
    for (const k of plan.configKeys) log.info(`  remove manifest.${k} from extforge.config`);
    log.info('  rewrite relative imports and page/CSS paths that point into moved files');

    if (plan.blockers.length > 0) {
      log.error('Can’t migrate automatically:');
      for (const b of plan.blockers) log.error(`  ${b}`);
      log.info(
        'Nothing was changed. See https://extforge.arshadshah.com/guides/migrate-named-layout/',
      );
      process.exit(1);
    }
    if (!args.flags.write) {
      log.info(
        'Dry run. Run `extforge migrate-layout --write` to apply (commit first so you can review the diff).',
      );
      return;
    }

    const configFile = [
      'extforge.config.ts',
      'extforge.config.mts',
      'extforge.config.js',
      'extforge.config.mjs',
    ]
      .map((f) => join(root, f))
      .find((f) => existsSync(f));
    for (const line of applyMigration(root, plan)) log.success(line);

    // Remove the entry keys, then reload the config to confirm they're gone.
    let configDone = false;
    if (configFile && plan.configKeys.length > 0) {
      const before = readFileSync(configFile, 'utf8');
      const after = removeEntryKeys(before, plan.configKeys);
      if (after) {
        writeFileSync(configFile, after);
        try {
          const reloaded = await loadExtForgeConfig(root);
          configDone = !usesLegacyLayout(reloaded.manifest, join(root, 'src'));
        } catch {
          configDone = false;
        }
        if (!configDone) writeFileSync(configFile, before);
      }
    }
    if (configDone)
      log.success(
        `${rel(configFile as string)}: removed ${plan.configKeys.map((k) => `manifest.${k}`).join(', ')}`,
      );
    else if (plan.configKeys.length > 0) {
      log.warn(
        'Couldn’t edit the config safely, so it was left as it was. Delete these keys by hand:',
      );
      for (const k of plan.configKeys) log.warn(`  manifest.${k}`);
    }
    log.info('Done. Run `extforge build` and check the generated manifest.');
  },
});
