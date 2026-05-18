import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Readable, Writable } from 'node:stream';
import { ask } from '../src/core/scaffold/prompter.js';

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

function makeFakeStdout(): Writable & { chunks: string[] } {
  const chunks: string[] = [];
  const w = new Writable({
    write(chunk, _enc, cb) { chunks.push(chunk.toString()); cb(); },
  }) as Writable & { chunks: string[] };
  w.chunks = chunks;
  return w;
}

describe('prompter', () => {
  const origStdin = process.stdin;
  const origStdout = process.stdout;
  let fakeIn: FakeStdin;
  let fakeOut: ReturnType<typeof makeFakeStdout>;

  beforeEach(() => {
    fakeIn = makeFakeStdin();
    fakeOut = makeFakeStdout();
    Object.defineProperty(process, 'stdin', { value: fakeIn, configurable: true });
    Object.defineProperty(process, 'stdout', { value: fakeOut, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(process, 'stdin', { value: origStdin, configurable: true });
    Object.defineProperty(process, 'stdout', { value: origStdout, configurable: true });
  });

  describe('rendering select prompts', () => {
    it('emits real ANSI escape sequences (not literal "[2K" text) when redrawing', async () => {
      const askPromise = ask([{
        type: 'select',
        name: 'pick',
        message: 'choose',
        choices: [{ title: 'A', value: 'a' }, { title: 'B', value: 'b' }],
      }]);

      // First render happens synchronously inside rawCursorPrompt.setup → ctx.render()
      await new Promise(r => setImmediate(r));

      // Trigger a re-render by sending a "down" keypress, which forces the
      // clear-previous-render code path that uses ANSI cursor controls.
      fakeIn.emit('keypress', undefined, { name: 'down' });
      await new Promise(r => setImmediate(r));

      // Confirm with Enter so the promise resolves.
      fakeIn.emit('keypress', undefined, { name: 'return' });
      await askPromise;

      const out = fakeOut.chunks.join('');

      // ESC byte should appear in cursor-up + clear-line sequences.
      expect(out).toContain('\x1b[');

      // The bug: literal "[2K" / "[1A" without ESC byte leaks into output.
      // After fix, these substrings only appear preceded by \x1b.
      const literalClearLine = out.match(/(^|[^\x1b])\[2K/);
      expect(literalClearLine).toBeNull();
      const literalCursorUp = out.match(/(^|[^\x1b])\[\d+A/);
      expect(literalCursorUp).toBeNull();
    });

    it('wraps cursor around with up/down keys', async () => {
      const askPromise = ask([{
        type: 'select',
        name: 'pick',
        message: 'choose',
        choices: [{ title: 'A', value: 'a' }, { title: 'B', value: 'b' }, { title: 'C', value: 'c' }],
      }]);
      await new Promise(r => setImmediate(r));
      // Up from index 0 wraps to last item.
      fakeIn.emit('keypress', undefined, { name: 'up' });
      await new Promise(r => setImmediate(r));
      fakeIn.emit('keypress', undefined, { name: 'return' });
      const result = await askPromise;
      expect(result).toEqual({ pick: 'c' });
    });

    it('resolves Ctrl-C as a cancellation', async () => {
      const askPromise = ask([{
        type: 'select',
        name: 'pick',
        message: 'choose',
        choices: [{ title: 'A', value: 'a' }],
      }], { onCancel: () => {} });
      await new Promise(r => setImmediate(r));
      fakeIn.emit('keypress', undefined, { name: 'c', ctrl: true });
      const result = await askPromise;
      expect(result).toBeNull();
    });
  });

  describe('multiselect prompts', () => {
    it('toggles selection with space and returns the sorted picks on enter', async () => {
      const askPromise = ask([{
        type: 'multiselect',
        name: 'picks',
        message: 'choose many',
        choices: [
          { title: 'A', value: 'a' },
          { title: 'B', value: 'b' },
          { title: 'C', value: 'c' },
        ],
      }]);
      await new Promise(r => setImmediate(r));
      // Select A.
      fakeIn.emit('keypress', undefined, { name: 'space' });
      await new Promise(r => setImmediate(r));
      // Move to C and select.
      fakeIn.emit('keypress', undefined, { name: 'down' });
      fakeIn.emit('keypress', undefined, { name: 'down' });
      fakeIn.emit('keypress', undefined, { name: 'space' });
      await new Promise(r => setImmediate(r));
      fakeIn.emit('keypress', undefined, { name: 'return' });
      const result = await askPromise;
      expect(result).toEqual({ picks: ['a', 'c'] });
    });

    it('ignores Enter until the `min` requirement is met', async () => {
      const askPromise = ask([{
        type: 'multiselect',
        name: 'picks',
        message: 'pick 1+',
        min: 1,
        choices: [{ title: 'A', value: 'a' }, { title: 'B', value: 'b' }],
      }]);
      await new Promise(r => setImmediate(r));
      // No selection yet — Enter should be a no-op.
      fakeIn.emit('keypress', undefined, { name: 'return' });
      await new Promise(r => setImmediate(r));
      fakeIn.emit('keypress', undefined, { name: 'space' });
      await new Promise(r => setImmediate(r));
      fakeIn.emit('keypress', undefined, { name: 'return' });
      const result = await askPromise;
      expect(result).toEqual({ picks: ['a'] });
    });
  });

  describe('non-TTY behavior', () => {
    it('text prompts resolve to the initial value', async () => {
      fakeIn.isTTY = false;
      const result = await ask([{ type: 'text', name: 'n', message: 'who?', initial: 'world' }]);
      expect(result).toEqual({ n: 'world' });
    });
    it('select prompts resolve to the initial-index choice', async () => {
      fakeIn.isTTY = false;
      const result = await ask([{
        type: 'select', name: 'pick', message: 'choose', initial: 1,
        choices: [{ title: 'A', value: 'a' }, { title: 'B', value: 'b' }],
      }]);
      expect(result).toEqual({ pick: 'b' });
    });
    it('multiselect prompts resolve to the pre-selected items', async () => {
      fakeIn.isTTY = false;
      const result = await ask([{
        type: 'multiselect', name: 'picks', message: 'choose',
        choices: [
          { title: 'A', value: 'a', selected: true },
          { title: 'B', value: 'b' },
          { title: 'C', value: 'c', selected: true },
        ],
      }]);
      expect(result).toEqual({ picks: ['a', 'c'] });
    });
  });
});
