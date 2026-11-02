/**
 * Manifest diffing for `extforge diff`.
 *
 * Every change gets a level from what existing users experience when the
 * update ships:
 *
 * - `prompt`: Chrome shows a new permission warning, disables the extension
 *   for existing users until they accept it, and the store looks harder at
 *   the update.
 * - `review`: no user-facing prompt, but reviewers will look at it (new
 *   warning-free permissions, optional permissions, CSP and similar).
 * - `info`: version bumps, removals and other routine edits.
 */

export type Level = 'info' | 'review' | 'prompt';

export interface ManifestChange {
  kind: 'added' | 'removed' | 'changed';
  /** Manifest key, e.g. `permissions` or `content_scripts.matches`. */
  key: string;
  /** For set-like keys: the entry that was added or removed. */
  value?: unknown;
  /** For `changed`: the old and new value. */
  from?: unknown;
  to?: unknown;
  level: Level;
  note: string;
}

type Manifest = Record<string, unknown>;

/**
 * Permissions Chrome shows an install-time warning for, so adding one
 * disables the extension for existing users until they accept it.
 * Source: https://developer.chrome.com/docs/extensions/reference/permissions-list
 */
const WARNING_PERMISSIONS = new Set([
  'accessibilityFeatures.modify',
  'accessibilityFeatures.read',
  'bookmarks',
  'clipboardRead',
  'clipboardWrite',
  'contentSettings',
  'debugger',
  'declarativeNetRequest',
  'declarativeNetRequestFeedback',
  'desktopCapture',
  'documentScan',
  'downloads',
  'downloads.open',
  'favicon',
  'geolocation',
  'history',
  'identity.email',
  'management',
  'nativeMessaging',
  'notifications',
  'pageCapture',
  'privacy',
  'proxy',
  'readingList',
  'sessions',
  'system.storage',
  'tabCapture',
  'tabGroups',
  'tabs',
  'topSites',
  'tts',
  'ttsEngine',
  'webAuthenticationProxy',
  'webNavigation',
]);

/** Permissions with no install-time warning. */
const SILENT_PERMISSIONS = new Set([
  'activeTab',
  'alarms',
  'background',
  'contextMenus',
  'cookies',
  'declarativeContent',
  'declarativeNetRequestWithHostAccess',
  'dns',
  'downloads.ui',
  'fontSettings',
  'gcm',
  'identity',
  'idle',
  'offscreen',
  'power',
  'printerProvider',
  'scripting',
  'search',
  'sidePanel',
  'storage',
  'system.cpu',
  'system.display',
  'system.memory',
  'unlimitedStorage',
  'webRequest',
  'webRequestBlocking',
]);

/** Keys reviewers care about even though users see nothing. */
const REVIEW_KEYS = new Set([
  'content_security_policy',
  'externally_connectable',
  'web_accessible_resources',
  'key',
  'update_url',
  'oauth2',
  'declarative_net_request',
  'sandbox',
]);

const BROAD_HOSTS = new Set(['<all_urls>', '*://*/*', 'http://*/*', 'https://*/*']);
const SET_KEYS = [
  'permissions',
  'optional_permissions',
  'host_permissions',
  'optional_host_permissions',
];

const ORDER: Record<Level | 'none', number> = { none: 0, info: 1, review: 2, prompt: 3 };

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

function contentScriptMatches(m: Manifest): string[] {
  const scripts = Array.isArray(m.content_scripts) ? m.content_scripts : [];
  return [...new Set(scripts.flatMap((s) => strings((s as { matches?: unknown }).matches)))];
}

/** Host patterns the manifest grants without asking: host_permissions plus content-script matches. */
function grantedHosts(m: Manifest): Set<string> {
  return new Set([...strings(m.host_permissions), ...contentScriptMatches(m)]);
}

