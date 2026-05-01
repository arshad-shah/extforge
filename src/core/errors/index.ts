import { type ErrorCode, docsUrlFor } from './codes.js';
export { ERROR_CODES, type ErrorCode, docsUrlFor } from './codes.js';

export interface ExtForgeErrorInit {
  code: ErrorCode;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  hint?: string;
  docsUrl?: string;
  cause?: unknown;
}

export class ExtForgeError extends Error {
  readonly code: ErrorCode;
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
  readonly hint?: string;
  readonly docsUrl?: string;

  constructor(init: ExtForgeErrorInit) {
    super(init.message);
    this.name = 'ExtForgeError';
    this.code = init.code;
    this.file = init.file;
    this.line = init.line;
    this.column = init.column;
    this.hint = init.hint;
    this.docsUrl = init.docsUrl ?? docsUrlFor(init.code);
    if (init.cause !== undefined) (this as any).cause = init.cause;
  }
}

export function isExtForgeError(err: unknown): err is ExtForgeError {
  return err instanceof Error && (err as any).name === 'ExtForgeError';
}
