import { defineCommand } from '@arshad-shah/clif';

export const diff = defineCommand({
  name: 'diff',
  description: 'Compare the built manifest against a git ref or another build',
  args: {
    against: {
      type: 'string',
      description:
        'Git ref (tag, branch, commit), build directory, or manifest.json to compare with',
    },
    browser: {
      type: 'string',
      description: 'Browser whose manifest to compare (default: first in config)',
    },
    current: {
      type: 'string',
      description:
        'Build directory or manifest.json for the new side (default: dist, built if missing)',
    },
    'fail-on': {
      type: 'string',
      description: 'Exit 1 if any change is at this level or worse: prompt | review',
    },
    'allow-noted': {
      type: 'boolean',
      description: 'With --fail-on, allow changes that a pending .changeset/*.md mentions',
      default: false,
    },
    json: { type: 'boolean', description: 'Emit machine-readable JSON', default: false },
  },
  async handler({ args }) {
    const { resolve } = await import('node:path');
    const { loadExtForgeConfig } = await import('../../core/config.js');
    const { build } = await import('../../core/builder/index.js');
    const { createLogger, LogLevel } = await import('../../core/logger/index.js');
    const { ALL_BROWSERS } = await import('../../core/manifest/index.js');
    const { diffManifests, formatDiff, meetsLevel, worstLevel } = await import(
      '../../core/diff/index.js'
    );
    const { changesetMentions, manifestInPath, resolveSource } = await import(
      '../../core/diff/sources.js'
    );
    type Browser = (typeof ALL_BROWSERS)[number];

    const root = process.cwd();
    const log = createLogger({
      scope: 'diff',
      level: args.flags.json ? LogLevel.Warn : LogLevel.Info,
    });
    const silent = createLogger({ level: LogLevel.Silent });
    const fail = (message: string): never => {
      log.error(message);
      process.exit(2);
    };

    const against = args.flags.against as string | undefined;
    if (!against) fail('Pass --against <git ref | build dir | manifest.json>.');
    const failOn = args.flags['fail-on'] as string | undefined;
    if (failOn && failOn !== 'prompt' && failOn !== 'review') {
      fail(`--fail-on must be "prompt" or "review", got "${failOn}".`);
    }

    const config = await loadExtForgeConfig(root);
    const browser = (args.flags.browser ?? config.browsers?.[0] ?? 'chrome') as Browser;
    if (!ALL_BROWSERS.includes(browser)) fail(`Invalid browser: ${browser}`);

    const buildProject = async (dir: string, b: Browser): Promise<string> => {
      const cfg = dir === root ? config : await loadExtForgeConfig(dir);
      const result = await build(
        dir,
        { ...cfg, browsers: [b] },
        { browser: b, dev: false },
        silent,
      );
      if (result.errors.length > 0) throw new Error(result.errors.join('\n'));
      return result.outDir;
    };

    try {
      // New side: an explicit path, or the project's build (built now if missing).
      const currentSpec =
        (args.flags.current as string | undefined) ?? config.build?.outDir ?? 'dist';
      let currentPath = manifestInPath(resolve(root, currentSpec), browser);
      if (!currentPath && !args.flags.current) {
        log.info(`No ${browser} build in ${currentSpec}/, building it`);
        currentPath = manifestInPath(await buildProject(root, browser), browser);
      }
      if (!currentPath) fail(`No manifest.json for ${browser} in "${currentSpec}".`);
      const current = await resolveSource(currentPath as string, { root, browser, buildProject });

      if (!args.flags.json) log.info(`Building ${against} for comparison...`);
      const base = await resolveSource(against as string, { root, browser, buildProject });
      const changes = diffManifests(base.manifest, current.manifest);
      const worst = worstLevel(changes);

      const blocking =
        failOn === 'prompt' || failOn === 'review'
          ? changes.filter(
              (c) =>
                meetsLevel(c.level, failOn) &&
                !(
                  args.flags['allow-noted'] &&
                  typeof c.value === 'string' &&
                  changesetMentions(root, c.value)
                ),
            )
          : [];

      if (args.flags.json) {
        process.stdout.write(
          `${JSON.stringify({ browser, against: base.label, current: current.label, worst, changes, blocking }, null, 2)}\n`,
        );
      } else if (changes.length === 0) {
        log.success(`No manifest changes for ${browser} vs ${base.label}`);
      } else {
        process.stdout.write(`\n  Manifest changes for ${browser} vs ${base.label}:\n`);
        for (const line of formatDiff(changes)) process.stdout.write(`  ${line}\n`);
        process.stdout.write('\n');
        if (worst === 'prompt') {
          log.warn(
            'Existing users will be asked to accept new permissions; Chrome disables the extension until they do.',
          );
        }
      }

      if (blocking.length > 0) {
        log.error(
          `${blocking.length} change(s) at "${failOn}" level or worse${
            args.flags['allow-noted'] ? ' not mentioned in a pending changeset' : ''
          }: ${blocking.map((c) => c.value ?? c.key).join(', ')}`,
        );
        process.exit(1);
      }
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
  },
});
