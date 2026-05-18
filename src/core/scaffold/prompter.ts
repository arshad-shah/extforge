/**
 * readline-based interactive prompter. Drop-in replacement for the subset of
 * `prompts` we used: text, select, multiselect.
 *
 * Why hand-rolled: the `prompts` package brings in `kleur` + `sisteransi`
 * transitively. This implementation keeps the dep tree at zero new packages
 * and gives us full control over rendering with the project's brand colors.
 *
 * Non-TTY behavior: when `process.stdin.isTTY` is false we resolve every
 * prompt to its initial value without raising. This makes scripted/CI use
 * work without `--defaults`.
 */

import * as readline from 'node:readline';
import pc from '../logger/ansi.js';

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
  /** Called when the user hits Ctrl+C / sends EOF. Default: log + exit(1). */
  onCancel?: () => void;
}

/**
 * Run a sequence of prompts in order. Returns an object keyed by prompt name.
 * Returns null if the user cancelled.
 */
export async function ask(
  prompts: Prompt[],
  opts: PromptOptions = {},
): Promise<Record<string, unknown> | null> {
  const out: Record<string, unknown> = {};
  for (const p of prompts) {
    let value: unknown;
    try {
      switch (p.type) {
        case 'text':        value = await askText(p);        break;
        case 'select':      value = await askSelect(p);      break;
        case 'multiselect': value = await askMultiselect(p); break;
      }
    } catch (err) {
      if ((err as { code?: string }).code === 'CANCELLED') {
        opts.onCancel?.();
        return null;
      }
      throw err;
    }
    out[p.name] = value;
  }
  return out;
}

// ─── Implementation ──────────────────────────────────────────────────────────

function isTTY(): boolean {
  return Boolean(process.stdin.isTTY);
}

function cancelError(): Error & { code: string } {
  const e = new Error('Cancelled') as Error & { code: string };
  e.code = 'CANCELLED';
  return e;
}

function askText(p: TextPrompt): Promise<string> {
  if (!isTTY()) return Promise.resolve(p.initial ?? '');

  return new Promise<string>((resolve, reject) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const initialHint = p.initial ? pc.dim(` (${p.initial})`) : '';
    const ask = (): void => {
      rl.question(`${pc.cyan('?')} ${p.message}${initialHint} `, (answer) => {
        const v = answer.trim() === '' ? (p.initial ?? '') : answer;
        if (p.validate) {
          const r = p.validate(v);
          if (r !== true) {
            process.stdout.write(`  ${pc.red(typeof r === 'string' ? r : 'Invalid input')}\n`);
            return ask();
          }
        }
        rl.close();
        resolve(v);
      });
    };
    rl.on('SIGINT', () => { rl.close(); reject(cancelError()); });
    rl.on('close', () => { /* normal close handled in question cb */ });
    ask();
  });
}

function askSelect(p: SelectPrompt): Promise<string> {
  if (!isTTY() || p.choices.length === 0) {
    return Promise.resolve(p.choices[p.initial ?? 0]?.value ?? '');
  }

  return rawCursorPrompt<string>((write, draw) => {
    let idx = p.initial ?? 0;

    function render(): void {
      const lines: string[] = [];
      lines.push(`${pc.cyan('?')} ${p.message} ${pc.dim('(↑/↓, Enter)')}`);
      p.choices.forEach((c, i) => {
        const cursor = i === idx ? pc.cyan('›') : ' ';
        const text = i === idx ? pc.cyan(c.title) : c.title;
        lines.push(`${cursor} ${text}`);
      });
      draw(lines);
    }

    return {
      render,
      onKey(key, resolve, reject) {
        if (key.name === 'up')   { idx = (idx - 1 + p.choices.length) % p.choices.length; render(); }
        else if (key.name === 'down') { idx = (idx + 1) % p.choices.length; render(); }
        else if (key.name === 'return') {
          write(`\n`);
          resolve(p.choices[idx]!.value);
        }
        else if (key.ctrl && key.name === 'c') reject(cancelError());
      },
    };
  });
}

