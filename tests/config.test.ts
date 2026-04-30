import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG, defineConfig, type ExtForgeConfig } from '../src/core/config.js';

describe('Config System', () => {
  describe('Given the default config', () => {
    it('should target chrome and firefox', () => {
      expect(DEFAULT_CONFIG.browsers).toEqual(['chrome', 'firefox']);
    });

    it('should default to React framework', () => {
      expect(DEFAULT_CONFIG.framework).toBe('react');
    });

    it('should default to Tailwind CSS', () => {
      expect(DEFAULT_CONFIG.css).toBe('tailwind');
    });

    it('should set dev port to 35729', () => {
      expect(DEFAULT_CONFIG.dev?.port).toBe(35729);
    });

    it('should set debounce to 150ms', () => {
      expect(DEFAULT_CONFIG.dev?.debounce).toBe(150);
    });

    it('should output to dist/', () => {
      expect(DEFAULT_CONFIG.build?.outDir).toBe('dist');
    });

    it('should source from src/', () => {
      expect(DEFAULT_CONFIG.build?.srcDir).toBe('src');
    });
  });

  describe('Given defineConfig helper', () => {
    it('should return the config object unchanged', () => {
      const config: ExtForgeConfig = {
        browsers: ['chrome'],
        framework: 'vue',
      };
      const result = defineConfig(config);
      expect(result).toEqual(config);
    });

    it('should accept a full config with all fields', () => {
      const config = defineConfig({
        browsers: ['chrome', 'firefox', 'edge'],
        framework: 'svelte',
        css: 'none',
        build: {
          outDir: 'build',
          sourcemap: true,
        },
        dev: {
          port: 9999,
          host: '0.0.0.0',
          debounce: 200,
          open: true,
        },
        manifest: {
          name: 'My Ext',
          version: '2.0.0',
          description: 'test',
          manifestVersion: 3,
          permissions: {
            required: ['storage'],
            optional: [],
            host: [],
          },
        },
        plugins: [],
      });

      expect(config.browsers).toEqual(['chrome', 'firefox', 'edge']);
      expect(config.dev?.port).toBe(9999);
      expect(config.manifest?.name).toBe('My Ext');
    });
  });
});
