/**
 * CI-side freshness check for the committed @mdn/browser-compat-data
 * snapshot at src/core/compat/data.json.
 *
 * The snapshot is regenerated via `pnpm compat:rebuild` (runs
 * src/core/compat/build-data.ts). MDN ships BCD updates roughly every
 * other week; we let the snapshot age up to STALE_AFTER_DAYS before
 * failing CI, so the warning surfaces well before a real Chrome /
 * Firefox / Safari release lands without us noticing.
 *
 * Exit codes:
 *   0 — snapshot is fresh enough
 *   2 — snapshot is stale, run `pnpm compat:rebuild` and commit the diff
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const STALE_AFTER_DAYS = 90;

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = join(__dirname, '..', 'src', 'core', 'compat', 'data.json');

// Use the git log timestamp rather than filesystem mtime — fresh clones
// (CI, contributor laptops) all have a recent mtime regardless of when
// the file was last touched in the repo.
//
// spawnSync with an argv array (no shell) so the path argument can't be
// interpreted as additional shell syntax.
function lastGitCommitMs(file: string): number | null {
  const r = spawnSync('git', ['log', '-1', '--format=%ct', '--', file], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  if (r.status !== 0) return null;
  const ts = r.stdout?.toString().trim();
  if (!ts) return null;
  return Number(ts) * 1000;
}

const last = lastGitCommitMs(dataPath);
if (last === null) {
  console.warn('[bcd-freshness] git log unavailable — skipping check');
  process.exit(0);
}
const ageDays = (Date.now() - last) / (1000 * 60 * 60 * 24);
const fmt = ageDays.toFixed(1);

if (ageDays > STALE_AFTER_DAYS) {
  console.error(`[bcd-freshness] data.json is ${fmt} days old (threshold ${STALE_AFTER_DAYS}).`);
  console.error('[bcd-freshness] Run `pnpm compat:rebuild` and commit the diff.');
  process.exit(2);
}
console.log(`[bcd-freshness] data.json is ${fmt} days old — OK`);
