import type { ExtForgeConfig } from '../config.js';
import type { Browser } from '../manifest/index.js';
import type { Logger } from '../logger/index.js';
import type { BuildResult } from '../builder/index.js';
import type { HMRUpdate } from '../hmr/index.js';

export type ManifestObject = Record<string, unknown>;

export interface EntryDescriptor {
  name: string;
  file: string;
  format: 'esm' | 'iife';
  esbuildOptions?: Record<string, unknown>;
  isContentScript?: boolean;
}

export interface PluginHooks {
  onConfigResolved(fn: (config: ExtForgeConfig) => void | Promise<void>): void;
  onManifestTransform(fn: (manifest: ManifestObject, browser: Browser) => ManifestObject | Promise<ManifestObject>): void;
  onBuildStart(fn: (info: { browser: Browser; dev: boolean }) => void | Promise<void>): void;
  onBuildEntry(fn: (entry: EntryDescriptor) => EntryDescriptor | void | Promise<EntryDescriptor | void>): void;
  onBuildEnd(fn: (result: BuildResult) => void | Promise<void>): void;
  onDevReload(fn: (event: HMRUpdate) => void | Promise<void>): void;
}

export interface PluginContext {
  readonly config: ExtForgeConfig;
  readonly paths: {
    readonly root: string;
    readonly src: string;
    readonly dist: string;
  };
  readonly logger: Logger;
  readonly hooks: PluginHooks;
  addEntry(entry: EntryDescriptor): void;
  emitFile(rel: string, contents: string | Uint8Array): void;
}

export interface ExtForgePluginV1 {
  name: string;
  apiVersion: 1;
  setup(ctx: PluginContext): void | Promise<void>;
}

export interface ExtForgePluginLegacy {
  name: string;
  setup?: (config: ExtForgeConfig) => void | Promise<void>;
  buildStart?: () => void | Promise<void>;
  buildEnd?: (result: unknown) => void | Promise<void>;
}

export type ExtForgePlugin = ExtForgePluginV1 | ExtForgePluginLegacy;

export function isV1Plugin(p: ExtForgePlugin): p is ExtForgePluginV1 {
  return (p as ExtForgePluginV1).apiVersion === 1;
}
