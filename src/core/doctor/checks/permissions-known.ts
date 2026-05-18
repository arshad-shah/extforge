import type { Check } from '../index.js';
import { loadExtForgeConfig } from '../../config.js';

const KNOWN = new Set([
  'activeTab','alarms','bookmarks','clipboardRead','clipboardWrite','contextMenus',
  'cookies','declarativeNetRequest','declarativeNetRequestWithHostAccess','downloads',
  'enterprise.deviceAttributes','enterprise.hardwarePlatformKeys',
  'enterprise.networkingAttributes','enterprise.platformKeys',
  'fontSettings','geolocation','history','identity',
  'idle','management','nativeMessaging','notifications','offscreen','pageCapture',
  'power','privacy','proxy','scripting','search','sidePanel','storage','system.cpu',
  'system.display','system.memory','system.storage','tabCapture','tabGroups','tabs',
  'topSites','tts','ttsEngine','unlimitedStorage','webNavigation','webRequest',
  'webRequestBlocking','webRequestAuthProvider',
]);

/**
 * Extract the permission strings to validate from either shape:
 *   - flat array:   permissions: ['storage', 'tabs']
 *   - object form:  permissions: { required: [...], optional: [...], host: [...] }
 *
 * Host permissions (URL match patterns) are excluded — they're not from KNOWN.
 */
function collectPermissions(permsRaw: unknown): string[] {
  if (Array.isArray(permsRaw)) return permsRaw.filter((p): p is string => typeof p === 'string');
  if (permsRaw && typeof permsRaw === 'object') {
    const o = permsRaw as { required?: unknown; optional?: unknown };
    const required = Array.isArray(o.required) ? o.required : [];
    const optional = Array.isArray(o.optional) ? o.optional : [];
    return [...required, ...optional].filter((p): p is string => typeof p === 'string');
  }
  return [];
}

export const permissionsKnownCheck: Check = {
  name: 'permissions-known',
  async run({ cwd }) {
    try {
      const cfg = await loadExtForgeConfig(cwd);
      const manifest = cfg.manifest as { permissions?: unknown } | undefined;
      const perms = collectPermissions(manifest?.permissions);
      const unknown = perms.filter((p) => !KNOWN.has(p) && !p.startsWith('http') && p !== '<all_urls>');
      if (unknown.length === 0) return { name: 'permissions-known', status: 'pass', message: 'Permissions OK' };
      return { name: 'permissions-known', status: 'warn', message: `Unknown permissions: ${unknown.join(', ')}` };
    } catch { return { name: 'permissions-known', status: 'info', message: 'Skipped (config invalid)' }; }
  },
};
