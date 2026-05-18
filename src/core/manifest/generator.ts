/**
 * Manifest Engine — generation, validation, writing
 *
 * Constants imported from ./constants.ts
 * Types imported from ./types.ts
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createLogger, type Logger } from '../logger/index.js';
import { BROWSER_FEATURES, FIREFOX_MIN_VERSION } from './constants.js';
import type { Browser, ManifestConfig, ValidationResult } from './types.js';

// ─── Validation ──────────────────────────────────────────────────────────────

export function validateManifestConfig(config: ManifestConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.name || config.name.trim().length === 0)
    errors.push('Extension name is required');
  if (config.name && config.name.length > 45)
    errors.push('Extension name must be 45 characters or less');
  if (!config.version || !/^\d+\.\d+\.\d+$/.test(config.version))
    errors.push('Version must be in semver format (e.g., 1.0.0)');
  if (!config.description)
    warnings.push('Extension description is recommended for store submissions');
  if (config.description && config.description.length > 132)
    errors.push('Description must be 132 characters or less');
  if (config.manifestVersion !== 3)
    warnings.push('Manifest V2 is deprecated — consider migrating to V3');

  const perms = config.permissions.required;
  if (perms.includes('webRequest') && perms.includes('webRequestBlocking'))
    warnings.push('webRequestBlocking is only available in MV2 — use declarativeNetRequest for MV3');
  if (perms.includes('<all_urls>') || config.permissions.host.includes('<all_urls>'))
    warnings.push('Requesting access to all URLs increases review time on stores');

  return { valid: errors.length === 0, errors, warnings };
}

// ─── Generator ───────────────────────────────────────────────────────────────

/**
 * Merge a per-browser override into the base config. Top-level fields are
 * replaced; nested objects (action, background, permissions, sidePanel) are
 * shallow-merged so a partial override doesn't drop fields the user didn't
 * touch. Arrays (contentScripts, webAccessibleResources) and primitives are
 * replaced wholesale — the user's override wins.
 *
 * `browserOverrides` itself is dropped from the result so the override
 * recursion can't reapply.
 */
function applyBrowserOverride(base: ManifestConfig, browser: Browser): ManifestConfig {
  const override = base.browserOverrides?.[browser];
  if (!override) return base;

  const merged: ManifestConfig = {
    ...base,
    ...override,
    permissions: override.permissions
      ? { ...base.permissions, ...override.permissions }
      : base.permissions,
    action: override.action ? { ...base.action, ...override.action } : base.action,
    background: override.background ? { ...base.background, ...override.background } : base.background,
    sidePanel: override.sidePanel ? { ...base.sidePanel, ...override.sidePanel } : base.sidePanel,
    commands: override.commands ? { ...base.commands, ...override.commands } : base.commands,
  };
  delete merged.browserOverrides;
  return merged;
}

export function generateManifest(baseConfig: ManifestConfig, browser: Browser): Record<string, unknown> {
  const features = BROWSER_FEATURES[browser];
  const config = applyBrowserOverride(baseConfig, browser);

  const manifest: Record<string, unknown> = {
    manifest_version: config.manifestVersion,
    name: config.name,
    version: config.version,
    description: config.description,
  };

  if (config.icons) manifest.icons = config.icons;

  // Action
  if (config.action) {
    manifest.action = {
      ...(config.action.defaultPopup && { default_popup: config.action.defaultPopup }),
      ...(config.action.defaultIcon && { default_icon: config.action.defaultIcon }),
      ...(config.action.defaultTitle && { default_title: config.action.defaultTitle }),
    };
  }

  // Background
  if (config.background) {
    manifest.background = features.backgroundType === 'service_worker'
      ? { service_worker: config.background.entrypoint, type: 'module' }
      : { scripts: [config.background.entrypoint], type: 'module' };
  }

  // Content scripts
  if (config.contentScripts?.length) {
    manifest.content_scripts = config.contentScripts.map(cs => ({
      matches: cs.matches,
      ...(cs.js && { js: cs.js }),
      ...(cs.css && { css: cs.css }),
      run_at: cs.runAt ?? 'document_idle',
    }));
  }

  // Permissions
  manifest.permissions = [...config.permissions.required];
  if (config.permissions.optional.length > 0)
    manifest.optional_permissions = config.permissions.optional;
  if (config.permissions.host.length > 0)
    manifest.host_permissions = config.permissions.host;

  // Options
  if (config.optionsPage) {
    if (features.optionsKey === 'options_page')
      manifest.options_page = config.optionsPage;
    else
      manifest.options_ui = { page: config.optionsPage, open_in_tab: true };
  }

  // Side panel
  if (config.sidePanel?.defaultPath) {
    if (features.sidePanelSupport)
      manifest.side_panel = { default_path: config.sidePanel.defaultPath };
    else if (browser === 'firefox')
      manifest.sidebar_action = { default_panel: config.sidePanel.defaultPath, default_title: config.name };
  }

  // Web accessible resources
  if (config.webAccessibleResources)
    manifest.web_accessible_resources = config.webAccessibleResources;

  // Commands
  if (config.commands) {
    const cmds: Record<string, unknown> = {};
    for (const [key, cmd] of Object.entries(config.commands)) {
      cmds[key] = {
        ...(cmd.suggestedKey && { suggested_key: cmd.suggestedKey }),
        ...(cmd.description && { description: cmd.description }),
      };
    }
    manifest.commands = cmds;
  }

  // Firefox
  if (browser === 'firefox' && features.browserSpecificSettings) {
    manifest.browser_specific_settings = {
      gecko: {
        id: config.firefoxId ?? deriveFirefoxId(config.name),
        strict_min_version: FIREFOX_MIN_VERSION,
      },
    };
  }

  return manifest;
}

/**
 * Build a Firefox addon id from the extension name when the user didn't
 * supply `firefoxId`. The id grammar is `[a-zA-Z0-9-._]+@[a-zA-Z0-9-._]+`,
 * so non-ASCII characters (unicode names like "Résumé Helper") and
 * meta-characters (`&`, `/`, emoji) have to be stripped or rejected.
 *
 * We lowercase, collapse runs of unsupported characters to `-`, trim
 * leading/trailing `-`, and fall back to `extension` if nothing survives.
 */
function deriveFirefoxId(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const local = cleaned.length > 0 ? cleaned : 'extension';
  return `${local}@extension`;
}

// ─── Injected defaults ───────────────────────────────────────────────────────

/**
 * Auto-populate `web_accessible_resources` for injected (page-context) scripts.
 * No-ops if the user already declared a non-empty `webAccessibleResources` array
 * or if no injected entries exist.
 */
export function applyInjectedDefaults(
  manifest: Record<string, unknown>,
  userConfig: ManifestConfig,
  injectedEntries: Record<string, string>,
): void {
  if (Object.keys(injectedEntries).length === 0) return;
  if (userConfig.webAccessibleResources && userConfig.webAccessibleResources.length > 0) return;

  const resources = Object.keys(injectedEntries).map(key =>
    key === 'injected' ? 'injected.js' : `${key}.js`,
  );
  manifest.web_accessible_resources = [{ resources, matches: ['<all_urls>'] }];
}

// ─── Writer ──────────────────────────────────────────────────────────────────

export function writeManifest(
  config: ManifestConfig, browser: Browser, outDir: string, logger?: Logger,
): void {
  const log = logger ?? createLogger({ scope: 'manifest' });
  const manifest = generateManifest(config, browser);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  log.debug(`Wrote manifest for ${browser} → ${outDir}`);
}
