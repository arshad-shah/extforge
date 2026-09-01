/**
 * ExtForge CSS pipeline.
 *
 * ExtForge ships three built-in CSS strategies — `tailwind`, `vanilla`
 * (plain CSS, copied through), and `none` — but the pipeline is open. Point
 * `css` at a custom {@link CssProcessor} (a programmatic `transform`, or a
 * CLI `command`), or register an `onCssTransform` hook from a plugin, and any
 * styling toolchain can plug in: Sass, Less, Lightning CSS, UnoCSS,
 * vanilla-extract output, PostCSS pipelines, etc.
 *
 * Every stylesheet flows through the same two stages:
 *   1. the base processor resolved from `config.css`, then
 *   2. the `onCssTransform` plugin chain (each step gets the previous output).
 *
 * All child processes are spawned without a shell, so project paths
 * containing spaces or shell metacharacters can never inject a command.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Logger } from '../logger/index.js';

/** Context handed to every CSS transform — built-in, config, or plugin. */
export interface CssTransformContext {
  /**
   * Current CSS source. For chained transforms this is the previous step's
   * output, so a transform can build on what ran before it.
   */
  code: string;
  /** Absolute path to the input stylesheet. */
  file: string;
  /** Absolute path the processed CSS will be written to. */
  outFile: string;
  /** Absolute project root. */
  root: string;
  /** Absolute source directory. */
  srcDir: string;
  /** True for dev builds — skip minification and keep sources readable. */
  dev: boolean;
}

/**
 * A programmatic CSS transform. Receives the current source and returns the
 * processed CSS. Returning `undefined` (or nothing) means "no change" and
 * leaves the previous output untouched.
 */
export type CssTransform = (ctx: CssTransformContext) => string | void | Promise<string | void>;

/**
 * A custom CSS processor for `config.css`. Provide a programmatic
 * `transform`, a CLI `command` (+ `args`), or both (the command runs first,
 * then the transform post-processes its output).
 *
 * CLI args support two placeholders, substituted with absolute paths:
 *   - `{input}`  — the source stylesheet.
 *   - `{output}` — the file ExtForge expects the processed CSS at.
 *
 * If `{output}` appears in `args`, ExtForge reads the file the tool wrote.
 * Otherwise the source is piped to the command's stdin and its stdout is
 * captured as the result.
 */
export interface CssProcessor {
  /** Identifier surfaced in build logs. */
  name: string;
  /** Programmatic transform. Runs after `command`, if both are given. */
  transform?: CssTransform;
  /** Executable to spawn (no shell). For example `'npx'` or `'sass'`. */
  command?: string;
  /** Arguments for `command`. `{input}` / `{output}` are replaced with paths. */
  args?: string[];
}

/** Built-in preset names. */
export type CssPreset = 'tailwind' | 'vanilla' | 'none';

/** Anything accepted by `config.css`. */
export type CssOption = CssPreset | CssProcessor;

/** The built-in preset names, in scaffold/menu order. */
export const CSS_PRESETS: readonly CssPreset[] = ['tailwind', 'vanilla', 'none'];

/** True when `v` is one of the built-in {@link CSS_PRESETS}. */
export function isCssPreset(v: unknown): v is CssPreset {
  return typeof v === 'string' && (CSS_PRESETS as readonly string[]).includes(v);
}

/**
 * Normalise `config.css` into a {@link CssProcessor}. A preset string (or an
 * absent value) becomes a bare processor whose `name` drives the built-in
 * behaviour; an object is passed through unchanged.
 */
export function resolveCssProcessor(css: CssOption | undefined): CssProcessor {
  if (css && typeof css === 'object') return css;
  return { name: css ?? 'tailwind' };
}

