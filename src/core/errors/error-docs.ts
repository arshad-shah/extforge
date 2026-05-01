import type { ErrorCode } from './codes.js';

export interface ErrorDoc {
  title: string;
  description: string;
  whenYouSeeThis: string;
  howToFix: string;
}

export const ERROR_DOCS: Record<ErrorCode, ErrorDoc> = {
  EXT_CONFIG_INVALID: {
    title: 'Configuration is invalid',
    description: 'extforge.config.ts has a value that does not match the schema.',
    whenYouSeeThis: 'A field has the wrong type, an unknown enum value (e.g. browsers: ["brave"]), or a malformed nested option.',
    howToFix: 'Read the per-issue suggestions in the error output. The path (browsers.0, dev.port) tells you exactly which field. The Configuration reference enumerates allowed values.',
  },
  EXT_CONFIG_NOT_FOUND: {
    title: 'No extforge.config found',
    description: 'No extforge.config.ts, .js, or .mjs exists at the project root.',
    whenYouSeeThis: 'You ran an extforge command in a directory that is not an ExtForge project.',
    howToFix: 'Run extforge init to scaffold a project, or cd into an existing ExtForge project before running the command.',
  },
  EXT_CONFIG_DEPRECATED: {
    title: 'Deprecated configuration',
    description: 'A config field is deprecated and will be removed in a future minor.',
    whenYouSeeThis: 'You are using an old config key that has been replaced.',
    howToFix: 'Run extforge upgrade to see the suggested rewrite, or follow the deprecation notice printed alongside this error.',
  },
  EXT_BUILD_FAILED: {
    title: 'Build failed',
    description: 'The bundler (esbuild) could not produce a valid output.',
    whenYouSeeThis: 'A syntax error, an unresolved import, or a malformed esbuild option.',
    howToFix: 'The error output includes the file, line, and column. Fix the syntax error and re-run.',
  },
  EXT_MANIFEST_INVALID: {
    title: 'Manifest is invalid',
    description: 'The generated manifest fails MV3 validation.',
    whenYouSeeThis: 'A required field is missing, or a field has a value the browser rejects.',
    howToFix: 'Run extforge validate to see the detailed errors. Common causes: missing icons, malformed content_scripts, unknown permissions.',
  },
  EXT_MANIFEST_MISSING_ICON: {
    title: 'Required icon is missing',
    description: 'The manifest references an icon size that does not exist on disk.',
    whenYouSeeThis: 'Your manifest declares `icons: { 128: "..." }` but `icons/icon-128.png` is not in the project.',
    howToFix: 'Add the missing PNG to icons/, or run extforge icons to regenerate from icons/icon.svg.',
  },
  EXT_DOCTOR_FAILED: {
    title: 'Doctor checks failed',
    description: 'extforge doctor flagged one or more critical problems.',
    whenYouSeeThis: 'Your environment, config, or project structure has issues that block a successful build.',
    howToFix: 'Read the per-check output. Each failed check carries its own hint.',
  },
  EXT_COMPAT_UNSUPPORTED: {
    title: 'Cross-browser API is unsupported',
    description: 'Code uses a chrome.* API that is not supported on one of your declared target browsers.',
    whenYouSeeThis: 'You called something like chrome.tabGroups.update(...) while targeting Safari.',
    howToFix: 'Either gate the call behind a runtime check, drop the unsupported browser from `browsers`, or suppress per-line with `// extforge-ignore-compat: <reason>`.',
  },
  EXT_HMR_PORT_IN_USE: {
    title: 'HMR port is in use',
    description: 'Another process is bound to the configured HMR port.',
    whenYouSeeThis: 'A previous extforge dev is still running, or another tool is using port 35729.',
    howToFix: 'Stop the conflicting process or pass a different port: extforge dev --port 35730.',
  },
  EXT_NODE_VERSION: {
    title: 'Unsupported Node version',
    description: 'Node major is below the minimum (20).',
    whenYouSeeThis: 'Your local Node is too old.',
    howToFix: 'Upgrade Node to 20 or later. https://nodejs.org',
  },
  EXT_PLUGIN_FAILED: {
    title: 'A plugin threw',
    description: 'A plugin setup or one of its hooks threw an error.',
    whenYouSeeThis: 'A user-supplied or first-party plugin raised an exception during the build.',
    howToFix: 'The error message names the plugin and the hook. Look at that plugin source. If it is a third-party plugin, file an issue against it.',
  },
};
