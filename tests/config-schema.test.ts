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

  it('accepts a built-in css preset', () => {
    expect(extForgeConfigSchema.safeParse({ css: 'tailwind' }).success).toBe(true);
    expect(extForgeConfigSchema.safeParse({ css: 'vanilla' }).success).toBe(true);
    expect(extForgeConfigSchema.safeParse({ css: 'none' }).success).toBe(true);
  });

  it('rejects an unknown css preset', () => {
    expect(extForgeConfigSchema.safeParse({ css: 'sass' }).success).toBe(false);
  });

  it('accepts a custom css processor with a transform', () => {
    const r = extForgeConfigSchema.safeParse({ css: { name: 'upper', transform: (c: { code: string }) => c.code } });
    expect(r.success).toBe(true);
  });

  it('accepts a custom css processor with a command', () => {
    const r = extForgeConfigSchema.safeParse({ css: { name: 'sass', command: 'sass', args: ['{input}', '{output}'] } });
    expect(r.success).toBe(true);
  });

  it('rejects a custom css processor with neither transform nor command', () => {
    const r = extForgeConfigSchema.safeParse({ css: { name: 'empty' } });
    expect(r.success).toBe(false);
  });
});

describe('formatZodError', () => {
  it('produces an ExtForgeError with EXT_CONFIG_INVALID and a hint', () => {
    const input = { browsers: ['brave'] };
    const r = extForgeConfigSchema.safeParse(input);
    if (r.success) throw new Error('expected failure');
    const ext = formatZodError(r.error, '/p/extforge.config.ts', input);
    expect(ext.code).toBe('EXT_CONFIG_INVALID');
    expect(ext.message).toMatch(/browsers\.0/);
    expect(ext.message).toMatch(/brave/);
    expect(ext.file).toBe('/p/extforge.config.ts');
  });
});
