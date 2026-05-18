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
      // Floors — slightly below the current measured baseline. CI fails
      // if a future change drops below. Raise these as coverage climbs;
      // never lower a floor without a real reason.
      thresholds: {
        lines: 88,
        branches: 78,
        functions: 88,
        statements: 88,
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