/** Stable JSON so key order doesn't register as a change. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

function classifyPermission(perm: string, optional: boolean): { level: Level; note: string } {
  if (optional) return { level: 'review', note: 'optional: requested at runtime, not on update' };
  if (WARNING_PERMISSIONS.has(perm))
    return { level: 'prompt', note: 'new permission warning: users must re-accept' };
  if (SILENT_PERMISSIONS.has(perm)) return { level: 'review', note: 'no permission warning' };
  return {
    level: 'prompt',
    note: "not in extforge's list of warning-free permissions; assumed to prompt",
  };
}

function classifyHost(host: string, before: Set<string>, optional: boolean) {
  if (optional) return { level: 'review' as Level, note: 'optional: requested at runtime' };
  if (before.has(host)) return { level: 'info' as Level, note: 'already granted elsewhere' };
  if ([...before].some((h) => BROAD_HOSTS.has(h)))
    return { level: 'info' as Level, note: 'covered by existing all-sites access' };
  return { level: 'prompt' as Level, note: 'new host access: users must re-accept' };
}

export function diffManifests(before: Manifest, after: Manifest): ManifestChange[] {
  const changes: ManifestChange[] = [];
  const hostsBefore = grantedHosts(before);

  for (const key of SET_KEYS) {
    const a = new Set(strings(before[key]));
    const b = new Set(strings(after[key]));
    const optional = key.startsWith('optional_');
    const isHost = key.endsWith('host_permissions');
    for (const v of b) {
      if (a.has(v)) continue;
      const c = isHost ? classifyHost(v, hostsBefore, optional) : classifyPermission(v, optional);
      changes.push({ kind: 'added', key, value: v, ...c });
    }
    for (const v of a) {
      if (!b.has(v))
        changes.push({ kind: 'removed', key, value: v, level: 'info', note: 'removal is safe' });
    }
  }

  // Content-script matches grant host access too, and Chrome warns on them.
  const matchesBefore = new Set(contentScriptMatches(before));
  const matchesAfter = new Set(contentScriptMatches(after));
  for (const v of matchesAfter) {
    if (matchesBefore.has(v)) continue;
    changes.push({
      kind: 'added',
      key: 'content_scripts.matches',
      value: v,
      ...classifyHost(v, hostsBefore, false),
    });
  }
  for (const v of matchesBefore) {
    if (!matchesAfter.has(v))
      changes.push({
        kind: 'removed',
        key: 'content_scripts.matches',
        value: v,
        level: 'info',
        note: 'removal is safe',
      });
  }

  const handled = new Set([...SET_KEYS, 'content_scripts']);
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  for (const key of keys) {
    if (handled.has(key)) continue;
    const inA = key in before;
    const inB = key in after;
    const level: Level = REVIEW_KEYS.has(key) ? 'review' : 'info';
    const note = level === 'review' ? 'reviewers check this key' : '';
    if (inA && !inB)
      changes.push({ kind: 'removed', key, value: before[key], level: 'info', note });
    else if (!inA && inB) changes.push({ kind: 'added', key, value: after[key], level, note });
    else if (stable(before[key]) !== stable(after[key]))
      changes.push({ kind: 'changed', key, from: before[key], to: after[key], level, note });
  }

  // Other content_scripts edits (js, css, run_at) are routine.
  const strip = (m: Manifest) =>
    (Array.isArray(m.content_scripts) ? m.content_scripts : []).map((s) => ({
      ...(s as object),
      matches: undefined,
    }));
  if (stable(strip(before)) !== stable(strip(after))) {
    changes.push({
      kind: 'changed',
      key: 'content_scripts',
      from: before.content_scripts,
      to: after.content_scripts,
      level: 'info',
      note: 'scripts or options changed',
    });
  }

  return changes;
}

export function worstLevel(changes: ManifestChange[]): Level | 'none' {
  return changes.reduce<Level | 'none'>(
    (w, c) => (ORDER[c.level] > ORDER[w] ? c.level : w),
    'none',
  );
}

/** Whether `level` is at or above `threshold`. */
export function meetsLevel(level: Level | 'none', threshold: Level): boolean {
  return ORDER[level] >= ORDER[threshold];
}

const short = (v: unknown): string => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 80 ? `${s.slice(0, 77)}...` : s;
};

/** Human-readable lines, disruptive changes first. */
export function formatDiff(changes: ManifestChange[]): string[] {
  const sorted = [...changes].sort((a, b) => ORDER[b.level] - ORDER[a.level]);
  return sorted.map((c) => {
    const mark =
      c.level === 'prompt' ? '⚠' : c.level === 'review' ? '•' : c.kind === 'removed' ? '✓' : ' ';
    const body =
      c.kind === 'changed'
        ? `~ ${c.key}: ${short(c.from)} → ${short(c.to)}`
        : `${c.kind === 'added' ? '+' : '-'} ${c.key}: ${typeof c.value === 'string' ? JSON.stringify(c.value) : short(c.value)}`;
    return `${body}  ${mark}${c.note ? ` ${c.note}` : ''}`.trimEnd();
  });
}
