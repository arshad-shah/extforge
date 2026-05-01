import { describe, it, expect, vi, afterEach } from 'vitest';
import { DEFAULT_CONFIG, defineConfig, loadExtForgeConfig, type ExtForgeConfig } from '../src/core/config.js';

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

  describe('Given loadExtForgeConfig with invalid config', () => {
    afterEach(() => {
      delete process.env['EXTFORGE_STRICT_CONFIG'];
    });

    it('should warn but NOT throw on invalid browsers when EXTFORGE_STRICT_CONFIG is unset', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      // Pass an invalid browser via overrides — c12 won't find a config file in test cwd
      // We supply _strictConfig: undefined so warn mode is used
      await expect(
        loadExtForgeConfig(process.cwd(), { browsers: ['brave'] as unknown as ExtForgeConfig['browsers'] }),
      ).resolves.toBeDefined();
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Config validation warnings'));
      spy.mockRestore();
    });

    it('should throw on invalid browsers when EXTFORGE_STRICT_CONFIG=1', async () => {
      process.env['EXTFORGE_STRICT_CONFIG'] = '1';
      await expect(
        loadExtForgeConfig(process.cwd(), { browsers: ['brave'] as unknown as ExtForgeConfig['browsers'] }),
      ).rejects.toThrow('extforge.config is invalid');
    });
  });

  describe('Given defineConfig helper', () => {
    it('should return the config object unchanged', () => {
      const config: ExtForgeConfig = {
        browsers: ['chrome'],
        framework: 'vanilla',
      };
      const result = defineConfig(config);
      expect(result).toEqual(config);
    });

    it('should accept a full config with all fields', () => {
      const config = defineConfig({
        browsers: ['chrome', 'firefox', 'edge'],
        framework: 'react',
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
