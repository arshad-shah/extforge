/**
 * Internal ANSI helper. Replaces `picocolors` with ~50 LOC. Honors NO_COLOR
 * (https://no-color.org), FORCE_COLOR, TERM=dumb, and isTTY.
 *
 * Public API matches the subset of picocolors we use: red, yellow, green,
 * blue, magenta, cyan, gray, dim, bold. Each is a function `(s: string) => string`.
 *
 * Functions accept `unknown` and coerce to string so `pc.dim(123)` keeps
 * working without extra ceremony at call sites.
 */

const supports = (() => {
  if (typeof process === 'undefined') return false;
  if (process.env['FORCE_COLOR'] === '1') return true;
  if (process.env['NO_COLOR'] === '1' || process.env['NO_COLOR'] === 'true') return false;
  if (process.env['TERM'] === 'dumb') return false;
  return Boolean(process.stdout?.isTTY);
})();

function wrap(open: number, close: number): (s: unknown) => string {
  if (!supports) return (s) => String(s);
  return (s) => `[${open}m${String(s)}[${close}m`;
}

export const red     = wrap(31, 39);
export const green   = wrap(32, 39);
export const yellow  = wrap(33, 39);
export const blue    = wrap(34, 39);
export const magenta = wrap(35, 39);
export const cyan    = wrap(36, 39);
export const white   = wrap(37, 39);
export const gray    = wrap(90, 39);
export const dim     = wrap(2, 22);
export const bold    = wrap(1, 22);

/**
 * picocolors-shaped default export so `import pc from '…/ansi.js'` works at
 * call sites that previously imported picocolors.
 */
const pc = { red, green, yellow, blue, magenta, cyan, white, gray, dim, bold };
export default pc;
