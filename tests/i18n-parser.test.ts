import { describe, expect, it } from 'vitest';
import { generateDts } from '../src/core/i18n/codegen.js';
import { buildMessagesJson, chromeKey } from '../src/core/i18n/messages.js';
import { countArity, flattenMessages } from '../src/core/i18n/parser.js';

describe('countArity', () => {
  it('returns 0 for a message with no placeholders', () => {
    expect(countArity('My Extension')).toBe(0);
  });

  it('returns the highest placeholder index', () => {
    expect(countArity('Hello, $1')).toBe(1);
    expect(countArity('$1 sent $2 to $3')).toBe(3);
  });

  it('ignores unrelated dollar signs', () => {
    expect(countArity('Price: $9.99')).toBe(9);
    expect(countArity('$0 is not a valid placeholder')).toBe(0);
  });
});

describe('flattenMessages', () => {
  it('flattens nested keys into dot-paths', () => {
    const out = flattenMessages({ popup: { title: 'My Extension', greeting: 'Hello, $1' } });
    expect(out).toEqual([
      { key: 'popup.title', message: 'My Extension', arity: 0 },
      { key: 'popup.greeting', message: 'Hello, $1', arity: 1 },
    ]);
  });

  it('flattens top-level keys', () => {
    const out = flattenMessages({ title: 'x' });
    expect(out).toEqual([{ key: 'title', message: 'x', arity: 0 }]);
  });

  it('throws on non-string, non-object leaves', () => {
    expect(() => flattenMessages({ title: 42 })).toThrow(/must be a string/);
  });

  it('throws when the root is not a mapping', () => {
    expect(() => flattenMessages('nope')).toThrow(/must be a mapping/);
  });
});

describe('chromeKey', () => {
  it('replaces dots with underscores', () => {
    expect(chromeKey('popup.title')).toBe('popup_title');
  });
});

describe('buildMessagesJson', () => {
  it('builds the chrome messages.json shape', () => {
    const out = buildMessagesJson([
      { key: 'popup.title', message: 'My Extension', arity: 0 },
      { key: 'popup.greeting', message: 'Hello, $1', arity: 1 },
    ]);
    expect(out).toEqual({
      popup_title: { message: 'My Extension' },
      popup_greeting: { message: 'Hello, $1' },
    });
  });
});

describe('generateDts', () => {
  it('emits a MessageKeys augmentation with arity-sized tuples', () => {
    const dts = generateDts([
      { key: 'popup.title', message: 'My Extension', arity: 0 },
      { key: 'popup.greeting', message: 'Hello, $1', arity: 1 },
    ]);
    expect(dts).toContain("declare module 'extforge/i18n'");
    expect(dts).toContain('interface MessageKeys');
    expect(dts).toContain('"popup.title": { args: [] };');
    expect(dts).toContain('"popup.greeting": { args: [string] };');
  });
});
