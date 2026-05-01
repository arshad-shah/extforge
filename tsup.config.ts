import { defineConfig } from 'tsup';
import { cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export default defineConfig({
  entry: {
    'cli/index': 'src/cli/index.ts',
    'core/index': 'src/core/index.ts',
    'core/logger/index': 'src/core/logger/index.ts',
    'core/plugins/index': 'src/core/plugins/index.ts',
    'core/compat/index': 'src/core/compat/index.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'node20',
  splitting: true,
  treeshake: true,
  external: ['esbuild'],
  async onSuccess() {
    // Copy scaffold templates so the runtime template-loader can read them
    // from dist/core/scaffold/templates/ (the loader resolves them relative
    // to its own .js file). Without this, `extforge init` and dev-mode HMR
    // injection both fail with ENOENT.
    const src = 'src/core/scaffold/templates';
    const dest = 'dist/core/scaffold/templates';
    if (existsSync(src)) {
      cpSync(src, dest, { recursive: true });
      // eslint-disable-next-line no-console
      console.log(`[tsup] Copied templates → ${dest}`);
    }

    // Copy compat data.json so the runtime createRequire('./data.json') resolves
    // relative to dist/core/compat/index.js at runtime.
    const compatDataSrc = join('src', 'core', 'compat', 'data.json');
    const compatDataDest = join('dist', 'core', 'compat', 'data.json');
    if (existsSync(compatDataSrc)) {
      cpSync(compatDataSrc, compatDataDest);
      // eslint-disable-next-line no-console
      console.log(`[tsup] Copied compat data → ${compatDataDest}`);
    }
  },
});
