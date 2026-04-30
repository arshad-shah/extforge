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
  contentScripts?: Array<{
    matches: string[];
    js?: string[];
    css?: string[];
    runAt?: 'document_start' | 'document_end' | 'document_idle';
  }>;
  optionsPage?: string;
  sidePanel?: {
    defaultPath?: string;
  };
  icons?: Record<string, string>;
  webAccessibleResources?: Array<{
    resources: string[];
    matches: string[];
  }>;
  commands?: Record<string, {
    suggestedKey?: { default?: string; mac?: string };
    description?: string;
  }>;
  firefoxId?: string;
  browserOverrides?: Partial<Record<Browser, Partial<ManifestConfig>>>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