function askMultiselect(p: MultiselectPrompt): Promise<string[]> {
  if (!isTTY() || p.choices.length === 0) {
    return Promise.resolve(p.choices.filter(c => c.selected).map(c => c.value));
  }

  return rawCursorPrompt<string[]>((write, draw) => {
    let idx = 0;
    const selected = new Set<number>(p.choices.map((c, i) => c.selected ? i : -1).filter(i => i !== -1));

    function render(): void {
      const lines: string[] = [];
      lines.push(`${pc.cyan('?')} ${p.message} ${pc.dim(p.hint ?? '(Space to toggle, Enter to confirm)')}`);
      p.choices.forEach((c, i) => {
        const cursor = i === idx ? pc.cyan('›') : ' ';
        const box = selected.has(i) ? pc.green('◉') : pc.dim('○');
        const text = i === idx ? pc.cyan(c.title) : c.title;
        lines.push(`${cursor} ${box} ${text}`);
      });
      draw(lines);
    }

    return {
      render,
      onKey(key, resolve, reject) {
        if (key.name === 'up')   { idx = (idx - 1 + p.choices.length) % p.choices.length; render(); }
        else if (key.name === 'down') { idx = (idx + 1) % p.choices.length; render(); }
        else if (key.name === 'space') {
          if (selected.has(idx)) selected.delete(idx); else selected.add(idx);
          render();
        }
        else if (key.name === 'return') {
          if (p.min && selected.size < p.min) return; // ignore until satisfied
          write(`\n`);
          resolve([...selected].sort().map(i => p.choices[i]!.value));
        }
        else if (key.ctrl && key.name === 'c') reject(cancelError());
      },
    };
  });
}

// ─── Raw-mode cursor prompt scaffolding ──────────────────────────────────────

interface KeyHandlerCtx {
  render: () => void;
  onKey: (key: KeyEvent, resolve: (v: any) => void, reject: (e: unknown) => void) => void;
}

interface KeyEvent {
  name?: string;
  ctrl?: boolean;
}

function rawCursorPrompt<T>(setup: (
  write: (s: string) => void,
  draw: (lines: string[]) => void,
) => KeyHandlerCtx): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    let prevLines = 0;
    let rawWasSet = false;
    // If the process exits abnormally (uncaught exception, SIGTERM, parent
    // sends SIGHUP, etc.) we still need to restore the terminal to cooked
    // mode — otherwise the user's shell is left in raw mode and unusable.
    // Register a one-shot exit hook that runs whether cleanup() did or not.
    const restoreOnExit = (): void => {
      if (rawWasSet && stdin.isTTY) {
        try { stdin.setRawMode(false); } catch { /* ignore */ }
      }
    };
    process.once('exit', restoreOnExit);

    const draw = (lines: string[]): void => {
      // Clear previous render.
      if (prevLines > 0) {
        stdout.write(`\x1b[${prevLines}A`);
        for (let i = 0; i < prevLines; i++) {
          stdout.write(`\x1b[2K`);
          if (i < prevLines - 1) stdout.write('\n');
        }
        if (prevLines > 1) stdout.write(`\x1b[${prevLines - 1}A`);
        stdout.write('\r');
      }
      stdout.write(lines.join('\n'));
      prevLines = lines.length;
    };

    const write = (s: string): void => { stdout.write(s); };

    const ctx = setup(write, draw);

    readline.emitKeypressEvents(stdin);
    if (stdin.isTTY) { stdin.setRawMode(true); rawWasSet = true; }
    stdin.resume();

    const onKey = (_str: string | undefined, key: KeyEvent): void => {
      ctx.onKey(key, (v) => {
        cleanup();
        resolve(v as T);
      }, (e) => {
        cleanup();
        reject(e);
      });
    };

    const cleanup = (): void => {
      stdin.off('keypress', onKey);
      if (rawWasSet && stdin.isTTY) {
        try { stdin.setRawMode(false); } catch { /* ignore */ }
        rawWasSet = false;
      }
      stdin.pause();
      process.removeListener('exit', restoreOnExit);
    };

    stdin.on('keypress', onKey);
    ctx.render();
  });
}
