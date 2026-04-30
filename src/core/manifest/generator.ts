/**
 * Manifest Engine — generation, validation, writing
 *
 * Constants imported from ./constants.ts
 * Types imported from ./types.ts
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'pathe';
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

export function generateManifest(config: ManifestConfig, browser: Browser): Record<string, unknown> {
  const features = BROWSER_FEATURES[browser];
  const overrides = config.browserOverrides?.[browser] ?? {};

  const manifest: Record<string, unknown> = {
    manifest_version: config.manifestVersion,
    name: overrides.name ?? config.name,
    version: overrides.version ?? config.version,
    description: overrides.description ?? config.description,
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
        id: config.firefoxId ?? `${config.name.toLowerCase().replace(/\s+/g, '-')}@extension`,
        strict_min_version: FIREFOX_MIN_VERSION,
      },
    };
  }

  return manifest;
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
