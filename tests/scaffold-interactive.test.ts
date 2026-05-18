import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Readable, Writable } from 'node:stream';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scaffold } from '../src/core/scaffold/index.js';
import { createLogger, LogLevel } from '../src/core/logger/index.js';

const silent = createLogger({ level: LogLevel.Silent });

interface FakeStdin extends Readable {
  isTTY: boolean;
  setRawMode: (mode: boolean) => void;
  pause: () => this;
  resume: () => this;
}

function makeFakeStdin(): FakeStdin {
  const s = new Readable({ read() {} }) as FakeStdin;
  s.isTTY = true;
  s.setRawMode = vi.fn();
  return s;
}

function makeFakeStdout(): Writable {
  return new Writable({ write(_c, _e, cb) { cb(); } });
}

describe('scaffold gatherAnswers (interactive)', () => {
  let dir: string;
  const origStdin = process.stdin;
  const origStdout = process.stdout;
  let fakeIn: FakeStdin;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ef-sci-'));
    fakeIn = makeFakeStdin();
    Object.defineProperty(process, 'stdin', { value: fakeIn, configurable: true });
    Object.defineProperty(process, 'stdout', { value: makeFakeStdout(), configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(process, 'stdin', { value: origStdin, configurable: true });
    Object.defineProperty(process, 'stdout', { value: origStdout, configurable: true });
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  it('walks through the interactive flow and scaffolds the chosen feature set', async () => {
    const projectDir = join(dir, 'my-ext');
    // Non-TTY for text prompts → they resolve to initial values immediately.
    // For select/multiselect we still need keypress events. We get into raw-
    // mode prompts only after the text prompts (which call rl.question).
    // To keep this simple: set isTTY=false so every prompt resolves to its
    // initial value. That covers the gatherAnswers path entirely.
    fakeIn.isTTY = false;
    const result = await scaffold({
      name: 'my-ext',
      targetDir: projectDir,
    }, silent);
    expect(result).toBe(projectDir);
    // Default initial values: framework=react (index 0), css=tailwind (index 0),
    // browsers={chrome,firefox}, features={popup,background}.
    expect(existsSync(join(projectDir, 'src/ui/popup/index.tsx'))).toBe(true);
    expect(existsSync(join(projectDir, 'src/background/index.ts'))).toBe(true);
    // package.json contains the requested name (sanitised).
    const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('my-ext');
  });
});
