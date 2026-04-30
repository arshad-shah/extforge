import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { validateProject, type ProjectValidationResult } from '../src/core/validator/index.js';
import { createLogger, LogLevel } from '../src/core/logger/index.js';

// Silent logger for tests
const silentLogger = createLogger({ level: LogLevel.Silent });

describe('Project Validator', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `extforge-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(testDir, { recursive: true, force: true }); } catch {}
  });

  describe('Given an empty directory', () => {
    it('should report missing required files', () => {
      const result = validateProject(testDir, silentLogger);
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.code === 'MISSING_PACKAGE_JSON')).toBe(true);
      expect(result.issues.some(i => i.code === 'MISSING_TSCONFIG')).toBe(true);
      expect(result.issues.some(i => i.code === 'MISSING_CONFIG')).toBe(true);
      expect(result.issues.some(i => i.code === 'MISSING_SRC')).toBe(true);
    });

    it('should include fix suggestions for each error', () => {
      const result = validateProject(testDir, silentLogger);
      const errors = result.issues.filter(i => i.severity === 'error');
      for (const err of errors) {
        expect(err.fix).toBeTruthy();
      }
    });
  });

  describe('Given a minimal valid project', () => {
    beforeEach(() => {
      writeFileSync(join(testDir, 'package.json'), '{}');
      writeFileSync(join(testDir, 'tsconfig.json'), '{}');
      writeFileSync(join(testDir, 'extforge.config.ts'), 'export default {}');
      mkdirSync(join(testDir, 'src/background'), { recursive: true });
      writeFileSync(join(testDir, 'src/background/index.ts'), '// bg');
    });

    it('should pass validation', () => {
      const result = validateProject(testDir, silentLogger);
      expect(result.valid).toBe(true);
      expect(result.issues.filter(i => i.severity === 'error')).toHaveLength(0);
    });
  });

  describe('Given a project with src/ but no entrypoints', () => {
    beforeEach(() => {
      writeFileSync(join(testDir, 'package.json'), '{}');
      writeFileSync(join(testDir, 'tsconfig.json'), '{}');
      writeFileSync(join(testDir, 'extforge.config.ts'), 'export default {}');
      mkdirSync(join(testDir, 'src'), { recursive: true });
      writeFileSync(join(testDir, 'src/utils.ts'), '// utils');
    });

    it('should warn about no entrypoints', () => {
      const result = validateProject(testDir, silentLogger);
      expect(result.issues.some(i => i.code === 'NO_ENTRYPOINTS')).toBe(true);
    });
  });

  describe('Given a project without icons', () => {
    beforeEach(() => {
      writeFileSync(join(testDir, 'package.json'), '{}');
      writeFileSync(join(testDir, 'tsconfig.json'), '{}');
      writeFileSync(join(testDir, 'extforge.config.ts'), 'export default {}');
      mkdirSync(join(testDir, 'src/background'), { recursive: true });
      writeFileSync(join(testDir, 'src/background/index.ts'), '');
    });

    it('should warn about missing icons directory', () => {
      const result = validateProject(testDir, silentLogger);
      expect(result.issues.some(i => i.code === 'MISSING_ICONS_DIR')).toBe(true);
    });
  });

  describe('Given a project with .js files in src/', () => {
    beforeEach(() => {
      writeFileSync(join(testDir, 'package.json'), '{}');
      writeFileSync(join(testDir, 'tsconfig.json'), '{}');
      writeFileSync(join(testDir, 'extforge.config.ts'), 'export default {}');
      mkdirSync(join(testDir, 'src/background'), { recursive: true });
      writeFileSync(join(testDir, 'src/background/index.js'), '// js file');
    });

    it('should emit info-level issue suggesting TypeScript', () => {
      const result = validateProject(testDir, silentLogger);
      const jsIssues = result.issues.filter(i => i.code === 'JS_FILE_IN_SRC');
      expect(jsIssues.length).toBeGreaterThan(0);
      expect(jsIssues[0].severity).toBe('info');
      expect(jsIssues[0].fix).toContain('.ts');
    });
  });
});
