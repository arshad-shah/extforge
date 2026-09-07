import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../src/core/i18n/index.js';

// Module augmentation for test keys — lives at file scope so type inference
// (and arity-checking) kicks in for the tests below.
declare module '../src/core/i18n/index.js' {
  interface MessageKeys {
    'popup.title': { args: [] };
    'popup.greeting': { args: [string] };
  }
}

type FakeChrome = {
  i18n: { getMessage: (key: string, substitutions?: string | string[]) => string };
};

afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome;
});

describe('t()', () => {
  it('falls back to the resolved chrome-style key when chrome.i18n is unavailable', () => {
    expect(t('popup.title')).toBe('popup_title');
  });

  it('delegates to chrome.i18n.getMessage with the dot-to-underscore key', () => {
    const calls: Array<[string, string | string[] | undefined]> = [];
    (globalThis as unknown as { chrome: FakeChrome }).chrome = {
      i18n: {
        getMessage: (key, substitutions) => {
          calls.push([key, substitutions]);
          return 'My Extension';
        },
      },
    };
    const result = t('popup.title');
    expect(result).toBe('My Extension');
    expect(calls).toEqual([['popup_title', undefined]]);
  });

  it('passes substitutions through positionally', () => {
    (globalThis as unknown as { chrome: FakeChrome }).chrome = {
      i18n: {
        getMessage: (key, substitutions) =>
          key === 'popup_greeting' ? `Hello, ${(substitutions as string[])[0]}` : '',
      },
    };
    const result = t('popup.greeting', ['Sam']);
    expect(result).toBe('Hello, Sam');
  });

  it('falls back to the resolved key when getMessage returns an empty string', () => {
    (globalThis as unknown as { chrome: FakeChrome }).chrome = {
      i18n: { getMessage: () => '' },
    };
    expect(t('popup.title')).toBe('popup_title');
  });
});
