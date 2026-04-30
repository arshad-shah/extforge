export type { Browser, ManifestConfig, ManifestPermission, ValidationResult } from './types.js';
export { ALL_BROWSERS } from './types.js';
export { AVAILABLE_PERMISSIONS, PERMISSION_GROUPS, BROWSER_FEATURES, FIREFOX_MIN_VERSION } from './constants.js';
export type { Permission } from './constants.js';
export { generateManifest, validateManifestConfig, writeManifest } from './generator.js';
