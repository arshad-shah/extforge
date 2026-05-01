import { describe, it, expect } from 'vitest';
import { extForgeConfigSchema } from '../src/core/config/schema.js';

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
