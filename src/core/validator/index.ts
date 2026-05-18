/**
 * ExtForge Validator — project structure and config checks
 */

import { existsSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createLogger, type Logger } from '../logger/index.js';
import { REQUIRED_FILES, REQUIRED_DIRS, ENTRY_DIRS } from './constants.js';
import { validateManifestConfig } from '../manifest/generator.js';
import type { ManifestConfig } from '../manifest/types.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  file?: string;
  fix?: string;
}

export interface ProjectValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

// ─── Checks ──────────────────────────────────────────────────────────────────

function checkStructure(root: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const f of REQUIRED_FILES) {
    if (!existsSync(join(root, f.path)))
      issues.push({ severity: 'error', code: f.code, message: `Missing required file: ${f.path}`, file: f.path, fix: f.fix });
  }
  for (const d of REQUIRED_DIRS) {
    if (!existsSync(join(root, d.path)))
      issues.push({ severity: 'error', code: d.code, message: `Missing required directory: ${d.path}`, file: d.path, fix: d.fix });
  }

  const hasEntry = ENTRY_DIRS.some(d => existsSync(join(root, d)));
  if (existsSync(join(root, 'src')) && !hasEntry) {
    const bgFile = existsSync(join(root, 'src/background.ts')) || existsSync(join(root, 'src/background/index.ts'));
    if (!bgFile)
      issues.push({ severity: 'warning', code: 'NO_ENTRYPOINTS', message: 'No entrypoint directories found', fix: 'Create at least one of: src/background/, src/content/, src/ui/popup/' });
  }
  return issues;
}

function checkIcons(root: string): ValidationIssue[] {
  const iconsDir = join(root, 'icons');
  if (!existsSync(iconsDir))
    return [{ severity: 'warning', code: 'MISSING_ICONS_DIR', message: 'No icons/ directory found', fix: 'Create icons/ with icon.svg or icon-{16,32,48,128}.png files' }];

  const svgExists = existsSync(join(iconsDir, 'icon.svg'));
  const missing = [16, 32, 48, 128].filter(s => !existsSync(join(iconsDir, `icon-${s}.png`)));
  if (!svgExists && missing.length > 0)
    return [{ severity: 'warning', code: 'MISSING_ICON_FILES', message: `Missing icon sizes: ${missing.map(s => `${s}x${s}`).join(', ')}`, fix: 'Add icon.svg to icons/ and run `extforge icons`' }];
  return [];
}

function checkTypeScript(root: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const srcDir = join(root, 'src');
  if (!existsSync(srcDir)) return issues;

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules') { walk(full); continue; }
      const ext = extname(entry.name);
      if (ext === '.js' || ext === '.jsx')
        issues.push({ severity: 'info', code: 'JS_FILE_IN_SRC', message: `JavaScript file found: ${full.replace(root + '/', '')}`, file: full, fix: `Rename to ${entry.name.replace(ext, ext === '.js' ? '.ts' : '.tsx')}` });
    }
  };
  walk(srcDir);
  return issues;
}

function checkManifestConfig(manifest: ManifestConfig | undefined): ValidationIssue[] {
  if (!manifest) return [];
  const r = validateManifestConfig(manifest);
  const issues: ValidationIssue[] = [];
  for (const message of r.errors) {
    issues.push({ severity: 'error', code: 'MANIFEST_INVALID', message, fix: 'Fix the manifest field in extforge.config.' });
  }
  for (const message of r.warnings) {
    issues.push({ severity: 'warning', code: 'MANIFEST_WARNING', message });
  }
  return issues;
}

export interface ValidateProjectOptions {
  /** When supplied, manifest-level validation runs and contributes issues. */
  manifest?: ManifestConfig;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function validateProject(
  root: string,
  logger?: Logger,
  opts: ValidateProjectOptions = {},
): ProjectValidationResult {
  const log = logger ?? createLogger({ scope: 'validator' });
  log.debug('Validating project structure...');

  const issues = [
    ...checkStructure(root),
    ...checkIcons(root),
    ...checkTypeScript(root),
    ...checkManifestConfig(opts.manifest),
  ];

  for (const issue of issues) {
    if (issue.severity === 'error') { log.error(`${issue.code}: ${issue.message}`); if (issue.fix) log.info(`  → Fix: ${issue.fix}`); }
    else if (issue.severity === 'warning') { log.warn(`${issue.code}: ${issue.message}`); if (issue.fix) log.debug(`  → Fix: ${issue.fix}`); }
    else { log.debug(`${issue.code}: ${issue.message}`); }
  }

  if (issues.every(i => i.severity !== 'error') && issues.length === 0)
    log.success('Project structure is valid');

  return { valid: issues.every(i => i.severity !== 'error'), issues };
}
