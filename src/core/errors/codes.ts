export const ERROR_CODES = {
  EXT_CONFIG_INVALID:        'EXT_CONFIG_INVALID',
  EXT_CONFIG_NOT_FOUND:      'EXT_CONFIG_NOT_FOUND',
  EXT_CONFIG_DEPRECATED:     'EXT_CONFIG_DEPRECATED',
  EXT_BUILD_FAILED:          'EXT_BUILD_FAILED',
  EXT_MANIFEST_INVALID:      'EXT_MANIFEST_INVALID',
  EXT_MANIFEST_MISSING_ICON: 'EXT_MANIFEST_MISSING_ICON',
  EXT_DOCTOR_FAILED:         'EXT_DOCTOR_FAILED',
  EXT_COMPAT_UNSUPPORTED:    'EXT_COMPAT_UNSUPPORTED',
  EXT_HMR_PORT_IN_USE:       'EXT_HMR_PORT_IN_USE',
  EXT_NODE_VERSION:          'EXT_NODE_VERSION',
  EXT_PLUGIN_FAILED:         'EXT_PLUGIN_FAILED',
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export const DOCS_BASE = 'https://extforge.arshadshah.com/errors';

export function docsUrlFor(code: ErrorCode): string {
  return `${DOCS_BASE}/${code}`;
}
