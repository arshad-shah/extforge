import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { build } from '../src/core/builder/index.js';
import { loadExtForgeConfig } from '../src/core/config.js';
import { diffManifests } from '../src/core/diff/index.js';
import { changesetMentions, resolveSource } from '../src/core/diff/sources.js';
import { createLogger, LogLevel } from '../src/core/logger/index.js';
import type { Browser } from '../src/core/manifest/types.js';

const silent = createLogger({ level: LogLevel.Silent });

function git(cwd: string, ...args: string[]): void {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
}

function writeConfig(root: string, permissions: string[]): void {
  writeFileSync(
    join(root, 'extforge.config.ts'),
    `export default ${JSON.stringify({
      browsers: ['chrome'],
      manifest: {
        name: 'DiffExt',
        version: '1.0.0',
        description: 'test',
        manifestVersion: 3,
        permissions: { required: permissions, optional: [], host: [] },
        background: { entrypoint: 'background/index.js' },
      },
    })};\n`,
  );
}

const buildProject = async (dir: string, browser: Browser): Promise<string> => {
  const config = await loadExtForgeConfig(dir);
  return (await build(dir, config, { browser, dev: false }, silent)).outDir;
};

describe('extforge diff sources', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'extforge-diff-repo-'));
    mkdirSync(join(root, 'src/background'), { recursive: true });
    writeFileSync(join(root, 'src/background/index.ts'), 'console.log(1);\n');
    writeFileSync(join(root, 'package.json'), '{"type":"module"}');
    writeConfig(root, ['storage']);
    git(root, 'init', '-q');
    git(root, 'add', '-A');
    git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'v1');
    git(root, 'tag', 'v1.0.0');
    writeConfig(root, ['storage', 'history']);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('builds a git tag in a temporary worktree and diffs it against the current build', async () => {
    const currentDir = await buildProject(root, 'chrome');
    const current = await resolveSource(currentDir, { root, browser: 'chrome', buildProject });
    const base = await resolveSource('v1.0.0', { root, browser: 'chrome', buildProject });

    expect(base.label).toBe('v1.0.0');
    expect(base.manifest.permissions).toEqual(['storage']);
    const changes = diffManifests(base.manifest, current.manifest);
    expect(changes).toContainEqual(
      expect.objectContaining({
        kind: 'added',
        key: 'permissions',
        value: 'history',
        level: 'prompt',
      }),
    );

    // The worktree is cleaned up.
    const list = spawnSync('git', ['worktree', 'list'], { cwd: root, encoding: 'utf8' }).stdout;
    expect(list.trim().split('\n')).toHaveLength(1);
  });

  it('reads a build directory directly', async () => {
    const out = await buildProject(root, 'chrome');
    const source = await resolveSource(out, { root, browser: 'chrome', buildProject });
    expect(source.manifest.permissions).toEqual(['storage', 'history']);
  });

  it('explains when the value is neither a path nor a ref', async () => {
    await expect(
      resolveSource('no-such-tag', { root, browser: 'chrome', buildProject }),
    ).rejects.toThrow(/not a manifest file, a build directory, or a git ref/);
  });

  it('finds permissions mentioned in pending changesets', () => {
    expect(changesetMentions(root, 'history')).toBe(false);
    mkdirSync(join(root, '.changeset'));
    writeFileSync(
      join(root, '.changeset/add-history.md'),
      '---\n"x": minor\n---\n\nNeeds `history`.\n',
    );
    expect(changesetMentions(root, 'history')).toBe(true);
    expect(existsSync(join(root, '.changeset/README.md'))).toBe(false);
    // Found from a nested package too, as in a monorepo.
    mkdirSync(join(root, 'packages/ext'), { recursive: true });
    expect(changesetMentions(join(root, 'packages/ext'), 'history')).toBe(true);
  });
});
