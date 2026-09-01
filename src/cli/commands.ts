/**
 * ExtForge CLI command tree.
 *
 * Built on @arshad-shah/clif. Each subcommand lives in its own file under
 * `commands/` for maintainability; this module assembles them into the root.
 * Kept separate from `index.ts` (the bin entry) so the tree is importable in
 * tests without triggering `run()`.
 */

import { defineCommand } from '@arshad-shah/clif';
import { getVersion } from '../core/version.js';
import { build } from './commands/build.js';
import { dev } from './commands/dev.js';
import { doctor } from './commands/doctor.js';
import { icons } from './commands/icons.js';
import { init } from './commands/init.js';
import { pkg } from './commands/package.js';
import { upgrade } from './commands/upgrade.js';
import { validate } from './commands/validate.js';

/** Root ExtForge command. `--help` / `--version` are handled by clif. */
export const main = defineCommand({
  name: 'extforge',
  version: getVersion(),
  description: 'The build system for Manifest V3 browser extensions',
  commands: [init, dev, build, validate, doctor, upgrade, pkg, icons],
});