/** Run the Tailwind CLI, returning compiled CSS, or `null` to fall back to a copy. */
function runTailwind(ctx: CssTransformContext, log: Logger): string | null {
  // Probe with an arg array (no shell) so a project root with spaces or shell
  // metacharacters can't smuggle a command in.
  const probe = spawnSync('npx', ['tailwindcss', '--help'], { stdio: 'ignore', shell: false });
  if (probe.status !== 0) {
    log.debug(`Tailwind CLI unavailable; copying CSS as-is: ${ctx.file}`);
    return null;
  }
  const args = ['tailwindcss', '-i', ctx.file, '-o', ctx.outFile];
  // Don't force --minify in dev — keeps source readable and avoids extra work
  // on every rebuild.
  if (!ctx.dev) args.push('--minify');
  const result = spawnSync('npx', args, { stdio: 'pipe', shell: false });
  if (result.status !== 0) {
    log.debug(`Tailwind build failed; copying CSS as-is: ${ctx.file}`);
    return null;
  }
  // Tailwind wrote ctx.outFile directly; read it back so the plugin chain can
  // post-process the compiled output.
  return readFileSync(ctx.outFile, 'utf8');
}

/** Run a custom CLI processor. Returns the processed CSS, or `null` on failure. */
function runCommand(proc: CssProcessor, ctx: CssTransformContext, log: Logger): string | null {
  if (!proc.command) return null;
  const args = (proc.args ?? []).map((a) =>
    a.replaceAll('{input}', ctx.file).replaceAll('{output}', ctx.outFile),
  );
  const writesOutput = args.includes(ctx.outFile);
  const result = spawnSync(proc.command, args, {
    stdio: 'pipe',
    shell: false,
    // No {output}: stream source → stdin, capture stdout as the result.
    input: writesOutput ? undefined : ctx.code,
  });
  if (result.status !== 0) {
    const stderr = result.stderr?.toString().trim();
    log.warn(
      `CSS processor "${proc.name}" failed (exit ${result.status}); copying source.` +
        (stderr ? `\n${stderr}` : ''),
    );
    return null;
  }
  return writesOutput ? readFileSync(ctx.outFile, 'utf8') : result.stdout.toString();
}

/** Apply the base processor (built-in preset, or a custom command/transform). */
async function applyBaseProcessor(
  proc: CssProcessor,
  ctx: CssTransformContext,
  log: Logger,
): Promise<string> {
  const isBuiltin = !proc.transform && !proc.command;
  if (isBuiltin) {
    // `vanilla` and `none` copy the source through untouched; `tailwind`
    // compiles via the CLI (falling back to a copy when it's unavailable).
    if (proc.name === 'tailwind') return runTailwind(ctx, log) ?? ctx.code;
    return ctx.code;
  }

  let code = ctx.code;
  if (proc.command) {
    const out = runCommand(proc, { ...ctx, code }, log);
    if (out !== null) code = out;
  }
  if (proc.transform) {
    const out = await proc.transform({ ...ctx, code });
    if (typeof out === 'string') code = out;
  }
  return code;
}

/**
 * Process a single stylesheet end to end: base processor, then the plugin
 * `onCssTransform` chain, then write the result to `output`. No-op when the
 * input file doesn't exist.
 */
export async function processStylesheet(
  input: string,
  output: string,
  processor: CssProcessor,
  pluginChain: ((ctx: CssTransformContext) => Promise<string>) | undefined,
  base: { root: string; srcDir: string; dev: boolean },
  log: Logger,
): Promise<void> {
  if (!existsSync(input)) return;
  mkdirSync(dirname(output), { recursive: true });

  const ctx: CssTransformContext = {
    code: readFileSync(input, 'utf8'),
    file: input,
    outFile: output,
    root: base.root,
    srcDir: base.srcDir,
    dev: base.dev,
  };

  ctx.code = await applyBaseProcessor(processor, ctx, log);
  if (pluginChain) ctx.code = await pluginChain(ctx);

  writeFileSync(output, ctx.code);
  log.debug(`Processed CSS (${processor.name}): ${input}`);
}
