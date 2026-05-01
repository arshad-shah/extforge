import { describe, it, expect } from 'vitest';
import { extForgeConfigSchema } from '../src/core/config/schema.js';
import { formatZodError } from '../src/core/config/format-errors.js';

describe('extForgeConfigSchema', () => {
  it('accepts a minimal config', () => {
    const r = extForgeConfigSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it('rejects an unknown browser', () => {
    const r = extForgeConfigSchema.safeParse({ browsers: ['brave'] });
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find(i => i.path.join('.') === 'browsers.0');
      expect(issue).toBeDefined();
    }
  });

  it('rejects an unknown framework', () => {
    const r = extForgeConfigSchema.safeParse({ framework: 'angular' });
    expect(r.success).toBe(false);
  });

  it('passes unknown top-level keys through', () => {
    const r = extForgeConfigSchema.safeParse({ futureKey: 1 });
    expect(r.success).toBe(true);
  });
});

describe('formatZodError', () => {
  it('produces an ExtForgeError with EXT_CONFIG_INVALID and a hint', () => {
    const r = extForgeConfigSchema.safeParse({ browsers: ['brave'] });
    if (r.success) throw new Error('expected failure');
    const ext = formatZodError(r.error, '/p/extforge.config.ts');
    expect(ext.code).toBe('EXT_CONFIG_INVALID');
    expect(ext.message).toMatch(/browsers\.0/);
    expect(ext.message).toMatch(/brave/);
    expect(ext.file).toBe('/p/extforge.config.ts');
  });
});
