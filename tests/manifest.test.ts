import { describe, it, expect } from 'vitest';
import {
  generateManifest,
  validateManifestConfig,
  applyInjectedDefaults,
  ALL_BROWSERS,
  PERMISSION_GROUPS,
  type ManifestConfig,
  type Browser,
} from '../src/core/manifest/index.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const validConfig: ManifestConfig = {
  name: 'Test Extension',
  version: '1.0.0',
  description: 'A test extension',
  manifestVersion: 3,
  permissions: {
    required: ['storage', 'activeTab'],
    optional: ['notifications'],
    host: ['https://*/*'],
  },
  action: {
    defaultPopup: 'ui/popup/index.html',
    defaultIcon: { '16': 'icons/icon-16.png', '32': 'icons/icon-32.png' },
    defaultTitle: 'Test Extension',
  },
  background: {
    entrypoint: 'background/index.js',
  },
  contentScripts: [
    {
      matches: ['<all_urls>'],
      js: ['content/index.js'],
      css: ['styles/content.css'],
      runAt: 'document_idle',
    },
  ],
  optionsPage: 'ui/options/index.html',
  icons: {
    '16': 'icons/icon-16.png',
    '32': 'icons/icon-32.png',
    '48': 'icons/icon-48.png',
    '128': 'icons/icon-128.png',
  },
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Manifest Engine', () => {
  describe('Given a valid manifest config', () => {
    describe('When generating for Chrome', () => {
      const manifest = generateManifest(validConfig, 'chrome');

      it('should set manifest_version to 3', () => {
        expect(manifest.manifest_version).toBe(3);
      });

      it('should include extension name and version', () => {
        expect(manifest.name).toBe('Test Extension');
        expect(manifest.version).toBe('1.0.0');
      });

      it('should use service_worker for background', () => {
        expect(manifest.background).toEqual({
          service_worker: 'background/index.js',
          type: 'module',
        });
      });

      it('should use options_page (not options_ui) for Chrome', () => {
        expect(manifest.options_page).toBe('ui/options/index.html');
        expect(manifest).not.toHaveProperty('options_ui');
      });

      it('should include required permissions', () => {
        expect(manifest.permissions).toContain('storage');
        expect(manifest.permissions).toContain('activeTab');
      });

      it('should separate optional permissions', () => {
        expect(manifest.optional_permissions).toContain('notifications');
      });

      it('should include host permissions', () => {
        expect(manifest.host_permissions).toContain('https://*/*');
      });

      it('should include content scripts', () => {
        const scripts = manifest.content_scripts as Array<Record<string, unknown>>;
        expect(scripts).toHaveLength(1);
        expect(scripts[0].matches).toContain('<all_urls>');
        expect(scripts[0].js).toContain('content/index.js');
        expect(scripts[0].run_at).toBe('document_idle');
      });

      it('should include action config', () => {
        const action = manifest.action as Record<string, unknown>;
        expect(action.default_popup).toBe('ui/popup/index.html');
        expect(action.default_title).toBe('Test Extension');
      });

      it('should include icons', () => {
        const icons = manifest.icons as Record<string, string>;
        expect(icons['128']).toBe('icons/icon-128.png');
      });
    });

    describe('When generating for Firefox', () => {
      const manifest = generateManifest(validConfig, 'firefox');

      it('should use scripts array for background (not service_worker)', () => {
        expect(manifest.background).toEqual({
          scripts: ['background/index.js'],
          type: 'module',
        });
      });

      it('should use options_ui (not options_page) for Firefox', () => {
        expect(manifest.options_ui).toEqual({
          page: 'ui/options/index.html',
          open_in_tab: true,
        });
        expect(manifest).not.toHaveProperty('options_page');
      });

      it('should include browser_specific_settings with gecko ID', () => {
        const settings = manifest.browser_specific_settings as Record<string, Record<string, unknown>>;
        expect(settings.gecko).toBeDefined();
        expect(settings.gecko.id).toBeTruthy();
        expect(settings.gecko.strict_min_version).toBe('109.0');
      });
    });

    describe('When generating for Safari', () => {
      const manifest = generateManifest(validConfig, 'safari');

      it('should use service_worker for background', () => {
        expect(manifest.background).toEqual({
          service_worker: 'background/index.js',
          type: 'module',
        });
      });

      it('should not include browser_specific_settings', () => {
        expect(manifest).not.toHaveProperty('browser_specific_settings');
      });
    });

    describe('When generating for Edge', () => {
      const manifest = generateManifest(validConfig, 'edge');

      it('should match Chrome behavior (service_worker, options_page)', () => {
        expect(manifest.background).toEqual({
          service_worker: 'background/index.js',
          type: 'module',
        });
        expect(manifest.options_page).toBe('ui/options/index.html');
      });
    });
  });

  describe('Given a config with side panel', () => {
    const configWithPanel: ManifestConfig = {
      ...validConfig,
      sidePanel: { defaultPath: 'ui/sidepanel/index.html' },
    };

    it('should include side_panel for Chrome', () => {
      const manifest = generateManifest(configWithPanel, 'chrome');
      expect(manifest.side_panel).toEqual({ default_path: 'ui/sidepanel/index.html' });
    });

    it('should use sidebar_action for Firefox', () => {
      const manifest = generateManifest(configWithPanel, 'firefox');
      expect(manifest.sidebar_action).toBeDefined();
      expect(manifest).not.toHaveProperty('side_panel');
    });

    it('should not include side panel for Safari', () => {
      const manifest = generateManifest(configWithPanel, 'safari');
      expect(manifest).not.toHaveProperty('side_panel');
      expect(manifest).not.toHaveProperty('sidebar_action');
    });
  });

  describe('Given browser-specific overrides', () => {
    const configWithOverrides: ManifestConfig = {
      ...validConfig,
      browserOverrides: {
        firefox: { name: 'Test for Firefox' },
      },
    };

    it('should apply the override for the target browser', () => {
      const manifest = generateManifest(configWithOverrides, 'firefox');
      expect(manifest.name).toBe('Test for Firefox');
    });

    it('should not apply overrides for other browsers', () => {
      const manifest = generateManifest(configWithOverrides, 'chrome');
      expect(manifest.name).toBe('Test Extension');
    });

    it('applies permissions override (object form) per browser', () => {
      const cfg: ManifestConfig = {
        ...validConfig,
        browserOverrides: {
          firefox: {
            permissions: {
              required: ['cookies'],
              optional: [],
              host: ['https://example.com/*'],
            },
          },
        },
      };
      const firefoxManifest = generateManifest(cfg, 'firefox');
      expect(firefoxManifest.permissions).toEqual(['cookies']);
      expect(firefoxManifest.host_permissions).toEqual(['https://example.com/*']);
      // Chrome still gets the base config.
      const chromeManifest = generateManifest(cfg, 'chrome');
      expect(chromeManifest.permissions).toContain('storage');
      expect(chromeManifest.permissions).toContain('activeTab');
    });

    it('applies action override per browser', () => {
      const cfg: ManifestConfig = {
        ...validConfig,
        browserOverrides: {
          firefox: { action: { defaultTitle: 'Firefox-only title' } },
        },
      };
      const firefoxManifest = generateManifest(cfg, 'firefox');
      const action = firefoxManifest.action as Record<string, unknown>;
      expect(action.default_title).toBe('Firefox-only title');
    });

    it('applies background override per browser', () => {
      const cfg: ManifestConfig = {
        ...validConfig,
        browserOverrides: {
          firefox: { background: { entrypoint: 'background/firefox.js' } },
        },
      };
      const firefoxManifest = generateManifest(cfg, 'firefox');
      expect(firefoxManifest.background).toEqual({
        scripts: ['background/firefox.js'],
        type: 'module',
      });
    });

    it('applies contentScripts override per browser', () => {
      const cfg: ManifestConfig = {
        ...validConfig,
        browserOverrides: {
          firefox: {
            contentScripts: [
              { matches: ['https://firefox.test/*'], js: ['content/firefox.js'] },
            ],
          },
        },
      };
      const firefoxManifest = generateManifest(cfg, 'firefox');
      const scripts = firefoxManifest.content_scripts as Array<Record<string, unknown>>;
      expect(scripts).toHaveLength(1);
      expect(scripts[0].matches).toEqual(['https://firefox.test/*']);
      expect(scripts[0].js).toEqual(['content/firefox.js']);
    });
  });

  describe('firefoxId derivation', () => {
    it('strips non-ASCII characters from the auto-generated id', () => {
      const cfg: ManifestConfig = {
        ...validConfig,
        name: 'Résumé Helper',
      };
      const manifest = generateManifest(cfg, 'firefox');
      const settings = manifest.browser_specific_settings as Record<string, Record<string, unknown>>;
      const id = settings.gecko.id as string;
      // The Firefox addon id grammar is [a-zA-Z0-9-._]+@[a-zA-Z0-9-._]+
      expect(id).toMatch(/^[a-zA-Z0-9-._]+@[a-zA-Z0-9-._]+$/);
    });

    it('strips slashes, ampersands, emoji from the auto-generated id', () => {
      const cfg: ManifestConfig = {
        ...validConfig,
        name: 'My & Cool / Ext 🚀',
      };
      const manifest = generateManifest(cfg, 'firefox');
      const settings = manifest.browser_specific_settings as Record<string, Record<string, unknown>>;
      const id = settings.gecko.id as string;
      expect(id).toMatch(/^[a-zA-Z0-9-._]+@[a-zA-Z0-9-._]+$/);
    });

    it('respects an explicitly-provided firefoxId verbatim', () => {
      const cfg: ManifestConfig = { ...validConfig, firefoxId: 'custom@example.com' };
      const manifest = generateManifest(cfg, 'firefox');
      const settings = manifest.browser_specific_settings as Record<string, Record<string, unknown>>;
      expect(settings.gecko.id).toBe('custom@example.com');
    });
  });

  describe('Given all target browsers', () => {
    it('should generate valid manifests for every browser', () => {
      for (const browser of ALL_BROWSERS) {
        const manifest = generateManifest(validConfig, browser);
        expect(manifest.manifest_version).toBe(3);
        expect(manifest.name).toBe('Test Extension');
        expect(manifest.version).toBe('1.0.0');
        expect(manifest.permissions).toBeDefined();
      }
    });
  });

  describe('applyInjectedDefaults', () => {
    it('does nothing when no injected entries exist', () => {
      const manifest: Record<string, unknown> = {};
      applyInjectedDefaults(manifest, validConfig, {});
      expect(manifest.web_accessible_resources).toBeUndefined();
    });

    it('does nothing when user already declared webAccessibleResources', () => {
      const manifest: Record<string, unknown> = {
        web_accessible_resources: [{ resources: ['user.js'], matches: ['https://example.com/*'] }],
      };
      const userConfig = {
        ...validConfig,
        webAccessibleResources: [{ resources: ['user.js'], matches: ['https://example.com/*'] }],
      };
      applyInjectedDefaults(manifest, userConfig, { injected: '/path/injected.ts' });
      expect(manifest.web_accessible_resources).toEqual([
        { resources: ['user.js'], matches: ['https://example.com/*'] },
      ]);
    });

    it('auto-populates with injected.js for single-entry mode', () => {
      const manifest: Record<string, unknown> = {};
      applyInjectedDefaults(manifest, validConfig, { injected: '/path/injected.ts' });
      expect(manifest.web_accessible_resources).toEqual([
        { resources: ['injected.js'], matches: ['<all_urls>'] },
      ]);
    });

    it('auto-populates with injected/<name>.js for multi-entry mode', () => {
      const manifest: Record<string, unknown> = {};
      applyInjectedDefaults(manifest, validConfig, {
        'injected/a': '/path/injected/a.ts',
        'injected/b': '/path/injected/b.tsx',
      });
      expect(manifest.web_accessible_resources).toEqual([
        { resources: ['injected/a.js', 'injected/b.js'], matches: ['<all_urls>'] },
      ]);
    });

    it('treats an empty webAccessibleResources array as "not declared"', () => {
      const manifest: Record<string, unknown> = {};
      const userConfig = { ...validConfig, webAccessibleResources: [] };
      applyInjectedDefaults(manifest, userConfig, { injected: '/path/injected.ts' });
      expect(manifest.web_accessible_resources).toEqual([
        { resources: ['injected.js'], matches: ['<all_urls>'] },
      ]);
    });
  });
});

