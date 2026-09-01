export type { Permission } from './constants.js';
export {
  AVAILABLE_PERMISSIONS,
  BROWSER_FEATURES,
  FIREFOX_MIN_VERSION,
  PERMISSION_GROUPS,
} from './constants.js';
export {
  applyInjectedDefaults,
  generateManifest,
  validateManifestConfig,
  writeManifest,
} from './generator.js';
export type { Browser, ManifestConfig, ManifestPermission, ValidationResult } from './types.js';
export { ALL_BROWSERS } from './types.js';
