import { describe, it, expect, beforeEach } from 'vitest';
import { installProcessGuards } from '../src/cli/error-handler.js';

describe('installProcessGuards', () => {
  beforeEach(() => {
    // Allow re-running installProcessGuards across tests.
    (globalThis as { __extforgeGuardsInstalled?: boolean }).__extforgeGuardsInstalled = false;
  });

  it('does NOT register SIGINT/SIGTERM handlers that pre-empt command-level shutdown', () => {
    const sigintBefore = process.listenerCount('SIGINT');
    const sigtermBefore = process.listenerCount('SIGTERM');

    installProcessGuards();

    // Long-running commands (e.g. `extforge dev`) register their own SIGINT
    // listener that awaits graceful shutdown. Installing a synchronous
    // `process.exit(130)` listener here would beat them to the punch and
    // leak HMR sockets / file watchers / esbuild contexts.
    expect(process.listenerCount('SIGINT')).toBe(sigintBefore);
    expect(process.listenerCount('SIGTERM')).toBe(sigtermBefore);
  });
});
