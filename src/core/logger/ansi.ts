/**
 * Color palette for the logger — backed by `@arshad-shah/clif`.
 *
 * clif owns both the ANSI generation and the detection logic: it honors
 * `NO_COLOR` (https://no-color.org), `FORCE_COLOR`, `TERM=dumb`, and TTY/pipe
 * detection, so callers never gate on color themselves — a disabled terminal
 * simply gets the plain string back.
 *
 * The formatters are re-exported in a picocolors-shaped default object so the
 * public `colors` export of `extforge/logger` keeps its `colors.cyan('x')`
 * shape for plugins that want to match ExtForge's look-and-feel.
 */

import { blue, bold, cyan, dim, gray, green, magenta, red, white, yellow } from '@arshad-shah/clif';

export { blue, bold, cyan, dim, gray, green, magenta, red, white, yellow };

const pc = { red, green, yellow, blue, magenta, cyan, white, gray, dim, bold };
export default pc;
