import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/cli/**',
        // Scaffold templates are static .tpl files inlined at runtime, not
        // executable TypeScript.
        'src/core/scaffold/templates/**',
        // Inlined at build time via esbuild's json loader.
        'src/core/compat/data.json',
        // One-shot scripts.
        'src/core/compat/build-data.ts',
      ],
      // Floors — slightly below the current measured baseline (lines
      // 75.25, branches 77.26, functions 82.72, statements 75.25 as of
      // the audit-fix branch). CI fails if a future change drops below;
      // raise these as coverage climbs.
      thresholds: {
        lines: 70,
        branches: 70,
        functions: 75,
        statements: 70,
      },
    },
    // Run test files sequentially across processes. Several HMR tests
    // (hmr-reserve-port, anything that binds a port) would otherwise
    // collide if parallel workers reach for the same default port.
    fileParallelism: false,
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
