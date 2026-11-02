import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadLocales } from '../src/core/i18n/loader.js';

describe('loadLocales — locale names', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'extforge-i18n-loader-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('turns BCP 47 hyphens into the underscores Chrome requires (en-US → en_US)', () => {
    writeFileSync(join(dir, 'en-US.yml'), 'title: Hi\n');
    expect([...loadLocales(dir).keys()]).toEqual(['en_US']);
  });

  it('rejects two files that normalise to the same locale', () => {
    writeFileSync(join(dir, 'en-US.yml'), 'title: Hi\n');
    writeFileSync(join(dir, 'en_US.json'), '{"title":"Hi"}');
    expect(() => loadLocales(dir)).toThrow(/both define locale "en_US"/);
  });
});
