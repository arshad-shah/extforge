import { defineCommand } from '@arshad-shah/clif';

export const pkg = defineCommand({
  name: 'package',
  description: 'Create .zip archives for stores',
  args: { browser: { type: 'string', description: 'Single browser' } },
  async handler({ args }) {
    const { existsSync, mkdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { loadExtForgeConfig } = await import('../../core/config.js');
    const { createLogger } = await import('../../core/logger/index.js');
    const { ALL_BROWSERS } = await import('../../core/manifest/index.js');
    const { archiveFilename, packageBrowser } = await import('../package-cmd.js');

    const log = createLogger({ scope: 'extforge' });
    const config = await loadExtForgeConfig(process.cwd());
    const browser = args.flags.browser as string | undefined;
    const browsers = browser ? [browser] : (config.browsers ?? ALL_BROWSERS);
    const pkgDir = join(process.cwd(), 'packages');
    mkdirSync(pkgDir, { recursive: true });

    for (const b of browsers) {
      const dist = join(process.cwd(), 'dist', b);
      if (!existsSync(dist)) { log.warn(`No build for ${b} — run \`extforge build\` first`); continue; }
      const name = archiveFilename(config.manifest?.name, config.manifest?.version, b);
      const archive = join(pkgDir, name);
      try {
        await packageBrowser({ dist, archive, log });
        log.success(`Packaged ${b} → packages/${name}`);
      } catch (err) {
        log.error(`Failed to package ${b}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  },
});
