export interface FieldDoc {
  description: string;
  defaultValue?: string;
  example?: string;
}

export const SCHEMA_DOCS: Record<string, FieldDoc> = {
  'root':       { description: 'Override the project root. Defaults to the directory `extforge` is invoked from.' },
  'browsers':   { description: 'Browsers to build for. ExtForge generates a per-browser manifest into `dist/<browser>/`.', defaultValue: '["chrome", "firefox"]' },
  'manifest':   { description: 'The MV3 manifest, ExtForge-flavored. Browser-specific quirks are handled automatically.' },
  'build.outDir':    { description: 'Output directory for builds.', defaultValue: '"dist"' },
  'build.srcDir':    { description: 'Source directory.', defaultValue: '"src"' },
  'build.sourcemap': { description: 'Emit source maps.', defaultValue: 'false' },
  'build.esbuild':   { description: 'Pass-through esbuild options merged into every entry build.' },
  'dev.port':        { description: 'WebSocket port for the HMR server.', defaultValue: '35729' },
  'dev.host':        { description: 'Host to bind the HMR server to.', defaultValue: '"localhost"' },
  'dev.debounce':    { description: 'Debounce window (ms) for collapsing rapid file changes into one rebuild.', defaultValue: '150' },
  'dev.open':        { description: 'Open chrome://extensions automatically when the dev server starts.', defaultValue: 'false' },
  'dev.strictCompat':{ description: 'Treat cross-browser compat warnings as errors.', defaultValue: 'false' },
  'framework':       { description: 'UI framework. Drives auto-injection of first-party plugins.', defaultValue: '"react"' },
  'css':             { description: 'CSS strategy.', defaultValue: '"tailwind"' },
  'plugins':         { description: 'List of ExtForge plugins. Both the V1 shape and the legacy thin shape are accepted.' },
};
