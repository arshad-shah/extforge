#!/usr/bin/env node

/**
 * ExtForge CLI entry point (bin).
 *
 * The command tree lives in `commands.ts`; here we just wire it into
 * @arshad-shah/clif and route errors through ExtForge's formatter.
 *
 * clif's `run()` catches errors and prints its own message by default. We
 * pass an `onError` that re-throws so `withErrorHandler` can render the
 * ExtForge-flavoured error (code, hint, docs link) and set exit code 1.
 */

import { createCLI } from '@arshad-shah/clif';
import { main } from './commands.js';
import { withErrorHandler } from './error-handler.js';

const cli = createCLI(main);

withErrorHandler(() => cli.run({ onError: (err) => { throw err; } }));
