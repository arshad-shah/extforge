/**
 * Interactive prompts — powered by `@arshad-shah/clif/prompts`.
 *
 * This is a thin adapter over clif's prompt primitives: clif owns all terminal
 * handling (raw mode, key parsing, redraw, NO_COLOR / FORCE_COLOR / pipe
 * detection). ExtForge keeps two things on top:
 *
 *  1. A small `ask(prompts[])` contract that runs a sequence of prompts and
 *     returns an object keyed by each prompt's `name` (or `null` on cancel).
 *  2. Non-TTY behaviour clif intentionally does not provide: when stdin is not
 *     a TTY (scripted / CI use) every prompt resolves to its default instead of
 *     throwing, so `extforge init` works without `--defaults`.
 */

import { text, select, multiselect, PromptError } from '@arshad-shah/clif/prompts';

export interface TextPrompt {
  type: 'text';
  name: string;
  message: string;
  initial?: string;
  validate?: (value: string) => true | string;
}

export interface SelectChoice {
  title: string;
  value: string;
}

export interface SelectPrompt {
  type: 'select';
  name: string;
  message: string;
  choices: SelectChoice[];
  initial?: number;
}

export interface MultiselectChoice extends SelectChoice {
  selected?: boolean;
}

export interface MultiselectPrompt {
  type: 'multiselect';
  name: string;
  message: string;
  choices: MultiselectChoice[];
  min?: number;
  hint?: string;
}

export type Prompt = TextPrompt | SelectPrompt | MultiselectPrompt;

export interface PromptOptions {
  /** Called when the user cancels (Ctrl+C / EOF). Default: nothing. */
  onCancel?: () => void;
}

/**
 * Run a sequence of prompts in order. Returns an object keyed by prompt name,
 * or `null` if the user cancelled.
 */
export async function ask(
  prompts: Prompt[],
  opts: PromptOptions = {},
): Promise<Record<string, unknown> | null> {
  const out: Record<string, unknown> = {};
  for (const p of prompts) {
    try {
      switch (p.type) {
        case 'text':        out[p.name] = await runText(p);        break;
        case 'select':      out[p.name] = await runSelect(p);      break;
        case 'multiselect': out[p.name] = await runMultiselect(p); break;
      }
    } catch (err) {
      if (isCancellation(err)) {
        opts.onCancel?.();
        return null;
      }
      throw err;
    }
  }
  return out;
}

// ─── Implementation ──────────────────────────────────────────────────────────

function isTTY(): boolean {
  return Boolean(process.stdin.isTTY);
}

/** clif rejects with a PromptError (`cancelled` / `not-a-tty`) — treat as cancel. */
function isCancellation(err: unknown): boolean {
  if (err instanceof PromptError) return true;
  const code = (err as { code?: string } | null)?.code;
  return code === 'cancelled' || code === 'not-a-tty';
}

function runText(p: TextPrompt): Promise<string> {
  if (!isTTY()) return Promise.resolve(p.initial ?? '');
  return text({
    message: p.message,
    ...(p.initial !== undefined ? { default: p.initial } : {}),
    ...(p.validate ? { validate: p.validate } : {}),
  });
}

function runSelect(p: SelectPrompt): Promise<string> {
  const initialIdx = p.initial ?? 0;
  if (!isTTY() || p.choices.length === 0) {
    return Promise.resolve(p.choices[initialIdx]?.value ?? '');
  }
  return select<string>({
    message: p.message,
    options: p.choices.map((c) => ({ label: c.title, value: c.value })),
    ...(p.choices[initialIdx] ? { default: p.choices[initialIdx]!.value } : {}),
  });
}

function runMultiselect(p: MultiselectPrompt): Promise<string[]> {
  const preselected = p.choices.filter((c) => c.selected).map((c) => c.value);
  if (!isTTY() || p.choices.length === 0) {
    return Promise.resolve(preselected);
  }
  return multiselect<string>({
    message: p.message,
    options: p.choices.map((c) => ({ label: c.title, value: c.value })),
    default: preselected,
    ...(p.min !== undefined ? { min: p.min } : {}),
  });
}
