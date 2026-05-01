import type { Check } from '../index.js';
import { loadExtForgeConfig } from '../../config.js';

const KNOWN = new Set([
  'activeTab','alarms','bookmarks','contextMenus','cookies','declarativeNetRequest',
  'declarativeNetRequestWithHostAccess','downloads','geolocation','history','identity',
  'idle','management','nativeMessaging','notifications','offscreen','pageCapture',
  'power','privacy','proxy','scripting','search','sidePanel','storage','system.cpu',
  'system.display','system.memory','system.storage','tabCapture','tabGroups','tabs',
  'topSites','tts','ttsEngine','unlimitedStorage','webNavigation','webRequest',
  'webRequestBlocking','webRequestAuthProvider',
]);

export const permissionsKnownCheck: Check = {
  name: 'permissions-known',
  async run({ cwd }) {
    try {
      const cfg = await loadExtForgeConfig(cwd);
      const perms = (cfg.manifest as unknown as { permissions?: string[] })?.permissions ?? [];
      const unknown = perms.filter((p) => !KNOWN.has(p) && !p.startsWith('http'));
      if (unknown.length === 0) return { name: 'permissions-known', status: 'pass', message: 'Permissions OK' };
      return { name: 'permissions-known', status: 'warn', message: `Unknown permissions: ${unknown.join(', ')}` };
    } catch { return { name: 'permissions-known', status: 'info', message: 'Skipped (config invalid)' }; }
  },
};
