/**
 * Where `extforge diff` gets the two manifests from.
 *
 * `--against` accepts a manifest.json, a build directory (`dist/chrome` or
 * `dist`), or a git ref. A ref is checked out into a temporary worktree and
 * built with the current ExtForge, so plugins, modules and i18n shape its
 * manifest exactly as they would for a release.
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import type { Browser } from '../manifest/types.js';

export interface ManifestSource {
  /** Human label, e.g. `v1.2.0` or `dist/chrome`. */
  label: string;
  manifest: Record<string, unknown>;
}

function git(cwd: string, args: string[]): { ok: boolean; out: string; err: string } {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() };
}

function readManifest(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

/** A manifest.json, `<dir>/manifest.json`, or `<dir>/<browser>/manifest.json`. */
export function manifestInPath(path: string, browser: Browser): string | undefined {
  if (!existsSync(path)) return undefined;
  if (statSync(path).isFile()) return path;
  for (const candidate of [join(path, 'manifest.json'), join(path, browser, 'manifest.json')]) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

export interface RefBuildOptions {
  root: string;
  ref: string;
  browser: Browser;
  /** Builds the project at `projectDir` and returns its output directory for `browser`. */
  buildProject: (projectDir: string, browser: Browser) => Promise<string>;
}

/** Check `ref` out into a temporary worktree, build it, and read the manifest. */
export async function manifestAtRef(opts: RefBuildOptions): Promise<Record<string, unknown>> {
  const { root, ref, browser } = opts;
  const top = git(root, ['rev-parse', '--show-toplevel']);
  if (!top.ok) throw new Error(`Not a git repository, so "${ref}" can't be resolved as a ref.`);
  const commit = git(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  if (!commit.ok) {
    throw new Error(
      `"${ref}" is not a manifest file, a build directory, or a git ref in this repository.`,
    );
  }

  const parent = mkdtempSync(join(tmpdir(), 'extforge-diff-'));
  const worktree = join(parent, 'tree');
  const added = git(top.out, ['worktree', 'add', '--detach', worktree, commit.out]);
  if (!added.ok) {
    rmSync(parent, { recursive: true, force: true });
    throw new Error(`git worktree add failed for "${ref}": ${added.err}`);
  }
  try {
    // git reports the real path; resolve symlinks in `root` too (macOS /var →
    // /private/var), or the relative path escapes the worktree into the live project.
    const inRepo = relative(realpathSync(top.out), realpathSync(root));
    if (inRepo.startsWith('..'))
      throw new Error(`${root} is outside the git repository at ${top.out}.`);
    const projectDir = join(worktree, inRepo);
    // The worktree has no installed dependencies; borrow the current ones so the
    // old config's imports resolve.
    for (const [from, to] of [
      [join(root, 'node_modules'), join(projectDir, 'node_modules')],
      [join(top.out, 'node_modules'), join(worktree, 'node_modules')],
    ] as const) {
      if (existsSync(from) && !existsSync(to)) symlinkSync(from, to, 'dir');
    }
    if (
      !existsSync(projectDir) ||
      !readdirSync(projectDir).some((f) => f.startsWith('extforge.config'))
    ) {
      throw new Error(`No extforge.config at "${ref}" in ${inRepo || '.'}.`);
    }
    const outDir = await opts.buildProject(projectDir, browser);
    const path = manifestInPath(outDir, browser);
    if (!path) throw new Error(`Building "${ref}" produced no manifest.json for ${browser}.`);
    return readManifest(path);
  } finally {
    git(top.out, ['worktree', 'remove', '--force', worktree]);
    rmSync(parent, { recursive: true, force: true });
  }
}

/** Resolve an `--against` value to a manifest. */
export async function resolveSource(
  spec: string,
  opts: Omit<RefBuildOptions, 'ref'>,
): Promise<ManifestSource> {
  const path = manifestInPath(resolve(opts.root, spec), opts.browser);
  if (path) return { label: relative(opts.root, path) || path, manifest: readManifest(path) };
  if (existsSync(resolve(opts.root, spec))) {
    throw new Error(
      `No manifest.json found in "${spec}" (looked for manifest.json and ${opts.browser}/manifest.json).`,
    );
  }
  return { label: spec, manifest: await manifestAtRef({ ...opts, ref: spec }) };
}

/**
 * Whether a pending changeset mentions `token` (a permission name or host
 * pattern). Lets CI allow a disruptive change that someone wrote down.
 */
export function changesetMentions(root: string, token: string): boolean {
  // Nearest .changeset/ at or above root: in a monorepo it sits at the top.
  let dir = join(root, '.changeset');
  for (let cur = resolve(root); !existsSync(dir); ) {
    const parent = dirname(cur);
    if (parent === cur) return false;
    cur = parent;
    dir = join(cur, '.changeset');
  }
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .some((f) => readFileSync(join(dir, f), 'utf8').includes(token));
}
