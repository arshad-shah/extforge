// Ambient types for the env vars ExtForge inlines at build time.
// `extforge/env` does not generate this for you — declare the public keys
// your code reads so `import.meta.env.*` is typed.

interface ImportMetaEnv {
  /** Base URL of the backend API. */
  readonly EXTFORGE_PUBLIC_API_BASE: string;
  /** Feature flag, inlined as a string ("true" / "false"). */
  readonly EXTFORGE_PUBLIC_FEATURE_FLAG: string;
  /** Build mode, populated by ExtForge. */
  readonly MODE: 'development' | 'production';
  readonly PROD: string;
  readonly DEV: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
