import { describe, it, expect } from 'vitest';

describe('{{NAME}}', () => {
  it('should have a valid extension name', () => {
    const name = '{{NAME}}';
    expect(name.length).toBeGreaterThan(0);
    expect(name.length).toBeLessThanOrEqual(45);
  });

  it('should define required permissions', () => {
    const permissions = ['storage', 'activeTab'];
    expect(permissions).toContain('storage');
  });
});
