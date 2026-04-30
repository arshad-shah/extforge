/**
 * Manifest Constants
 *
 * All permission lists, browser capability matrices, and grouped
 * permission metadata live here for easy editing.
 */

import type { Browser } from './types.js';

// ─── All MV3 permissions ─────────────────────────────────────────────────────

export const AVAILABLE_PERMISSIONS = [
  'activeTab', 'alarms', 'audio', 'background', 'bookmarks',
  'browsingData', 'certificateProvider', 'clipboardRead', 'clipboardWrite',
  'contentSettings', 'contextMenus', 'cookies', 'debugger',
  'declarativeContent', 'declarativeNetRequest', 'declarativeNetRequestFeedback',
  'declarativeNetRequestWithHostAccess', 'desktopCapture', 'dns',
  'documentScan', 'downloads', 'downloads.open', 'downloads.ui',
  'enterprise.deviceAttributes', 'enterprise.hardwarePlatform',
  'enterprise.networkingAttributes', 'enterprise.platformKeys',
  'favicon', 'fileBrowserHandler', 'fileSystemProvider', 'fontSettings',
  'gcm', 'geolocation', 'history', 'identity', 'identity.email', 'idle',
  'loginState', 'management', 'nativeMessaging', 'notifications',
  'offscreen', 'pageCapture', 'platformKeys', 'power', 'printerProvider',
  'printing', 'printingMetrics', 'privacy', 'processes', 'proxy',
  'readingList', 'runtime', 'scripting', 'search', 'sessions',
  'sidePanel', 'storage', 'system.cpu', 'system.display',
  'system.memory', 'system.storage', 'tabCapture', 'tabGroups', 'tabs',
  'topSites', 'tts', 'ttsEngine', 'unlimitedStorage', 'vpnProvider',
  'wallpaper', 'webAuthenticationProxy', 'webNavigation', 'webRequest',
  'webRequestBlocking',
] as const;

export type Permission = typeof AVAILABLE_PERMISSIONS[number];

// ─── Permission groups (used by the interactive scaffold) ────────────────────

export const PERMISSION_GROUPS: Record<string, { description: string; permissions: string[] }> = {
  'Core': {
    description: 'Essential extension capabilities',
    permissions: ['storage', 'activeTab', 'tabs', 'scripting', 'runtime'],
  },
  'UI': {
    description: 'User interface features',
    permissions: ['sidePanel', 'contextMenus', 'notifications', 'alarms'],
  },
  'Data Access': {
    description: 'Access browser data',
    permissions: ['bookmarks', 'history', 'cookies', 'downloads', 'readingList', 'topSites'],
  },
  'Network': {
    description: 'Network interception and modification',
    permissions: ['webRequest', 'declarativeNetRequest', 'proxy', 'webNavigation'],
  },
  'System': {
    description: 'System-level access',
    permissions: ['nativeMessaging', 'management', 'geolocation', 'identity'],
  },
  'Clipboard': {
    description: 'Clipboard operations',
    permissions: ['clipboardRead', 'clipboardWrite'],
  },
};

// ─── Browser capability matrix ───────────────────────────────────────────────
// Describes how each browser differs for manifest generation.

export const BROWSER_FEATURES: Record<Browser, {
  backgroundType: 'service_worker' | 'scripts';
  optionsKey: 'options_page' | 'options_ui';
  sidePanelSupport: boolean;
  browserSpecificSettings: boolean;
}> = {
  chrome: {
    backgroundType: 'service_worker',
    optionsKey: 'options_page',
    sidePanelSupport: true,
    browserSpecificSettings: false,
  },
  firefox: {
    backgroundType: 'scripts',
    optionsKey: 'options_ui',
    sidePanelSupport: false,
    browserSpecificSettings: true,
  },
  safari: {
    backgroundType: 'service_worker',
    optionsKey: 'options_ui',
    sidePanelSupport: false,
    browserSpecificSettings: false,
  },
  edge: {
    backgroundType: 'service_worker',
    optionsKey: 'options_page',
    sidePanelSupport: true,
    browserSpecificSettings: false,
  },
};

// ─── Firefox minimum version ─────────────────────────────────────────────────

export const FIREFOX_MIN_VERSION = '109.0';
