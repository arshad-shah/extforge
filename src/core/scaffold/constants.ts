/**
 * Scaffold Constants
 *
 * All dependency versions, default scaffold values, and
 * directory lists live here. Edit versions in one place.
 */

// ─── Dependency versions ─────────────────────────────────────────────────────
// Update these when bumping framework/tool versions.

export const VERSIONS = {
  // Core
  typescript:     '^5.7.0',
  esbuild:        '^0.24.0',
  chromTypes:     '^0.0.280',
  vitest:         '^2.1.0',

  // React
  react:          '^19.0.0',
  reactDom:       '^19.0.0',
  reactTypes:     '^19.0.0',
  reactDomTypes:  '^19.0.0',
  zustand:        '^5.0.0',

  // CSS
  tailwindcss:    '^4.0.0',
  postcss:        '^8.4.0',
  autoprefixer:   '^10.4.0',
} as const;

// ─── Default scaffold answers ────────────────────────────────────────────────

export const DEFAULTS = {
  name:        'my-extension',
  description: 'A browser extension',
  version:     '0.1.0',
  framework:   'react' as const,
  css:         'tailwind' as const,
  browsers:    ['chrome', 'firefox'] as const,
  features:    ['popup', 'background'] as const,
  permissions: ['storage', 'activeTab'] as const,
} as const;

// ─── Script definitions for generated package.json ───────────────────────────

export const PKG_SCRIPTS = {
  'dev':          'extforge dev',
  'dev:firefox':  'extforge dev --browser firefox',
  'build':        'extforge build',
  'build:dev':    'extforge build --dev',
  'package':      'extforge package',
  'validate':     'extforge validate',
  'icons':        'extforge icons',
  'typecheck':    'tsc --noEmit',
  'test':         'vitest run',
  'test:watch':   'vitest',
} as const;

// ─── Directories to create per-feature ───────────────────────────────────────

export const BASE_DIRS = [
  'src/styles',
  'src/lib',
  'src/hooks',
  'src/store',
  'src/components',
  'icons',
  'public',
  'tests',
] as const;

export const FEATURE_DIRS: Record<string, string> = {
  popup:      'src/ui/popup',
  options:    'src/ui/options',
  sidepanel:  'src/ui/sidepanel',
  background: 'src/background',
  content:    'src/content',
} as const;
