/**
 * Cross-browser build gate.
 *
 * Builds every example extension for all four supported targets and asserts the
 * emitted manifest is well-formed and carries the target's browser-specific
 * shape. This is the v1 gate for "the build works on Chrome, Firefox, Safari
 * and Edge" — the Playwright suite in `tests-e2e/` covers live-browser
 * behaviour, but only on Chromium, so without this nothing checks that a
 * Firefox or Safari build even produces a loadable manifest.
 *
 * Run: pnpm check:cross-browser  (requires `pnpm build` first)
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(root, 'dist/cli/index.js');
const examplesDir = join(root, 'examples');

const BROWSERS = ['chrome', 'firefox', 'edge', 'safari'] as const;
type Browser = (typeof BROWSERS)[number];

/** Background is a service worker everywhere except Firefox, which uses scripts. */
function expectedBackgroundKey(browser: Browser): 'service_worker' | 'scripts' {
  return browser === 'firefox' ? 'scripts' : 'service_worker';
}

const failures: string[] = [];

function check(condition: boolean, message: string): void {
  if (!condition) failures.push(message);
}

if (!existsSync(cli)) {
  console.error(`✗ ${cli} not found — run \`pnpm build\` first.`);
  process.exit(1);
}

const examples = readdirSync(examplesDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(examplesDir, e.name, 'package.json')))
  .map((e) => e.name);

if (examples.length === 0) {
  console.error('✗ No examples found.');
  process.exit(1);
}

console.log(`Cross-browser build check: ${examples.length} examples × ${BROWSERS.length} targets`);

for (const example of examples) {
  const cwd = join(examplesDir, example);

  for (const browser of BROWSERS) {
    const label = `${example} → ${browser}`;
    const run = spawnSync(process.execPath, [cli, 'build', '--browser', browser, '--quiet'], {
      cwd,
      stdio: 'pipe',
      encoding: 'utf8',
    });

    if (run.status !== 0) {
      failures.push(`${label}: build exited ${run.status}\n${run.stderr || run.stdout}`);
      console.log(`  ✗ ${label}`);
      continue;
    }

    const manifestPath = join(cwd, 'dist', browser, 'manifest.json');
    if (!existsSync(manifestPath)) {
      failures.push(`${label}: no manifest at dist/${browser}/manifest.json`);
      console.log(`  ✗ ${label}`);
      continue;
    }

    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch (err) {
      failures.push(`${label}: manifest is not valid JSON — ${String(err)}`);
      console.log(`  ✗ ${label}`);
      continue;
    }

    const before = failures.length;

    check(manifest.manifest_version === 3, `${label}: manifest_version is not 3`);
    check(typeof manifest.name === 'string', `${label}: missing name`);
    check(typeof manifest.version === 'string', `${label}: missing version`);

    const background = manifest.background as Record<string, unknown> | undefined;
    if (background) {
      const key = expectedBackgroundKey(browser);
      check(key in background, `${label}: background should use \`${key}\``);
    }

    // Firefox is the only target that needs an addon id declared.
    check(
      browser === 'firefox'
        ? 'browser_specific_settings' in manifest
        : !('browser_specific_settings' in manifest),
      `${label}: browser_specific_settings should be present only for firefox`,
    );

    console.log(`  ${failures.length === before ? '✓' : '✗'} ${label}`);
  }
}

if (failures.length > 0) {
  console.error(`\n✗ ${failures.length} cross-browser failure(s):\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('\n✓ All examples build cleanly for chrome, firefox, edge and safari.');
