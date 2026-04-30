/**
 * Validator Constants
 *
 * Required files, directories, and optional entry dirs.
 * Edit here to change what the validator checks.
 */

export const REQUIRED_FILES = [
  { path: 'package.json',       code: 'MISSING_PACKAGE_JSON', fix: 'Run `npm init` or `extforge init`' },
  { path: 'tsconfig.json',      code: 'MISSING_TSCONFIG',     fix: 'Run `extforge init` to generate one' },
  { path: 'extforge.config.ts', code: 'MISSING_CONFIG',       fix: 'Create extforge.config.ts — run `extforge init`' },
] as const;

export const REQUIRED_DIRS = [
  { path: 'src', code: 'MISSING_SRC', fix: 'Create the src/ directory' },
] as const;

export const ENTRY_DIRS = [
  'src/background',
  'src/content',
  'src/ui/popup',
  'src/ui/options',
  'src/ui/sidepanel',
] as const;
