import type { Browser } from '../manifest/index.js';
import type { ManifestObject, PluginContext } from '../plugins/types.js';

/** Describes a new entry point contributed by a module. */
export interface EntrypointDescriptor {
  /** Logical name used to derive the output filename. */
  name: string;
  /** Absolute or root-relative path to the entry source file. */
  input: string;
  /** Output bundle format. Defaults to `'esm'`. */
  format?: 'esm' | 'iife';
  /** Whether this entry is a content script (affects IIFE wrapping). */
  isContentScript?: boolean;
  /** Extra esbuild options merged into this entry's build. */
  esbuildOptions?: Record<string, unknown>;
}

/**
 * Runtime context injected into every module's `setup()` function. A
 * superset of `PluginContext` — every plugin hook (`ctx.hooks`) is still
 * available, so a module can do anything a plugin can, plus the four
 * capabilities below.
 */
export interface ModuleContext extends PluginContext {
  /** Adds a synthetic entry point to the build (a superset-friendly alias for `addEntry`). */
  addEntrypoint(entry: EntrypointDescriptor): void;
  /**
   * Merges a partial manifest into the final output. Arrays (e.g.
   * `permissions`) are concatenated and de-duplicated; objects are merged
   * recursively; everything else overwrites. Pass a function to compute the
   * patch from the manifest assembled so far and the target browser.
   */
  extendManifest(
    patch: ManifestObject | ((manifest: ManifestObject, browser: Browser) => ManifestObject),
  ): void;
  /**
   * Contributes a block of `.d.ts` source, collected from every active
   * module into a single generated `.extforge/modules.d.ts`.
   */
  addTypeDeclaration(dts: string): void;
  /**
   * Registers a named runtime re-export. Collected from every active module
   * into a generated `.extforge/modules.ts` barrel: `export { name } from
   * from;`. `from` must export a binding with that same name.
   */
  addRuntimeImport(name: string, from: string): void;
}

/** A module written against the ExtForge module API. */
export interface ExtForgeModule {
  /** Unique-ish identifier; surfaces in logs, error messages, and `extforge doctor`. */
  name: string;
  /** Called once after config resolution. Modules register hooks/contributions here. */
  setup(ctx: ModuleContext): void | Promise<void>;
}

/** A `modules: [...]` entry: an already-imported module, or a specifier ExtForge resolves. */
export type ModuleSpecifier = string | ExtForgeModule;

/** Per-module summary of what a module contributed, surfaced by `extforge doctor`. */
export interface ModuleContribution {
  module: string;
  entrypoints: string[];
  manifestPatches: number;
  typeDeclarations: number;
  runtimeImports: string[];
}

/** Identity helper providing type inference for a module definition. */
export function defineModule(mod: ExtForgeModule): ExtForgeModule {
  return mod;
}
