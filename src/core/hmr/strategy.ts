export const HMR_STRATEGY = {
  background:  'extension-reload',
  popup:       'full-reload',
  sidepanel:   'full-reload',
  options:     'full-reload',
  content:     'tab-reload-targeted',
  injected:    'extension-reload',
  manifest:    'extension-reload',
  css:         'css-swap',
  assets:      'extension-reload',
} as const;

export type HMREntryKind = keyof typeof HMR_STRATEGY;
export type HMRStrategy = typeof HMR_STRATEGY[HMREntryKind];
