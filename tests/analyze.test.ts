import { describe, expect, it } from 'vitest';
import { buildTree, packageOf, renderTreemapHtml } from '../src/core/builder/analyze.js';

describe('packageOf', () => {
  it('names the package for plain, scoped and pnpm-nested paths', () => {
    expect(packageOf('node_modules/react/index.js')).toBe('react');
    expect(packageOf('node_modules/@scope/pkg/lib/a.js')).toBe('@scope/pkg');
    expect(packageOf('node_modules/.pnpm/zod@4.6.7/node_modules/zod/v4/index.js')).toBe('zod');
    expect(packageOf('src/content/index.ts')).toBeUndefined();
  });
});

describe('buildTree', () => {
  it('groups node_modules inputs by package and keeps source files as leaves', () => {
    const tree = buildTree([
      {
        name: 'content/index',
        bytes: 300,
        inputs: [
          { path: 'node_modules/zod/a.js', bytes: 150 },
          { path: 'node_modules/zod/b.js', bytes: 50 },
          { path: 'src/content/index.ts', bytes: 100 },
        ],
      },
    ]);
    const entry = tree.children?.[0];
    expect(entry?.name).toBe('content/index');
    expect(entry?.children?.map((c) => [c.name, c.bytes])).toEqual([
      ['📦 zod', 200],
      ['src/content/index.ts', 100],
    ]);
    expect(entry?.children?.[0]?.children).toHaveLength(2);
  });
});

describe('renderTreemapHtml', () => {
  it('embeds the data so a file name cannot close the script tag', () => {
    const html = renderTreemapHtml('chrome', [
      { name: 'x', bytes: 1, inputs: [{ path: 'src/</script><b>.ts', bytes: 1 }] },
    ]);
    expect(html).not.toContain('</script><b>');
    expect(html).toContain('\\u003c/script>');
  });
});
