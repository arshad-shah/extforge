/**
 * Manifest Types
 */

export type Browser = 'chrome' | 'firefox' | 'safari' | 'edge';

export const ALL_BROWSERS: Browser[] = ['chrome', 'firefox', 'safari', 'edge'];

export interface ManifestPermission {
  required: string[];
  optional: string[];
  host: string[];
}

/** `run_at` timing for a content script. */
export type ContentScriptRunAt = 'document_start' | 'document_end' | 'document_idle';

/**
 * Execution world for a content script. `'MAIN'` runs the script in the page's
 * own JS realm (shared globals, no extension APIs); `'ISOLATED'` is the default
 * content-script sandbox. Chrome/Edge 111+, Firefox 128+, Safari 18+ — see
 * `FIREFOX_CONTENT_SCRIPT_WORLD_MIN_VERSION` for how the Firefox floor is
 * handled.
 */
export type ContentScriptWorld = 'MAIN' | 'ISOLATED';

/**
 * One `content_scripts[]` entry, ExtForge-flavored (camelCase in, snake_case
 * out). Everything except `matches` is optional and is omitted from the
 * generated manifest when unset — the browser default applies.
 */
export interface ContentScriptConfig {
  /** URL patterns the script is injected into. */
  matches: string[];
  /** URL patterns subtracted from `matches`. Emitted as `exclude_matches`. */
  excludeMatches?: string[];
  js?: string[];
  css?: string[];
  /** Emitted as `run_at`. Defaults to `'document_idle'`. */
  runAt?: ContentScriptRunAt;
  /**
   * Inject into every frame on a matching page, not just the top one.
   * Emitted as `all_frames`. Required by anything that inspects or overlays
   * iframe content.
   */
  allFrames?: boolean;
  /**
   * Also inject into `about:blank` / `about:srcdoc` frames whose *creator*
   * matches. Emitted as `match_about_blank`.
   */
  matchAboutBlank?: boolean;
  /** Emitted as `world`. See {@link ContentScriptWorld}. */
  world?: ContentScriptWorld;
}

export interface ManifestConfig {
  name: string;
  version: string;
  description: string;
  manifestVersion: 2 | 3;
  permissions: ManifestPermission;
  action?: {
    defaultPopup?: string;
    defaultIcon?: Record<string, string>;
    defaultTitle?: string;
  };
  background?: {
    entrypoint: string;
  };
  contentScripts?: ContentScriptConfig[];
  optionsPage?: string;
  sidePanel?: {
    defaultPath?: string;
  };
  icons?: Record<string, string>;
  webAccessibleResources?: Array<{
    resources: string[];
    matches: string[];
  }>;
  commands?: Record<
    string,
    {
      suggestedKey?: { default?: string; mac?: string };
      description?: string;
    }
  >;
  firefoxId?: string;
  browserOverrides?: Partial<Record<Browser, Partial<ManifestConfig>>>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
