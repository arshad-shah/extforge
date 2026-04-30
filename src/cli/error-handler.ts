/**
 * Centralized CLI error handling.
 *
 * Wraps `runMain` with friendly formatting for known error shapes and
 * installs process-level guards so unhandled rejections / uncaught
 * exceptions don't dump raw stack traces on users.
 */

import pc from 'picocolors';

export interface FormattedError {
  title: string;
  detail?: string;
  hint?: string;
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
  if (err instanceof Error) {
    const msg = err.message;
    const hint = KNOWN_ERROR_HINTS.find(([re]) => re.test(msg))?.[1];
    return { title: err.name === 'Error' ? 'Command failed' : err.name, detail: msg, hint, cause: err };
  }
  return { title: 'Command failed', detail: String(err) };
}

export function printError(err: unknown): void {
  const f = formatError(err);
  // Always write to stderr so users can pipe stdout cleanly.
  console.error('');
  console.error(pc.bold(pc.red(`✖ ${f.title}`)));
  if (f.detail) console.error(`  ${f.detail}`);
  if (f.hint) console.error('');
  if (f.hint) console.error(pc.dim(`  Hint: ${f.hint}`));
  if (process.env.EXTFORGE_DEBUG && f.cause instanceof Error && f.cause.stack) {
    console.error('');
    console.error(pc.dim(f.cause.stack));
  } else if (f.cause instanceof Error) {
    console.error('');
    console.error(pc.dim('  Run with EXTFORGE_DEBUG=1 to see the full stack trace.'));
  }
  console.error('');
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

  // Ctrl+C: clean exit without a rejected-promise stack.
  process.on('SIGINT', () => process.exit(130));
  process.on('SIGTERM', () => process.exit(143));
}

/**
 * Run a CLI entry function with formatted error handling. Use as the
 * outermost wrapper around `runMain(...)`.
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
