import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'tests/fixtures/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'prefer-const': 'error',
      'no-var': 'error',
      // Centralize logging through Logger / runtimeLog. Whitelist a few
      // locations that have a documented reason to use console directly:
      //   - cli/error-handler.ts: top-level CLI error renderer
      //   - core/hmr/runtime.ts:  in-browser runtime (no Logger available)
      'no-console': 'error',
    },
  },
  {
    // Files allowed to call console.* directly. Keep this list short and
    // each entry must have a one-line "why" comment in the file itself.
    files: [
      'src/cli/error-handler.ts',
      'src/core/hmr/runtime.ts',
      'src/core/compat/build-data.ts',
    ],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
);
