// Config
export { defineConfig, loadExtForgeConfig, DEFAULT_CONFIG } from './config.js';
export type { ExtForgeConfig, ExtForgePlugin } from './config.js';

// Version
export { getVersion } from './version.js';

// Logger
export { Logger, createLogger, getLogger, setRootLogger, LogLevel, formatDuration, formatFileSize, formatPath } from './logger/index.js';
export type { LogEntry, LogTransport, LoggerOptions } from './logger/index.js';

// Manifest
export { generateManifest, writeManifest, validateManifestConfig, ALL_BROWSERS, AVAILABLE_PERMISSIONS, PERMISSION_GROUPS } from './manifest/index.js';
export type { Browser, ManifestConfig, ManifestPermission, Permission, ValidationResult } from './manifest/index.js';

// Builder
export { build, buildAll, createBuildContext } from './builder/index.js';
export type { BuildOptions, BuildResult } from './builder/index.js';

// HMR
export { createHMRServer, generateHMRClientCode, classifyChange } from './hmr/index.js';
export type { HMRServer, HMRServerOptions, HMRUpdate, HMRUpdateType } from './hmr/index.js';

// Validator
export { validateProject } from './validator/index.js';
export type { ValidationIssue, ProjectValidationResult } from './validator/index.js';

// Scaffold
export { scaffold } from './scaffold/index.js';
export type { ScaffoldOptions, ScaffoldAnswers } from './scaffold/index.js';
