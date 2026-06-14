/**
 * Centralized CLI error handling.
 *
 * Wraps `runMain` with friendly formatting for known error shapes and
 * installs process-level guards so unhandled rejections / uncaught
 * exceptions don't dump raw stack traces on users.
 */

import { style, link } from '@arshad-shah/clif';
import { isExtForgeError } from '../core/errors/index.js';

export interface FormattedError {
  title: string;
  detail?: string;
  hint?: string;
  docsUrl?: string;
  cause?: unknown;
}

const KNOWN_ERROR_HINTS: Array<[RegExp, string]> = [
  [/EADDRINUSE/, 'Another process is using this port. Try a different --port or stop the conflicting process.'],
  [/ENOENT.*hmr-client\.js\.tpl/, 'ExtForge templates are missing from the install. Reinstall extforge: `pnpm i -D extforge` (or npm/yarn).'],
  [/ENOENT.*manifest/, 'No manifest config found. Add a `manifest` block to extforge.config.ts.'],
  [/ENOENT.*extforge\.config/, 'No extforge.config.ts found in the current directory. Run `extforge init` to scaffold a project.'],
  [/EACCES/, 'Permission denied. Check file permissions on the affected path.'],
  [/Cannot find module 'esbuild'/, 'esbuild is a peer dependency. Install it: `pnpm i -D esbuild`.'],
];

export function formatError(err: unknown): FormattedError {
  if (isExtForgeError(err)) {
    const loc = err.file
      ? ` (${err.file}${err.line ? `:${err.line}` : ''}${err.column ? `:${err.column}` : ''})`
      : '';
    return {
      title: err.code,
      detail: `${err.message}${loc}`,
      hint: err.hint,
      docsUrl: err.docsUrl,
      cause: err,
    };
  }
  if (err instanceof Error) {
    const msg = err.message;
    const hint = KNOWN_ERROR_HINTS.find(([re]) => re.test(msg))?.[1];
    return { title: err.name === 'Error' ? 'Command failed' : err.name, detail: msg, hint, cause: err };
  }
  return { title: 'Command failed', detail: String(err) };
}

/**
 * Top-level CLI error renderer. Uses console.error directly because this runs
 * at the outermost edge — before any per-command logger has been created and
 * after any logger has potentially been torn down. Going through Logger here
 * would require a global default that doesn't exist yet.
 */
export function printError(err: unknown): void {
  const f = formatError(err);
  /* eslint-disable no-console */
  // Rendered with clif's `style`/`link` — it owns NO_COLOR / FORCE_COLOR / pipe
  // detection, and `link` emits an OSC 8 hyperlink in capable terminals while
  // degrading to `Docs → (url)` everywhere else, so the URL is never lost.
  console.error('');
  console.error(style.bold.red(`✖ ${f.title}`));
  if (f.detail) console.error(`  ${f.detail}`);
  if (f.hint) {
    console.error('');
    console.error(style.dim(`  Hint: ${f.hint}`));
  }
  if (f.docsUrl) console.error('  ' + style.dim('Docs: ') + style.cyan(link('Docs →', f.docsUrl)));
  if (process.env.EXTFORGE_DEBUG && f.cause instanceof Error && f.cause.stack) {
    console.error('');
    console.error(style.dim(f.cause.stack));
  } else if (f.cause instanceof Error) {
    console.error('');
    console.error(style.dim('  Run with EXTFORGE_DEBUG=1 to see the full stack trace.'));
  }
  console.error('');
  /* eslint-enable no-console */
}

/**
 * Install process-level handlers. Idempotent — safe to call once at CLI startup.
 */
export function installProcessGuards(): void {
  if ((globalThis as any).__extforgeGuardsInstalled) return;
  (globalThis as any).__extforgeGuardsInstalled = true;

  process.on('unhandledRejection', (reason) => {
    printError(reason);
    process.exit(1);
  });

  process.on('uncaughtException', (err) => {
    printError(err);
    process.exit(1);
  });

  // Intentionally no SIGINT/SIGTERM handler here: long-running commands
  // (e.g. `extforge dev`) register their own async shutdown to flush the
  // HMR server / watchers / esbuild context. A synchronous `process.exit`
  // installed here would run first (handler-registration order) and beat
  // those graceful-shutdown listeners. For short-lived commands, Node's
  // default SIGINT behaviour (exit 128+signal) is already correct.
}

/**
 * Run a CLI entry function with formatted error handling. Use as the
 * outermost wrapper around the clif `cli.run(...)` call.
 */
export async function withErrorHandler(fn: () => Promise<void> | void): Promise<void> {
  installProcessGuards();
  try {
    await fn();
  } catch (err) {
    printError(err);
    process.exit(1);
  }
}