describe('Manifest Validation', () => {
  describe('Given a valid config', () => {
    it('should pass validation', () => {
      const result = validateManifestConfig(validConfig);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Given an invalid config', () => {
    it('should reject missing name', () => {
      const result = validateManifestConfig({ ...validConfig, name: '' });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('name'))).toBe(true);
    });

    it('should reject name over 45 chars', () => {
      const result = validateManifestConfig({ ...validConfig, name: 'x'.repeat(50) });
      expect(result.valid).toBe(false);
    });

    it('should reject invalid version format', () => {
      const result = validateManifestConfig({ ...validConfig, version: 'not-semver' });
      expect(result.valid).toBe(false);
    });

    it('should reject description over 132 chars', () => {
      const result = validateManifestConfig({ ...validConfig, description: 'x'.repeat(200) });
      expect(result.valid).toBe(false);
    });
  });

  describe('Given warning conditions', () => {
    it('should warn about missing description', () => {
      const result = validateManifestConfig({ ...validConfig, description: '' });
      expect(result.warnings.some(w => w.includes('description'))).toBe(true);
    });

    it('should warn about <all_urls> host permissions', () => {
      const config: ManifestConfig = {
        ...validConfig,
        permissions: { ...validConfig.permissions, host: ['<all_urls>'] },
      };
      const result = validateManifestConfig(config);
      expect(result.warnings.some(w => w.includes('all URLs'))).toBe(true);
    });
  });
});

describe('Permission Groups', () => {
  it('should define at least 4 permission groups', () => {
    expect(Object.keys(PERMISSION_GROUPS).length).toBeGreaterThanOrEqual(4);
  });

  it('should have descriptions for each group', () => {
    for (const [name, group] of Object.entries(PERMISSION_GROUPS)) {
      expect(group.description).toBeTruthy();
      expect(group.permissions.length).toBeGreaterThan(0);
    }
  });

  it('should include storage in Core group', () => {
    expect(PERMISSION_GROUPS['Core'].permissions).toContain('storage');
  });
});
