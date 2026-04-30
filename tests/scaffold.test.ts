import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { scaffold } from '../src/core/scaffold/index.js';
import { createLogger, LogLevel } from '../src/core/logger/index.js';

const silentLogger = createLogger({ level: LogLevel.Silent });

describe('Scaffold Engine', () => {
  let testDir: string;
  let projectDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `extforge-scaffold-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    projectDir = join(testDir, 'test-ext');
  });

  afterEach(() => {
    try { rmSync(testDir, { recursive: true, force: true }); } catch {}
  });

  describe('Given default options (--defaults flag)', () => {
    let result: string | null;

    beforeEach(async () => {
      result = await scaffold({
        defaults: true,
        name: 'test-ext',
        targetDir: projectDir,
      }, silentLogger);
    });

    it('should create the project directory', () => {
      expect(result).toBe(projectDir);
      expect(existsSync(projectDir)).toBe(true);
    });

    describe('When checking the config files', () => {
      it('should create package.json with correct name', () => {
        const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf-8'));
        expect(pkg.name).toBe('test-ext');
        expect(pkg.version).toBe('0.1.0');
      });

      it('should include dev and build scripts', () => {
        const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf-8'));
        expect(pkg.scripts.dev).toBe('extforge dev');
        expect(pkg.scripts.build).toBe('extforge build');
        expect(pkg.scripts.test).toBe('vitest run');
      });

      it('should include React dependencies by default', () => {
        const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf-8'));
        expect(pkg.dependencies.react).toBeDefined();
        expect(pkg.dependencies['react-dom']).toBeDefined();
      });

      it('should include Tailwind dev dependencies by default', () => {
        const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf-8'));
        expect(pkg.devDependencies.tailwindcss).toBeDefined();
      });

      it('should create extforge.config.ts', () => {
        const config = readFileSync(join(projectDir, 'extforge.config.ts'), 'utf-8');
        expect(config).toContain("defineConfig");
        expect(config).toContain("'test-ext'");
        expect(config).toContain("manifestVersion: 3");
      });

      it('should create tsconfig.json', () => {
        expect(existsSync(join(projectDir, 'tsconfig.json'))).toBe(true);
        const tsconfig = JSON.parse(readFileSync(join(projectDir, 'tsconfig.json'), 'utf-8'));
        expect(tsconfig.compilerOptions.strict).toBe(true);
        expect(tsconfig.compilerOptions.jsx).toBe('react-jsx');
      });

      it('should create tailwind.config.js', () => {
        expect(existsSync(join(projectDir, 'tailwind.config.js'))).toBe(true);
      });

      it('should create vitest.config.ts', () => {
        expect(existsSync(join(projectDir, 'vitest.config.ts'))).toBe(true);
      });
    });

    describe('When checking the source directory', () => {
      it('should create src/background/index.ts', () => {
        const bg = readFileSync(join(projectDir, 'src/background/index.ts'), 'utf-8');
        expect(bg).toContain('onInstalled');
        expect(bg).toContain('onMessage');
      });

      it('should create src/ui/popup/index.tsx', () => {
        expect(existsSync(join(projectDir, 'src/ui/popup/index.tsx'))).toBe(true);
        const popup = readFileSync(join(projectDir, 'src/ui/popup/index.tsx'), 'utf-8');
        expect(popup).toContain('createRoot');
        expect(popup).toContain('test-ext');
      });

      it('should create src/ui/popup/index.html', () => {
        const html = readFileSync(join(projectDir, 'src/ui/popup/index.html'), 'utf-8');
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('id="root"');
      });

      it('should create global CSS with Tailwind directives', () => {
        const css = readFileSync(join(projectDir, 'src/styles/globals.css'), 'utf-8');
        expect(css).toContain('@tailwind base');
        expect(css).toContain('@tailwind components');
        expect(css).toContain('@tailwind utilities');
      });

      it('should create content CSS with Shadow DOM :host', () => {
        const css = readFileSync(join(projectDir, 'src/styles/content.css'), 'utf-8');
        expect(css).toContain(':host');
      });
    });

    describe('When checking supporting files', () => {
      it('should create an SVG icon', () => {
        const svg = readFileSync(join(projectDir, 'icons/icon.svg'), 'utf-8');
        expect(svg).toContain('<svg');
        expect(svg).toContain('viewBox');
      });

      it('should create .gitignore', () => {
        const gitignore = readFileSync(join(projectDir, '.gitignore'), 'utf-8');
        expect(gitignore).toContain('node_modules/');
        expect(gitignore).toContain('dist/');
      });

      it('should create README.md', () => {
        const readme = readFileSync(join(projectDir, 'README.md'), 'utf-8');
        expect(readme).toContain('# test-ext');
        expect(readme).toContain('npm run dev');
      });

      it('should create a sample test file', () => {
        const test = readFileSync(join(projectDir, 'tests/extension.test.ts'), 'utf-8');
        expect(test).toContain('describe');
        expect(test).toContain('test-ext');
      });
    });
  });

  describe('Given a directory that already exists', () => {
    beforeEach(async () => {
      // Create the project first
      await scaffold({ defaults: true, name: 'test-ext', targetDir: projectDir }, silentLogger);
    });

    it('should return null and not overwrite', async () => {
      const result = await scaffold(
        { defaults: true, name: 'test-ext', targetDir: projectDir },
        silentLogger,
      );
      expect(result).toBeNull();
    });
  });

  describe('Given the extforge.config.ts content', () => {
    beforeEach(async () => {
      await scaffold({ defaults: true, name: 'test-ext', targetDir: projectDir }, silentLogger);
    });

    it('should target chrome and firefox by default', () => {
      const config = readFileSync(join(projectDir, 'extforge.config.ts'), 'utf-8');
      expect(config).toContain("'chrome'");
      expect(config).toContain("'firefox'");
    });

    it('should include storage and activeTab permissions', () => {
      const config = readFileSync(join(projectDir, 'extforge.config.ts'), 'utf-8');
      expect(config).toContain("'storage'");
      expect(config).toContain("'activeTab'");
    });

    it('should set up popup action', () => {
      const config = readFileSync(join(projectDir, 'extforge.config.ts'), 'utf-8');
      expect(config).toContain('defaultPopup');
      expect(config).toContain('ui/popup/index.html');
    });

    it('should set up background entrypoint', () => {
      const config = readFileSync(join(projectDir, 'extforge.config.ts'), 'utf-8');
      expect(config).toContain('background');
      expect(config).toContain('background/index.js');
    });
  });
});
