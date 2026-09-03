// Config

export type {
  CssOption,
  CssPreset,
  CssProcessor,
  CssTransform,
  CssTransformContext,
} from './builder/css.js';
// CSS pipeline
export { CSS_PRESETS, isCssPreset, resolveCssProcessor } from './builder/css.js';
export type { BuildOptions, BuildResult } from './builder/index.js';
// Builder
export { build, buildAll, createBuildContext } from './builder/index.js';
export type { ExtForgeConfig, ExtForgePlugin } from './config.js';
export { DEFAULT_CONFIG, defineConfig, loadExtForgeConfig } from './config.js';
export type { HMRServer, HMRServerOptions, HMRUpdate, HMRUpdateType } from './hmr/index.js';
// HMR
export { classifyChange, createHMRServer, generateHMRClientCode } from './hmr/index.js';
export type { LogEntry, LoggerOptions, LogTransport } from './logger/index.js';
// Logger
export {
  createLogger,
  formatDuration,
  formatFileSize,
  formatPath,
  getLogger,
  Logger,
  LogLevel,
  setRootLogger,
} from './logger/index.js';
export type {
  Browser,
  ContentScriptConfig,
  ContentScriptRunAt,
  ContentScriptWorld,
  ManifestConfig,
  ManifestPermission,
  Permission,
  ValidationResult,
} from './manifest/index.js';
// Manifest
export {
  ALL_BROWSERS,
  AVAILABLE_PERMISSIONS,
  applyInjectedDefaults,
  generateManifest,
  PERMISSION_GROUPS,
  validateManifestConfig,
  writeManifest,
} from './manifest/index.js';
export type { ScaffoldAnswers, ScaffoldOptions } from './scaffold/index.js';
// Scaffold
export { scaffold } from './scaffold/index.js';
export type { ProjectValidationResult, ValidationIssue } from './validator/index.js';
// Validator
export { validateProject } from './validator/index.js';
// Version
export { getVersion } from './version.js';
