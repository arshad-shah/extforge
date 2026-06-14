import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ask } from '../src/core/scaffold/prompter.js';
import { text, select, multiselect, PromptError } from '@arshad-shah/clif/prompts';

/**
 * The prompter is a thin adapter over `@arshad-shah/clif/prompts` — clif owns
 * the terminal handling (raw mode, key parsing, rendering), which it tests on
 * its own. These tests guard ExtForge's adapter layer:
 *   - the `Prompt[]` shape is mapped onto clif's options correctly,
 *   - clif cancellations collapse to `null` + `onCancel`,
 *   - non-TTY contexts resolve to defaults instead of touching clif.
 */

vi.mock('@arshad-shah/clif/prompts', () => {
  class PromptError extends Error {
    code: string;
    constructor(code: string, message?: string) {
      super(message ?? code);
      this.code = code;
    }
  }
  return {
    PromptError,
    text: vi.fn(),
    select: vi.fn(),
    multiselect: vi.fn(),
  };
});

const mockText = vi.mocked(text);
const mockSelect = vi.mocked(select);
const mockMultiselect = vi.mocked(multiselect);

function setTTY(value: boolean): void {
  Object.defineProperty(process.stdin, 'isTTY', { value, configurable: true });
}

describe('prompter (clif adapter)', () => {
  const original = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');

  beforeEach(() => {
    vi.clearAllMocks();
    setTTY(true);
  });

  afterEach(() => {
    if (original) Object.defineProperty(process.stdin, 'isTTY', original);
  });

  describe('delegation & mapping', () => {
    it('forwards a text prompt to clif with its default and validator', async () => {
      mockText.mockResolvedValue('chosen');
      const validate = (v: string) => (v ? true : 'required');

      const result = await ask([
        { type: 'text', name: 'name', message: 'Name', initial: 'world', validate },
      ]);

      expect(mockText).toHaveBeenCalledWith({ message: 'Name', default: 'world', validate });
      expect(result).toEqual({ name: 'chosen' });
    });

    it('maps select choices to clif options and the initial index to a default value', async () => {
      mockSelect.mockResolvedValue('b');

      const result = await ask([
        {
          type: 'select', name: 'pick', message: 'choose', initial: 1,
          choices: [{ title: 'A', value: 'a' }, { title: 'B', value: 'b' }],
        },
      ]);

      expect(mockSelect).toHaveBeenCalledWith({
        message: 'choose',
        options: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }],
        default: 'b',
      });
      expect(result).toEqual({ pick: 'b' });
    });

    it('maps multiselect pre-selection to clif `default` and forwards `min`', async () => {
      mockMultiselect.mockResolvedValue(['a', 'c']);

      const result = await ask([
        {
          type: 'multiselect', name: 'picks', message: 'choose', min: 1,
          choices: [
            { title: 'A', value: 'a', selected: true },
            { title: 'B', value: 'b' },
            { title: 'C', value: 'c', selected: true },
          ],
        },
      ]);

      expect(mockMultiselect).toHaveBeenCalledWith({
        message: 'choose',
        options: [
          { label: 'A', value: 'a' },
          { label: 'B', value: 'b' },
          { label: 'C', value: 'c' },
        ],
        default: ['a', 'c'],
        min: 1,
      });
      expect(result).toEqual({ picks: ['a', 'c'] });
    });

    it('runs prompts in order, keyed by name', async () => {
      mockText.mockResolvedValueOnce('n').mockResolvedValueOnce('d');
      const result = await ask([
        { type: 'text', name: 'name', message: 'Name' },
        { type: 'text', name: 'desc', message: 'Description' },
      ]);
      expect(result).toEqual({ name: 'n', desc: 'd' });
    });
  });

  describe('cancellation', () => {
    it('returns null and calls onCancel when clif throws a cancellation', async () => {
      mockSelect.mockRejectedValue(new PromptError('cancelled'));
      const onCancel = vi.fn();

      const result = await ask(
        [{ type: 'select', name: 'pick', message: 'choose', choices: [{ title: 'A', value: 'a' }] }],
        { onCancel },
      );

      expect(result).toBeNull();
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('rethrows unexpected errors', async () => {
      mockText.mockRejectedValue(new Error('boom'));
      await expect(
        ask([{ type: 'text', name: 'n', message: 'x' }]),
      ).rejects.toThrow('boom');
    });
  });

  describe('non-TTY behavior', () => {
    beforeEach(() => setTTY(false));

    it('text prompts resolve to the initial value without touching clif', async () => {
      const result = await ask([{ type: 'text', name: 'n', message: 'who?', initial: 'world' }]);
      expect(result).toEqual({ n: 'world' });
      expect(mockText).not.toHaveBeenCalled();
    });

    it('select prompts resolve to the initial-index choice', async () => {
      const result = await ask([{
        type: 'select', name: 'pick', message: 'choose', initial: 1,
        choices: [{ title: 'A', value: 'a' }, { title: 'B', value: 'b' }],
      }]);
      expect(result).toEqual({ pick: 'b' });
      expect(mockSelect).not.toHaveBeenCalled();
    });

    it('multiselect prompts resolve to the pre-selected items', async () => {
      const result = await ask([{
        type: 'multiselect', name: 'picks', message: 'choose',
        choices: [
          { title: 'A', value: 'a', selected: true },
          { title: 'B', value: 'b' },
          { title: 'C', value: 'c', selected: true },
        ],
      }]);
      expect(result).toEqual({ picks: ['a', 'c'] });
      expect(mockMultiselect).not.toHaveBeenCalled();
    });
  });
});
