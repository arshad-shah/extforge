import type { ExtForgeConfig } from '../config.js';
import type { Browser } from '../manifest/index.js';
import type { Logger } from '../logger/index.js';
import type { BuildResult } from '../builder/index.js';
import type { HMRUpdate } from '../hmr/index.js';

/** An untyped manifest object passed through plugin transform hooks. */
export type ManifestObject = Record<string, unknown>;

/** Describes a single entry point to be bundled by esbuild. */
export interface EntryDescriptor {
  /** Logical name used to derive the output filename. */
  name: string;
  /** Absolute or root-relative path to the entry source file. */
  file: string;
  /** Output bundle format. */
  format: 'esm' | 'iife';
  /** Extra esbuild options merged into this entry's build. */
  esbuildOptions?: Record<string, unknown>;
  /** Whether this entry is a content script (affects IIFE wrapping). */
  isContentScript?: boolean;
}

/** Hook registration methods available inside a plugin's `setup()` call. */
export interface PluginHooks {
  /** Called once after config resolution, before any build. */
  onConfigResolved(fn: (config: ExtForgeConfig) => void | Promise<void>): void;
  /** Called for each browser after the manifest is assembled, allowing mutation. */
  onManifestTransform(fn: (manifest: ManifestObject, browser: Browser) => ManifestObject | Promise<ManifestObject>): void;
  /** Called at the start of each browser build. */
  onBuildStart(fn: (info: { browser: Browser; dev: boolean }) => void | Promise<void>): void;
  /** Called once per entry point, allowing plugins to mutate or replace the descriptor. */
  onBuildEntry(fn: (entry: EntryDescriptor) => EntryDescriptor | void | Promise<EntryDescriptor | void>): void;
  /** Called after all entries for a browser have been bundled. */
  onBuildEnd(fn: (result: BuildResult) => void | Promise<void>): void;
  /** Called in dev mode each time the HMR server dispatches a reload event. */
  onDevReload(fn: (event: HMRUpdate) => void | Promise<void>): void;
}

/** Runtime context injected into every plugin's `setup()` function. */
export interface PluginContext {
  /** The resolved ExtForge configuration for the current build. */
  readonly config: ExtForgeConfig;
  /** Resolved absolute paths for the project root, source, and output directories. */
  readonly paths: {
    /** Absolute path to the project root. */
    readonly root: string;
    /** Absolute path to the source directory. */
    readonly src: string;
    /** Absolute path to the dist/output directory. */
    readonly dist: string;
  };
  /** Logger instance scoped to the plugin runner. */
  readonly logger: Logger;
  /** Hook registration object for this plugin's subscriptions. */
  readonly hooks: PluginHooks;
  /** Adds a synthetic entry point to the build without touching the config. */
  addEntry(entry: EntryDescriptor): void;
  /** Writes a file to the output directory at the given relative path. */
  emitFile(rel: string, contents: string | Uint8Array): void;
}

/** A plugin written against the v1 ExtForge plugin API. */
export interface ExtForgePluginV1 {
  /** Unique-ish identifier; surfaces in logs and error messages. */
  name: string;
  /** Required discriminator; routes the runner to the modern API. */
  apiVersion: 1;
  /** Called once after config resolution. Plugins register hooks here. */
  setup(ctx: PluginContext): void | Promise<void>;
}

/** Thin legacy plugin shape accepted for backwards compatibility. */
export interface ExtForgePluginLegacy {
  /** Unique-ish identifier; surfaces in logs and error messages. */
  name: string;
  /** Optional hook called once with the resolved config. */
  setup?: (config: ExtForgeConfig) => void | Promise<void>;
  /** Optional hook called at the start of each build. */
  buildStart?: () => void | Promise<void>;
  /** Optional hook called after each build completes. */
  buildEnd?: (result: unknown) => void | Promise<void>;
}

export type ExtForgePlugin = ExtForgePluginV1 | ExtForgePluginLegacy;

export function isV1Plugin(p: ExtForgePlugin): p is ExtForgePluginV1 {
  return (p as ExtForgePluginV1).apiVersion === 1;
}
